import { chains, createClient } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const proofPath = resolve(repo, "deploy/proof.json");
const publicProofPath = resolve(repo, "web/public/proof.json");
const sourcePath = resolve(repo, "contracts/changeorder_firewall.py");
const proof = JSON.parse(readFileSync(proofPath, "utf8"));
const client = createClient({ chain: chains.studionet });
const refreshVotes = process.argv.includes("--refresh-votes");

function check(condition, message) {
  if (!condition) throw new Error(`Proof verification failed: ${message}`);
}

function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function sameVotes(left, right) {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

async function transaction(label, hash, expectedExecution, stored) {
  const result = await client.getTransaction({ hash });
  const execution = result.consensus_data?.leader_receipt?.[0]?.execution_result;
  const votes = result.consensus_data?.votes || {};
  check(result.statusName === TransactionStatus.FINALIZED, `${label} is not finalized`);
  check(execution === expectedExecution, `${label} execution is ${execution}, expected ${expectedExecution}`);
  check(Object.values(votes).some(vote => vote === "agree"), `${label} has no recorded agreeing validator vote`);
  if (stored.votes && !refreshVotes) check(sameVotes(stored.votes, votes), `${label} votes changed from recorded proof`);
  if (refreshVotes) {
    stored.leaderExecution = execution;
    stored.votes = votes;
  }
  console.log(`${label}: FINALIZED ${execution}; agree=${Object.values(votes).filter(vote => vote === "agree").length}`);
}

async function externalTransfer(label, child) {
  const result = await client.getTransaction({ hash: child.hash });
  const exactWei = proof.payout.supplierCreditBeforeWithdrawWei;
  check(result.statusName === TransactionStatus.FINALIZED, `${label} is not finalized`);
  check(result.value_credited === true, `${label} value was not credited`);
  check(String(result.value) === exactWei, `${label} amount is not the exact withdrawal`);
  check(result.recipient?.toLowerCase() === proof.participants.supplier.toLowerCase(), `${label} recipient differs`);
  check(result.triggered_by === proof.transactions.withdraw_supplier_credit.hash, `${label} is not linked to the finalized withdrawal`);
  if (child.valueWei && !refreshVotes) check(child.valueWei === String(result.value), `${label} recorded value differs`);
  if (refreshVotes) {
    child.valueWei = String(result.value);
    child.valueCredited = true;
    child.recipient = result.recipient;
    child.parentHash = result.triggered_by;
    child.rawResultName = result.result_name;
  }
  console.log(`${label}: FINALIZED credited=${result.value_credited} value_wei=${result.value}`);
}

async function main() {
  check(proof.schema === "changeorder-firewall-live-proof-v1", "unexpected manifest schema");
  check(proof.chainId === chains.studionet.id, "manifest network differs from StudioNet SDK chain");
  const source = readFileSync(sourcePath, "utf8");
  check(git("hash-object", sourcePath) === proof.contract.sourceGitBlob, "local source blob differs");
  check(git("rev-parse", `${proof.contract.sourceCommit}:contracts/changeorder_firewall.py`) === proof.contract.sourceGitBlob, "pinned source commit differs");
  check(await client.getContractCode(proof.contract.address) === source, "deployed source bytes differ from Git");
  await transaction("deployment", proof.contract.deploymentHash, "SUCCESS", proof.contract);

  for (const [name, step] of Object.entries(proof.transactions)) {
    const expected = name === "stale_T1_claim" ? "ERROR" : "SUCCESS";
    check(step.status === (expected === "ERROR" ? "FINALIZED_EXECUTION_ERROR" : "FINALIZED_SUCCESS"), `${name} manifest status differs`);
    await transaction(name, step.hash, expected, step);
  }
  for (const [index, child] of proof.payout.childTransfers.entries()) {
    await externalTransfer(`withdrawal child ${index + 1}`, child);
  }

  const live = await client.readContract({ address: proof.contract.address, functionName: "get_state", args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  const expected = proof.snapshots.afterAllClaimsAndWithdrawal;
  check(live.revision === expected.revision && live.reserved_wei === expected.reserved_wei, "final revision or reserve differs");
  check(JSON.stringify(live.terms.map(term => [term.id, term.generation, term.approval_generation, term.claimed, term.refunded])) ===
    JSON.stringify(expected.terms.map(term => [term.id, term.generation, term.approval_generation, term.claimed, term.refunded])), "final term state differs");
  check(JSON.stringify(proof.snapshots.afterMaterialAmendment) === JSON.stringify(proof.snapshots.afterRejectedStaleClaim), "recorded stale-claim state changed");
  const credit = await client.readContract({ address: proof.contract.address, functionName: "credit_of", args: [proof.participants.supplier], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  check(String(credit) === "0", "supplier credit is not zero");
  if (refreshVotes) {
    const serialized = JSON.stringify(proof, null, 2) + "\n";
    writeFileSync(proofPath, serialized);
    writeFileSync(publicProofPath, serialized);
    console.log("Recorded finalized execution and vote maps in both proof files.");
  }
  console.log(`PASS: ${Object.keys(proof.transactions).length + 1} finalized IC transactions, ${proof.payout.childTransfers.length} credited external transfer, source equality, final state and zero credit`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
