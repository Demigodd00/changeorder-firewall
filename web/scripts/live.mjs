import { createAccount, createClient, chains, generatePrivateKey } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const walletPath = resolve(repo, "deploy/.wallets.json");
const journalPath = resolve(repo, process.env.CHANGEORDER_LIVE_JOURNAL || "deploy/.live-journal.json");
const sourcePath = resolve(repo, "contracts/changeorder_firewall.py");
const chain = chains.studionet;
const wait = { status: TransactionStatus.FINALIZED, interval: 10_000, retries: 90 };

function save(path, object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(object, null, 2) + "\n", { mode: 0o600, flag: "w" });
}

function wallets() {
  if (!existsSync(walletPath)) {
    const keys = { buyer: generatePrivateKey(), supplier: generatePrivateKey() };
    save(walletPath, keys);
  }
  const keys = JSON.parse(readFileSync(walletPath, "utf8"));
  if (!/^0x[0-9a-fA-F]{64}$/.test(keys.buyer) || !/^0x[0-9a-fA-F]{64}$/.test(keys.supplier)) {
    throw new Error("Test-only wallet file is malformed; no keys were replaced.");
  }
  return { buyer: createAccount(keys.buyer), supplier: createAccount(keys.supplier) };
}

function journal() {
  return existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : {};
}

function client(account) { return createClient({ chain, account }); }

function pushedSource() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const remote = execFileSync("git", ["rev-parse", "origin/main"], { cwd: repo, encoding: "utf8" }).trim();
  if (head !== remote) throw new Error("HEAD is not the pushed origin/main commit.");
  const committed = execFileSync("git", ["show", "HEAD:contracts/changeorder_firewall.py"], { cwd: repo });
  const working = readFileSync(sourcePath);
  if (!working.equals(committed)) throw new Error("Working contract bytes differ from the pushed Git blob.");
  const blob = execFileSync("git", ["rev-parse", "HEAD:contracts/changeorder_firewall.py"], { cwd: repo, encoding: "utf8" }).trim();
  return { head, blob, source: working.toString("utf8") };
}

async function receiptFor(tx, account) {
  await client(account).waitForTransactionReceipt({ hash: tx, ...wait });
  const result = await client(account).getTransaction({ hash: tx });
  const status = result.statusName;
  const execution = result.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log(JSON.stringify({ hash: tx, status, execution, recipient: result.recipient }));
  if (status !== TransactionStatus.FINALIZED || execution !== "SUCCESS") {
    throw new Error("Finalized transaction did not execute successfully; inspect the receipt before retrying.");
  }
  return result;
}

async function finalizedState(address) {
  return client().readContract({ address, functionName: "get_state", args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}

async function writeStage(state, stage, account, method, args = [], value = 0n) {
  state.steps ||= {};
  state.steps[stage] ||= {};
  if (state.steps[stage].status === "FINALIZED_SUCCESS" && state.steps[stage].readBack) {
    return state.steps[stage].readBack;
  }
  if (!state.steps[stage].hash) {
    const hash = await client(account).writeContract({ address: state.address, functionName: method, args, value });
    state.steps[stage].hash = hash;
    save(journalPath, state);
    console.log(`submitted_${stage} ${hash}`);
  }
  const receipt = await receiptFor(state.steps[stage].hash, account);
  state.steps[stage].status = "FINALIZED_SUCCESS";
  state.steps[stage].triggered = receipt.triggered_transactions || [];
  state.steps[stage].readBack = await finalizedState(state.address);
  save(journalPath, state);
  return state.steps[stage].readBack;
}

async function expectedFailureStage(state, stage, account, method, args = []) {
  state.steps ||= {};
  state.steps[stage] ||= {};
  if (state.steps[stage].status === "EXPECTED_FAILURE") return state.steps[stage].readBack;
  const before = await finalizedState(state.address);
  if (!state.steps[stage].hash) {
    const hash = await client(account).writeContract({ address: state.address, functionName: method, args });
    state.steps[stage].hash = hash;
    save(journalPath, state);
    console.log(`submitted_${stage} ${hash}`);
  }
  await client(account).waitForTransactionReceipt({ hash: state.steps[stage].hash, ...wait });
  const receipt = await client(account).getTransaction({ hash: state.steps[stage].hash });
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  if (receipt.statusName !== TransactionStatus.FINALIZED || !leader || leader.execution_result === "SUCCESS") {
    throw new Error("Expected failure was not a finalized execution failure.");
  }
  const after = await finalizedState(state.address);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Failed transaction changed order state.");
  state.steps[stage].status = "EXPECTED_FAILURE";
  state.steps[stage].execution = leader.execution_result;
  state.steps[stage].error = String(leader.error || "").slice(0, 500);
  state.steps[stage].stateUnchanged = true;
  state.steps[stage].readBack = after;
  save(journalPath, state);
  console.log(`expected_failure_${stage} ${receipt.statusName} ${leader.execution_result} ${state.steps[stage].error}`);
  return after;
}

async function main() {
  const command = process.argv[2] || "status";
  const accounts = wallets();
  if (command === "init" || command === "status") {
    const reader = createClient({ chain });
    for (const [role, account] of Object.entries(accounts)) {
      const balance = await reader.getBalance({ address: account.address });
      console.log(`${role} ${account.address} balance_wei=${balance}`);
    }
    console.log(JSON.stringify(journal(), null, 2));
    return;
  }
  if (command === "fund-test-buyer") {
    const state = journal();
    const amount = 1000000000000000n;
    if (!state.testBuyerFundingHash) {
      const buyerBalance = await client().getBalance({ address: accounts.buyer.address });
      if (buyerBalance >= 3000000000000000n) {
        console.log(`buyer_already_funded balance_wei=${buyerBalance}`);
        return;
      }
      if (buyerBalance !== 2000000000000000n) throw new Error("Unexpected buyer balance; inspect before funding.");
      state.testBuyerFundingHash = await client(accounts.supplier).sendTransaction({ to: accounts.buyer.address, value: amount });
      save(journalPath, state);
      console.log(`submitted_test_buyer_funding ${state.testBuyerFundingHash}`);
    }
    await client().waitForTransactionReceipt({ hash: state.testBuyerFundingHash, ...wait });
    const transfer = await client().getTransaction({ hash: state.testBuyerFundingHash });
    if (transfer.statusName !== TransactionStatus.FINALIZED || transfer.value_credited !== true ||
        transfer.recipient?.toLowerCase() !== accounts.buyer.address.toLowerCase() ||
        String(transfer.value) !== String(amount)) throw new Error("Test-wallet funding did not finalize as expected.");
    state.testBuyerFundingFinalized = true;
    save(journalPath, state);
    console.log(`funded_test_buyer ${state.testBuyerFundingHash}`);
    return;
  }
  if (command === "screen") {
    const state = journal();
    if (!state.address || state.deployStatus !== "FINALIZED_SUCCESS") throw new Error("Finalize the deployment first.");
    if (state.sourceBlob !== pushedSource().blob) throw new Error("Contract source changed since deployment.");
    for (let index = 0; index < 3; index++) {
      const after = await writeStage(state, `check_T${index + 1}`, accounts.buyer, "check_term", [index]);
      console.log(`check_T${index + 1}_verdict ${after.checks[index]}`);
      if (after.checks[index] !== "OBSERVABLE") throw new Error("Unexpected observability judgment; investigate without retrying.");
    }
    return;
  }
  if (command === "activate") {
    const state = journal();
    if (!state.address || state.deployStatus !== "FINALIZED_SUCCESS") throw new Error("Finalize the deployment first.");
    if (state.sourceBlob !== pushedSource().blob) throw new Error("Contract source changed since deployment.");
    const before = await finalizedState(state.address);
    if (!before.checks.every(verdict => verdict === "OBSERVABLE")) throw new Error("Screening has not passed for every term.");
    const total = BigInt(before.total_wei);
    const funded = await writeStage(state, "fund_exact", accounts.buyer, "fund", [], total);
    if (funded.status !== "AWAITING_SUPPLIER" || funded.reserved_wei !== String(total)) throw new Error("Funding did not reserve the exact amount.");
    console.log(`funded_wei ${funded.reserved_wei}`);
    const accepted = await writeStage(state, "supplier_accept", accounts.supplier, "accept");
    if (accepted.status !== "ACTIVE") throw new Error("Supplier acceptance did not activate the order.");
    console.log(`activated_order ${state.address}`);
    for (let index = 0; index < 3; index++) {
      const after = await writeStage(state, `approve_T${index + 1}_v0`, accounts.buyer, "approve_term", [index]);
      if (after.terms[index].approval_generation !== after.terms[index].generation) throw new Error("Approval did not bind to the current generation.");
      console.log(`approved_T${index + 1}_generation ${after.terms[index].generation}`);
    }
    return;
  }
  if (command === "amend") {
    const state = journal();
    if (!state.address || state.sourceBlob !== pushedSource().blob) throw new Error("Deployment or source is not verified.");
    const before = await finalizedState(state.address);
    if (state.steps?.apply_material_T1?.hash) {
      const applied = await writeStage(state, "apply_material_T1", accounts.buyer, "finalize_amendment");
      const generations = applied.terms.map(term => term.generation);
      if (applied.revision !== 1 || JSON.stringify(generations) !== JSON.stringify([1, 0, 1])) throw new Error("Saved amendment does not match current finalized state.");
      console.log(`applied_generations ${JSON.stringify(generations)}`);
      return;
    }
    if (before.status !== "ACTIVE" || before.terms.some(term => term.approval_generation !== term.generation)) throw new Error("All initial approvals must be current first.");
    const newText = "Deliver a CSV export containing id, date and SKU columns; quantity and price columns are not required.";
    const proposed = await writeStage(state, "propose_material_T1", accounts.buyer, "propose_amendment", [JSON.stringify([{ id: "T1", new_text: newText }])]);
    if (proposed.amendment?.phase !== "PROPOSED") throw new Error("Amendment proposal did not open.");
    const signed = await writeStage(state, "sign_material_T1", accounts.supplier, "sign_amendment");
    if (signed.amendment?.phase !== "REVIEW") throw new Error("Amendment review did not open.");
    const screened = await writeStage(state, "screen_material_T1", accounts.buyer, "screen_edit", [0]);
    if (screened.amendment?.edits?.[0]?.screen !== "OBSERVABLE") throw new Error("Unexpected amendment screening judgment; do not retry.");
    const judged = await writeStage(state, "judge_material_T1", accounts.buyer, "judge_edit", [0]);
    const verdict = judged.amendment?.edits?.[0]?.material;
    console.log(`materiality_verdict ${verdict}`);
    if (verdict !== "MATERIAL") throw new Error("Unexpected materiality judgment; investigate before finalizing.");
    const applied = await writeStage(state, "apply_material_T1", accounts.buyer, "finalize_amendment");
    const generations = applied.terms.map(term => term.generation);
    if (applied.revision !== 1 || JSON.stringify(generations) !== JSON.stringify([1, 0, 1])) throw new Error("Dependency propagation did not match the expected [1,0,1] generations.");
    console.log(`applied_generations ${JSON.stringify(generations)}`);
    return;
  }
  if (command === "settle") {
    const state = journal();
    if (!state.address || state.sourceBlob !== pushedSource().blob) throw new Error("Deployment or source is not verified.");
    const before = await finalizedState(state.address);
    if (state.supplierCreditAfterWithdraw === "0" && state.steps?.withdraw_supplier_credit?.status === "FINALIZED_SUCCESS") {
      console.log(`supplier_withdrawal balance_before=${state.supplierBalanceBeforeWithdraw} balance_after=${state.supplierBalanceAfterWithdraw}`);
      return;
    }
    if (before.revision !== 1 || JSON.stringify(before.terms.map(term => term.generation)) !== JSON.stringify([1, 0, 1])) throw new Error("Material amendment not verified.");
    await expectedFailureStage(state, "stale_T1_claim", accounts.supplier, "claim_term", [0]);
    const independent = await writeStage(state, "claim_unaffected_T2", accounts.supplier, "claim_term", [1]);
    if (!independent.terms[1].claimed || independent.reserved_wei !== "2000000000000000") throw new Error("Unaffected T2 did not settle as expected.");
    for (const index of [0, 2]) {
      const approved = await writeStage(state, `reapprove_T${index + 1}_v1`, accounts.buyer, "approve_term", [index]);
      if (approved.terms[index].approval_generation !== 1) throw new Error("Fresh approval did not bind to generation 1.");
      const claimed = await writeStage(state, `claim_T${index + 1}_v1`, accounts.supplier, "claim_term", [index]);
      if (!claimed.terms[index].claimed) throw new Error("Freshly approved term did not settle.");
    }
    if (!state.steps?.withdraw_supplier_credit?.hash) {
      const creditBefore = await client().readContract({ address: state.address, functionName: "credit_of", args: [accounts.supplier.address], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
      if (String(creditBefore) !== "3000000000000000") throw new Error("Supplier pull credit is not exactly 0.003 GEN.");
      state.supplierCreditBeforeWithdraw = String(creditBefore);
      state.supplierBalanceBeforeWithdraw = String(await client().getBalance({ address: accounts.supplier.address }));
      save(journalPath, state);
    }
    const withdrawn = await writeStage(state, "withdraw_supplier_credit", accounts.supplier, "withdraw_credit");
    if (withdrawn.reserved_wei !== "0") throw new Error("Reserved balance was not exhausted.");
    state.withdrawalChildren ||= [];
    for (const hash of state.steps.withdraw_supplier_credit.triggered || []) {
      if (state.withdrawalChildren.some(child => child.hash === hash)) continue;
      await client(accounts.supplier).waitForTransactionReceipt({ hash, ...wait });
      const child = await client(accounts.supplier).getTransaction({ hash });
      if (child.statusName !== TransactionStatus.FINALIZED) throw new Error("Withdrawal child transfer did not finalize.");
      state.withdrawalChildren.push({ hash, status: child.statusName });
      save(journalPath, state);
    }
    state.supplierCreditAfterWithdraw = String(await client().readContract({ address: state.address, functionName: "credit_of", args: [accounts.supplier.address], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }));
    state.supplierBalanceAfterWithdraw = String(await client().getBalance({ address: accounts.supplier.address }));
    save(journalPath, state);
    if (state.supplierCreditAfterWithdraw !== "0" || BigInt(state.supplierBalanceAfterWithdraw) - BigInt(state.supplierBalanceBeforeWithdraw) !== 3000000000000000n) {
      throw new Error("Pull credit or wallet balance did not settle to the exact 0.003 GEN payout.");
    }
    console.log(`supplier_withdrawal credit=${state.supplierCreditAfterWithdraw} balance_before=${state.supplierBalanceBeforeWithdraw} balance_after=${state.supplierBalanceAfterWithdraw}`);
    return;
  }
  if (command !== "deploy") throw new Error("Use init, status, fund-test-buyer, deploy, screen, activate, amend, or settle.");
  const { head, blob, source } = pushedSource();
  const state = journal();
  if (state.commit && state.commit !== head) {
    const originalBlob = execFileSync("git", ["rev-parse", `${state.commit}:contracts/changeorder_firewall.py`], { cwd: repo, encoding: "utf8" }).trim();
    if (originalBlob !== blob) throw new Error("Contract source changed since submission; reconcile before any further transaction.");
  }
  state.commit ||= head;
  state.sourceBlob = blob;
  state.buyer = accounts.buyer.address;
  state.supplier = accounts.supplier.address;
  const terms = [
    { id: "T1", text: "Deliver a CSV export containing id, date, SKU, quantity and price columns.", requires: [], amount_wei: "1000000000000000" },
    { id: "T2", text: "Deliver a Markdown setup guide with installation and troubleshooting sections.", requires: [], amount_wei: "1000000000000000" },
    { id: "T3", text: "Deliver an integration package that imports the T1 CSV schema.", requires: ["T1"], amount_wei: "1000000000000000" },
  ];
  state.constructor = { supplier: accounts.supplier.address, title: "Export and integration package", terms };
  if (!state.deployHash) {
    const tx = await client(accounts.buyer).deployContract({ code: source, args: [accounts.supplier.address, state.constructor.title, JSON.stringify(terms)] });
    state.deployHash = tx;
    save(journalPath, state);
    console.log(`submitted_deployment ${tx}`);
  }
  const receipt = await receiptFor(state.deployHash, accounts.buyer);
  state.address = receipt.txDataDecoded?.contractAddress || receipt.recipient;
  if (!/^0x[0-9a-fA-F]{40}$/.test(state.address || "")) throw new Error("Successful deploy but no address in receipt.");
  state.deployStatus = "FINALIZED_SUCCESS";
  state.initialRead = await finalizedState(state.address);
  const deployedSource = await client(accounts.buyer).getContractCode(state.address);
  if (deployedSource !== source) throw new Error("On-chain source differs from the pushed Git blob.");
  state.sourceMatchesGitBlob = true;
  save(journalPath, state);
  console.log(`deployed_contract ${state.address} status=${state.initialRead.status}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
