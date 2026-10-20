import { createAccount, createClient, chains } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const journalPath = resolve(repo, "deploy/.browser-wallet-patch-journal.json");
const walletPath = resolve(repo, "deploy/.wallets.json");
const sourceCommit = "ce25e284b0878819a8744d33d72ad3006cd7f333";
const sourceBlob = "845d5613b8081ce520c39310e69a0c88a8ce97c9";
const sourcePath = "contracts/changeorder_firewall.py";
const buyer = "0x8d74F33835A2301C3c19ee1079bEE68885ed9c9c";
const amount = 100000000000000n;
const wait = { status: TransactionStatus.FINALIZED, interval: 10000, retries: 90 };
const reader = createClient({ chain: chains.studionet });

function assert(ok, message) { if (!ok) throw new Error(message); }
function same(a, b) { return a?.toLowerCase() === b?.toLowerCase(); }
function save(journal) { writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 }); }
function load() { return existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { steps: {} }; }
function supplierAccount() {
  const key = JSON.parse(readFileSync(walletPath, "utf8")).supplier;
  assert(/^0x[0-9a-fA-F]{64}$/.test(key), "Test supplier key is unavailable or malformed");
  return createAccount(key);
}
function pinnedSource() {
  const blob = execFileSync("git", ["rev-parse", `${sourceCommit}:${sourcePath}`], { cwd: repo, encoding: "utf8" }).trim();
  assert(blob === sourceBlob, "Pinned source blob mismatch");
  const bytes = execFileSync("git", ["show", `${sourceCommit}:${sourcePath}`], { cwd: repo });
  assert(readFileSync(resolve(repo, sourcePath)).equals(bytes), "Current working source differs from pinned source");
  return bytes.toString("utf8");
}
async function receipt(hash, kind = "ic") {
  await reader.waitForTransactionReceipt({ hash, ...wait });
  const tx = await reader.getTransaction({ hash });
  assert(tx.statusName === TransactionStatus.FINALIZED, `Transaction not finalized: ${hash}`);
  if (kind === "ic") assert(tx.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS", `IC execution failed: ${hash}`);
  else assert(tx.value_credited === true, `External transfer not credited: ${hash}`);
  return tx;
}
async function order(address) {
  return reader.readContract({ address, functionName: "get_state", args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}
async function credit(address, supplier) {
  return String(await reader.readContract({ address, functionName: "credit_of", args: [supplier], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }));
}
async function supplierWrite(journal, step, method, args = []) {
  const account = supplierAccount();
  const writer = createClient({ chain: chains.studionet, account });
  journal.steps[step] ||= {};
  if (!journal.steps[step].hash) {
    journal.steps[step].hash = await writer.writeContract({ address: journal.address, functionName: method, args });
    save(journal);
    console.log(`submitted ${step} ${journal.steps[step].hash}`);
  }
  const tx = await receipt(journal.steps[step].hash);
  assert(same(tx.sender, account.address) && same(tx.recipient, journal.address) && String(tx.value || 0) === "0", `Unexpected ${step} receipt`);
  journal.steps[step].finalized = true;
  journal.steps[step].children = tx.triggered_transactions || [];
  save(journal);
  return order(journal.address);
}
async function main() {
  const command = process.argv[2] || "status";
  const journal = load();
  const supplier = supplierAccount().address;
  if (command === "status") {
    console.log(JSON.stringify({ buyer, supplier, buyerBalanceWei: String(await reader.getBalance({ address: buyer })), supplierBalanceWei: String(await reader.getBalance({ address: supplier })), journal }, null, 2));
    return;
  }
  if (command === "fund-buyer") {
    journal.steps.testFunding ||= {};
    if (!journal.steps.testFunding.hash) {
      const before = await reader.getBalance({ address: buyer });
      assert(before === 0n, `Buyer balance is ${before}; inspect before funding again`);
      journal.steps.testFunding.hash = await createClient({ chain: chains.studionet, account: supplierAccount() }).sendTransaction({ to: buyer, value: amount });
      save(journal);
      console.log(`submitted testFunding ${journal.steps.testFunding.hash}`);
    }
    const tx = await receipt(journal.steps.testFunding.hash, "external");
    assert(same(tx.sender, supplier) && same(tx.recipient, buyer) && String(tx.value) === String(amount), "Test funding receipt mismatch");
    journal.steps.testFunding.finalized = true;
    save(journal);
    console.log(`finalized testFunding ${tx.hash || journal.steps.testFunding.hash}`);
    return;
  }
  if (command === "record-deploy") {
    const hash = process.argv[3];
    assert(/^0x[0-9a-fA-F]{64}$/.test(hash || ""), "Pass the browser deployment hash");
    assert(!journal.steps.deploy?.hash || journal.steps.deploy.hash === hash, "A different deployment is already recorded");
    journal.steps.deploy = { hash };
    save(journal);
    const tx = await receipt(hash);
    assert(same(tx.sender, buyer) && String(tx.value || 0) === "0", "Browser deployment sender/value mismatch");
    journal.address = tx.txDataDecoded?.contractAddress || tx.recipient;
    assert(/^0x[0-9a-fA-F]{40}$/.test(journal.address || ""), "Deployment address missing");
    assert(await reader.getContractCode(journal.address) === pinnedSource(), "Deployed contract code differs from pinned patched source");
    const state = await order(journal.address);
    assert(same(state.buyer, buyer) && same(state.supplier, supplier) && state.terms.length === 1 && state.total_wei === String(amount), "Initial order state mismatch");
    journal.steps.deploy.finalized = true;
    journal.source = { commit: sourceCommit, gitBlob: sourceBlob, path: sourcePath };
    save(journal);
    console.log(`verified patched browser deployment ${journal.address}`);
    return;
  }
  assert(journal.address && journal.steps.deploy?.finalized, "Verify browser deployment first");
  if (command === "check") {
    const state = await supplierWrite(journal, "checkTerm", "check_term", [0]);
    assert(state.checks[0] === "OBSERVABLE", "Unexpected screening judgment");
    console.log(`screened ${state.checks[0]}`);
    return;
  }
  if (command === "record-fund" || command === "record-approve") {
    const hash = process.argv[3];
    const step = command === "record-fund" ? "fund" : "approveTerm";
    assert(/^0x[0-9a-fA-F]{64}$/.test(hash || ""), `Pass the browser ${step} hash`);
    assert(!journal.steps[step]?.hash || journal.steps[step].hash === hash, `A different ${step} is already recorded`);
    journal.steps[step] = { hash };
    save(journal);
    const tx = await receipt(hash);
    assert(same(tx.sender, buyer) && same(tx.recipient, journal.address) && String(tx.value || 0) === String(step === "fund" ? amount : 0n), `Browser ${step} sender/recipient/value mismatch`);
    const state = await order(journal.address);
    if (step === "fund") assert(state.status === "AWAITING_SUPPLIER" && state.reserved_wei === String(amount), "Funded order state mismatch");
    else assert(state.terms[0].approval_generation === state.terms[0].generation, "Current-generation approval missing");
    journal.steps[step].finalized = true;
    save(journal);
    console.log(`verified browser ${step} ${hash}`);
    return;
  }
  if (command === "accept") {
    assert(journal.steps.fund?.finalized, "Verify exact browser funding first");
    const state = await supplierWrite(journal, "accept", "accept");
    assert(state.status === "ACTIVE", "Order not active");
    console.log("supplier accepted");
    return;
  }
  if (command === "claim") {
    assert(journal.steps.approveTerm?.finalized, "Verify browser approval first");
    const state = await supplierWrite(journal, "claimTerm", "claim_term", [0]);
    assert(state.terms[0].claimed && state.reserved_wei === "0", "Claim did not settle exact term");
    assert(await credit(journal.address, supplier) === String(amount), "Supplier credit does not equal exact tranche");
    console.log("supplier claimed exact tranche");
    return;
  }
  if (command === "withdraw") {
    assert(journal.steps.claimTerm?.finalized, "Claim first");
    if (!journal.supplierBalanceBeforeWei) {
      journal.supplierBalanceBeforeWei = String(await reader.getBalance({ address: supplier }));
      save(journal);
    }
    await supplierWrite(journal, "withdrawCredit", "withdraw_credit");
    const children = journal.steps.withdrawCredit.children;
    assert(children.length === 1, "Expected one payout child");
    const child = await receipt(children[0], "external");
    assert(same(child.sender, journal.address) && same(child.recipient, supplier) && String(child.value) === String(amount) && child.triggered_by === journal.steps.withdrawCredit.hash, "Payout child mismatch");
    journal.steps.payoutChild = { hash: children[0], finalized: true };
    journal.supplierBalanceAfterWei = String(await reader.getBalance({ address: supplier }));
    assert(BigInt(journal.supplierBalanceAfterWei) - BigInt(journal.supplierBalanceBeforeWei) === amount, "Supplier wallet balance did not rise by exact tranche");
    assert(await credit(journal.address, supplier) === "0", "Supplier credit not cleared");
    save(journal);
    console.log(`verified external payout ${children[0]}`);
    return;
  }
  throw new Error("Use status, fund-buyer, record-deploy <hash>, check, record-fund <hash>, accept, record-approve <hash>, claim, or withdraw");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
