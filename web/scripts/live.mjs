import { createAccount, createClient, chains, generatePrivateKey } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const walletPath = resolve(repo, "deploy/.wallets.json");
const journalPath = resolve(repo, "deploy/.live-journal.json");
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
  if (command !== "deploy") throw new Error("Use init, status, or deploy.");
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
  state.initialRead = await client(accounts.buyer).readContract({ address: state.address, functionName: "get_state", args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  const deployedSource = await client(accounts.buyer).getContractCode(state.address);
  if (deployedSource !== source) throw new Error("On-chain source differs from the pushed Git blob.");
  state.sourceMatchesGitBlob = true;
  save(journalPath, state);
  console.log(`deployed_contract ${state.address} status=${state.initialRead.status}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
