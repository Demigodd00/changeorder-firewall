import { chains, createClient } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const proof = JSON.parse(readFileSync(resolve(repo, "deploy/browser-wallet-proof.json"), "utf8"));
const sourcePath = resolve(repo, proof.source.path);
const client = createClient({ chain: chains.studionet });

function check(condition, message) {
  if (!condition) throw new Error(`Browser proof verification failed: ${message}`);
}

function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function sameAddress(actual, expected) {
  return actual?.toLowerCase() === expected.toLowerCase();
}

async function verifyIntelligentContractTx(name, entry) {
  const tx = await client.getTransaction({ hash: entry.hash });
  check(tx.statusName === TransactionStatus.FINALIZED, `${name} is not finalized`);
  check(tx.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS", `${name} leader execution failed`);
  check(Object.values(tx.consensus_data?.votes || {}).includes("agree"), `${name} has no agreeing validator vote`);
  check(sameAddress(tx.sender, proof.participants[entry.signer]), `${name} signer differs`);
  check(sameAddress(tx.recipient, proof.contract.address), `${name} recipient differs`);
  check(String(tx.value || "0") === entry.valueWei, `${name} value differs`);
  return tx;
}

async function verifyExternalTx(name, entry, sender, recipient) {
  const tx = await client.getTransaction({ hash: entry.hash });
  check(tx.statusName === TransactionStatus.FINALIZED, `${name} is not finalized`);
  check(tx.value_credited === true, `${name} did not credit value`);
  check(sameAddress(tx.sender, sender), `${name} sender differs`);
  check(sameAddress(tx.recipient, recipient), `${name} recipient differs`);
  check(String(tx.value) === entry.valueWei, `${name} value differs`);
  return tx;
}

async function main() {
  check(proof.schema === "changeorder-firewall-browser-wallet-proof-v1", "unexpected schema");
  check(proof.chainId === chains.studionet.id, "chain differs from StudioNet");
  check(git("rev-parse", `${proof.source.commit}:${proof.source.path}`) === proof.source.gitBlob, "pinned source blob differs");
  check(git("hash-object", sourcePath) === proof.source.gitBlob, "working contract source differs");
  check(await client.getContractCode(proof.contract.address) === readFileSync(sourcePath, "utf8"), "deployed contract source differs");

  const txs = proof.transactions;
  check(txs.deploy.interface === "browser-wallet" && txs.fund.interface === "browser-wallet" &&
    txs.approveTerm.interface === "browser-wallet", "browser scope changed in manifest");
  await verifyExternalTx("test funding", txs.testFunding, proof.participants.supplier, proof.participants.buyer);
  for (const name of ["deploy", "checkTerm", "fund", "accept", "approveTerm", "claimTerm", "withdrawCredit"]) {
    await verifyIntelligentContractTx(name, txs[name]);
  }
  const withdrawal = await client.getTransaction({ hash: txs.withdrawCredit.hash });
  check(withdrawal.triggered_transactions?.includes(txs.payoutChild.hash), "payout child is not linked to withdrawal");
  const payout = await verifyExternalTx("payout child", txs.payoutChild, proof.contract.address, proof.participants.supplier);
  check(payout.triggered_by === txs.withdrawCredit.hash, "payout child parent differs");

  const state = await client.readContract({
    address: proof.contract.address, functionName: "get_state", args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  const expected = proof.observedFinalState;
  const term = state.terms?.[0];
  check(sameAddress(state.buyer, proof.participants.buyer) && sameAddress(state.supplier, proof.participants.supplier), "participants differ");
  check(state.status === expected.status && state.revision === expected.revision, "status or revision differs");
  check(JSON.stringify(state.checks) === JSON.stringify(expected.checks), "screening result differs");
  check(state.total_wei === expected.totalWei && state.reserved_wei === expected.reservedWei, "order accounting differs");
  check(state.terms.length === 1 && term.id === expected.termId && term.generation === expected.termGeneration &&
    term.approval_generation === expected.approvalGeneration && term.claimed === expected.claimed &&
    term.refunded === expected.refunded, "term settlement differs");
  const credit = await client.readContract({
    address: proof.contract.address, functionName: "credit_of", args: [proof.participants.supplier],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  check(String(credit) === expected.supplierCreditWei, "supplier credit differs");
  check(BigInt(proof.observedPayout.supplierBalanceAfterWei) - BigInt(proof.observedPayout.supplierBalanceBeforeWei) ===
    BigInt(proof.observedPayout.increaseWei), "recorded historical balance delta is inconsistent");
  check(proof.observedPayout.increaseWei === txs.payoutChild.valueWei, "recorded balance delta differs from payout");
  console.log("PASS: buyer browser-wallet deploy/fund/approve, four script-signed IC actions, exact finalized payout, source equality and final order state");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
