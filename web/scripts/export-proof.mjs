import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const journal = JSON.parse(readFileSync(resolve(repo, "deploy/.live-journal.json"), "utf8"));
const source = readFileSync(resolve(repo, "contracts/changeorder_firewall.py"), "utf8");
const sourceBlob = execFileSync("git", ["hash-object", "contracts/changeorder_firewall.py"], { cwd: repo, encoding: "utf8" }).trim();
const explorer = "https://explorer-studio.genlayer.com";

function requireProof(condition, message) {
  if (!condition) throw new Error(`Proof export refused: ${message}`);
}

const required = [
  "check_T1", "check_T2", "check_T3", "fund_exact", "supplier_accept",
  "approve_T1_v0", "approve_T2_v0", "approve_T3_v0",
  "propose_material_T1", "sign_material_T1", "screen_material_T1",
  "judge_material_T1", "apply_material_T1", "stale_T1_claim",
  "claim_unaffected_T2", "reapprove_T1_v1", "claim_T1_v1",
  "reapprove_T3_v1", "claim_T3_v1", "withdraw_supplier_credit",
];

requireProof(journal.deployStatus === "FINALIZED_SUCCESS" && journal.sourceMatchesGitBlob === true, "deployment or source equality is unverified");
requireProof(sourceBlob === journal.sourceBlob, "contract source blob differs from deployed source");
requireProof(journal.initialRead?.status === "CHECKING", "initial deployed state is missing");
for (const name of required) {
  const step = journal.steps?.[name];
  requireProof(step?.hash && step.readBack, `${name} lacks a hash or finalized read-back`);
  requireProof(step.status === (name === "stale_T1_claim" ? "EXPECTED_FAILURE" : "FINALIZED_SUCCESS"), `${name} has the wrong result`);
}

const applied = journal.steps.apply_material_T1.readBack;
const stale = journal.steps.stale_T1_claim.readBack;
const independent = journal.steps.claim_unaffected_T2.readBack;
const final = journal.steps.withdraw_supplier_credit.readBack;
const generations = applied.terms.map(term => term.generation);
const approvals = applied.terms.map(term => term.approval_generation);
requireProof(applied.revision === 1 && JSON.stringify(generations) === "[1,0,1]", "material dependency propagation differs");
requireProof(JSON.stringify(approvals) === "[0,0,0]", "pre-amendment approvals were not retained as stale/current generations");
requireProof(applied.history?.at(-1)?.edits?.[0]?.material === "MATERIAL", "live materiality verdict differs");
requireProof(JSON.stringify(applied) === JSON.stringify(stale), "failed stale claim changed state");
requireProof(independent.terms[1].claimed === true && independent.terms[0].claimed === false && independent.terms[2].claimed === false, "independent tranche did not claim alone");
requireProof(final.reserved_wei === "0" && final.terms.every(term => term.claimed), "final tranches did not settle");
requireProof(journal.supplierCreditBeforeWithdraw === "3000000000000000" && journal.supplierCreditAfterWithdraw === "0", "supplier pull credit was not exact");
requireProof(BigInt(journal.supplierBalanceAfterWithdraw) - BigInt(journal.supplierBalanceBeforeWithdraw) === 3000000000000000n, "supplier wallet did not receive exact test GEN");
requireProof(journal.withdrawalChildren?.length > 0 && journal.withdrawalChildren.every(child => child.status === "FINALIZED"), "child transfer finality is unverified");

const transactions = Object.fromEntries(required.map(name => {
  const step = journal.steps[name];
  return [name, {
    hash: step.hash,
    explorer: `${explorer}/tx/${step.hash}`,
    status: name === "stale_T1_claim" ? "FINALIZED_EXECUTION_ERROR" : "FINALIZED_SUCCESS",
    ...(name === "stale_T1_claim" ? { execution: step.execution, stateUnchanged: true } : {}),
  }];
}));

const proof = {
  schema: "changeorder-firewall-live-proof-v1",
  network: "GenLayer StudioNet",
  chainId: 61999,
  contract: {
    address: journal.address,
    explorer: `${explorer}/address/${journal.address}`,
    deploymentHash: journal.deployHash,
    deploymentExplorer: `${explorer}/tx/${journal.deployHash}`,
    deploymentStatus: journal.deployStatus,
    sourceCommit: journal.commit,
    sourceGitBlob: journal.sourceBlob,
    sourceMatchesDeployedCode: true,
    pinnedRunner: source.split(/\r?\n/, 1)[0],
  },
  participants: { buyer: journal.buyer, supplier: journal.supplier, testWalletsOnly: true },
  scenario: "A signed T1 CSV-schema amendment removes required columns. T3 depends on T1; T2 is independent. Each term has a fixed 0.001 test GEN tranche.",
  transactions,
  snapshots: {
    initial: journal.initialRead,
    afterMaterialAmendment: applied,
    afterRejectedStaleClaim: stale,
    afterUnaffectedT2Claim: independent,
    afterAllClaimsAndWithdrawal: final,
  },
  payout: {
    supplierCreditBeforeWithdrawWei: journal.supplierCreditBeforeWithdraw,
    supplierCreditAfterWithdrawWei: journal.supplierCreditAfterWithdraw,
    supplierWalletBeforeWei: journal.supplierBalanceBeforeWithdraw,
    supplierWalletAfterWei: journal.supplierBalanceAfterWithdraw,
    childTransfers: journal.withdrawalChildren.map(child => ({ hash: child.hash, explorer: `${explorer}/tx/${child.hash}`, status: child.status })),
  },
  limits: [
    "The buyer's approval attests acceptance; the contract does not independently prove physical delivery or supplier identity.",
    "This proof uses script-controlled test wallets. Browser-wallet and mobile-wallet interaction have not been verified end to end.",
    "StudioNet uses test GEN; this is not a production-funds security audit.",
  ],
};

for (const path of [resolve(repo, "deploy/proof.json"), resolve(repo, "web/public/proof.json")]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(proof, null, 2) + "\n");
  console.log(`wrote ${path}`);
}
