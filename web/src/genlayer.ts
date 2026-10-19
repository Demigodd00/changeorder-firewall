import { chains, createClient } from "genlayer-js";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import type { Hash } from "genlayer-js/types";
import type { OrderState } from "./types";
import contractSource from "../../contracts/changeorder_firewall.py?raw";

export type Provider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};

export const studioChainId = chains.studionet.id;
export const reader = createClient({ chain: chains.studionet });
export const validAddress = (value: string): value is `0x${string}` =>
  /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
export const same = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
export const gen = (wei: string) => {
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}${fraction ? "." + fraction : ""} GEN`;
};
export const date = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleString() : "Not set";
export const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 700) : "Request failed; check the transaction before retrying.";

export async function readOrder(address: `0x${string}`): Promise<OrderState> {
  return await reader.readContract({
    address,
    functionName: "get_state",
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  }) as OrderState;
}

export async function readCredit(address: `0x${string}`, walletAddress: `0x${string}`): Promise<string> {
  return String(await reader.readContract({
    address,
    functionName: "credit_of",
    args: [walletAddress],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  }));
}

export async function verifyWallet(provider: Provider, account: string): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (!Array.isArray(accounts) || !same(String(accounts[0] || ""), account)) {
    throw new Error("Wallet account changed. Reconnect before signing.");
  }
  if (BigInt(String(chainId)) !== BigInt(studioChainId)) {
    throw new Error("Switch the selected wallet to GenLayer StudioNet.");
  }
}

export async function submitWrite(input: {
  provider: Provider;
  walletAddress: `0x${string}`;
  contractAddress: `0x${string}`;
  method: string;
  args?: unknown[];
  value?: bigint;
  onSubmitted: (txId: string) => void;
}): Promise<void> {
  await verifyWallet(input.provider, input.walletAddress);
  const client = createClient({
    chain: chains.studionet,
    account: input.walletAddress,
    provider: input.provider as never,
  });
  const call = {
    address: input.contractAddress,
    functionName: input.method,
    args: (input.args || []) as never[],
    value: input.value ?? 0n,
  };
  await verifyWallet(input.provider, input.walletAddress);
  const hash = await client.writeContract(call);
  input.onSubmitted(hash);
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED });
  const receipt = await client.getTransaction({ hash });
  const leaderExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (receipt.statusName !== TransactionStatus.FINALIZED || leaderExecution !== "SUCCESS" || (receipt.txExecutionResultName && receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN)) {
    throw new Error(`Transaction did not finalize successfully: ${receipt.statusName} / ${leaderExecution || receipt.txExecutionResultName}. Do not resubmit until you inspect it.`);
  }
}

export async function deployOrder(input: {
  provider: Provider;
  walletAddress: `0x${string}`;
  supplier: `0x${string}`;
  title: string;
  termsJson: string;
  onSubmitted: (txId: string) => void;
}): Promise<`0x${string}`> {
  await verifyWallet(input.provider, input.walletAddress);
  const client = createClient({
    chain: chains.studionet,
    account: input.walletAddress,
    provider: input.provider as never,
  });
  const hash = await client.deployContract({
    code: contractSource,
    args: [input.supplier, input.title, input.termsJson],
  });
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet did not return a valid deployment transaction hash.");
  input.onSubmitted(hash);
  await client.waitForTransactionReceipt({ hash: hash as Hash, status: TransactionStatus.FINALIZED });
  const receipt = await client.getTransaction({ hash: hash as Hash });
  const leaderExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (receipt.statusName !== TransactionStatus.FINALIZED || leaderExecution !== "SUCCESS" || (receipt.txExecutionResultName && receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN)) {
    throw new Error(`Deployment did not finalize successfully: ${receipt.statusName} / ${leaderExecution || receipt.txExecutionResultName}. Inspect the receipt before retrying.`);
  }
  const decoded = receipt.txDataDecoded;
  const deployedAddress = decoded && "contractAddress" in decoded ? decoded.contractAddress : receipt.recipient;
  if (!deployedAddress || !validAddress(deployedAddress)) {
    throw new Error(`Deployment finalized, but the contract address was not returned. Inspect transaction ${hash} in the explorer before retrying.`);
  }
  return deployedAddress;
}
