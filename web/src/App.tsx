import { useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { date, deployOrder, errorText, gen, readCredit, readOrder, same, short, studioChainId, submitWrite, validAddress } from "./genlayer";
import type { OrderState, Term } from "./types";
import proof from "../public/proof.json";

const initialAddress = new URLSearchParams(window.location.search).get("address") || import.meta.env.VITE_CONTRACT_ADDRESS || proof.contract.address;
const exampleTerms = [
  { id: "T1", name: "CSV export", old: "id, date, SKU, quantity, price", changed: "id, date, SKU", status: "Needs fresh approval" },
  { id: "T2", name: "Training guide", old: "Markdown setup and troubleshooting", changed: "Unchanged", status: "Approval survives" },
  { id: "T3", name: "Integration package", old: "Imports the T1 schema", changed: "Depends on T1", status: "Needs fresh approval" },
];
type DraftTerm = { text: string; amount: string; requires: string[] };
const initialDraft: DraftTerm[] = [
  { text: "Deliver a CSV export with id, date, SKU, quantity and price columns.", amount: "0.01", requires: [] },
  { text: "Deliver a Markdown setup guide with installation and troubleshooting sections.", amount: "0.01", requires: [] },
  { text: "Deliver an integration package that imports the CSV schema specified in T1.", amount: "0.01", requires: ["T1"] },
];

function StatusPill({ children, kind = "neutral" }: { children: React.ReactNode; kind?: "neutral" | "good" | "warn" }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

function TermCard({ term, index, order, walletAddress, busy, onAction }: {
  term: Term;
  index: number;
  order: OrderState;
  walletAddress?: string;
  busy: boolean;
  onAction: (method: string, args: unknown[]) => void;
}) {
  const approved = term.approval_generation === term.generation;
  const current = term.claimed ? "Claimed" : term.refunded ? "Refunded" : approved ? "Approved for this version" : "Approval required";
  const kind = term.claimed || approved ? "good" : term.refunded ? "neutral" : "warn";
  const review = order.amendment?.phase === "REVIEW";
  return <article className="term-card">
    <div className="term-top"><span className="term-index">{term.id}</span><StatusPill kind={kind}>{current}</StatusPill></div>
    <p className="term-text">{term.text}</p>
    <div className="term-meta"><span>{gen(term.amount_wei)}</span><span>Generation {term.generation}</span><span>Depends on {term.requires.length ? term.requires.join(", ") : "nothing"}</span></div>
    <div className="term-actions">
      <button disabled={busy || review || !same(walletAddress, order.buyer) || approved || term.claimed || term.refunded} onClick={() => onAction("approve_term", [index])}>Approve</button>
      <button disabled={busy || review || !same(walletAddress, order.supplier) || !approved || term.claimed || term.refunded} onClick={() => onAction("claim_term", [index])}>Claim</button>
      <button disabled={busy || review || term.claimed || term.refunded} onClick={() => onAction("refund_term", [index])}>Refund if due</button>
    </div>
    {term.reapproval_deadline > 0 && !term.claimed && !term.refunded && <small>Reapproval window: {date(term.reapproval_deadline)}. The contract enforces the later of this and the order deadline.</small>}
  </article>;
}

export default function App({ mobileWalletsEnabled }: { mobileWalletsEnabled: boolean }) {
  const { address: walletAddress, chainId, connector, status: walletStatus } = useAccount();
  const [addressText, setAddressText] = useState(initialAddress);
  const [contractAddress, setContractAddress] = useState<`0x${string}` | null>(validAddress(initialAddress) ? initialAddress : null);
  const [order, setOrder] = useState<OrderState | null>(null);
  const [credit, setCredit] = useState("0");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingTx, setPendingTx] = useState("");
  const [amendTerm, setAmendTerm] = useState("T1");
  const [amendText, setAmendText] = useState("");
  const [draftTitle, setDraftTitle] = useState("Export and integration package");
  const [draftSupplier, setDraftSupplier] = useState("");
  const [draftTerms, setDraftTerms] = useState<DraftTerm[]>(initialDraft);
  const [createError, setCreateError] = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [createTx, setCreateTx] = useState("");

  const refresh = useCallback(async () => {
    if (!contractAddress) return;
    setLoading(true);
    setError("");
    try {
      const result = await readOrder(contractAddress);
      setOrder(result);
      if (walletAddress && validAddress(walletAddress)) setCredit(await readCredit(contractAddress, walletAddress));
      else setCredit("0");
    } catch (reason) {
      setOrder(null);
      setError(`Could not read finalized contract state: ${errorText(reason)}`);
    } finally {
      setLoading(false);
    }
  }, [contractAddress, walletAddress]);

  useEffect(() => { void refresh(); }, [refresh]);

  function inspect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validAddress(addressText)) { setError("Enter a valid nonzero StudioNet contract address."); return; }
    setPendingTx("");
    setOrder(null);
    setContractAddress(addressText);
    const query = new URLSearchParams(window.location.search);
    query.set("address", addressText);
    window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
  }

  async function act(method: string, args: unknown[] = [], value = 0n) {
    if (!contractAddress || !walletAddress || !connector || walletStatus !== "connected") {
      setError("Connect a wallet to send a transaction. Reading requires no wallet."); return;
    }
    if (chainId !== studioChainId) { setError("Switch the selected wallet to GenLayer StudioNet."); return; }
    if (pendingTx) { setError("A submitted transaction is still being tracked. Inspect it before sending another action."); return; }
    setBusy(true);
    setError("");
    setNotice(`Preparing ${method}…`);
    let submitted = false;
    try {
      const provider = await connector.getProvider();
      await submitWrite({
        provider: provider as never,
        walletAddress,
        contractAddress,
        method,
        args,
        value,
        onSubmitted: (tx) => { submitted = true; setPendingTx(tx); setNotice(`Submitted ${method}; waiting for finalization.`); },
      });
      setNotice(`${method} finalized successfully. Refreshed state is shown below.`);
      setPendingTx("");
      await refresh();
    } catch (reason) {
      setError(errorText(reason));
      setNotice(submitted ? "Transaction was submitted. Check its explorer receipt before trying another action." : "No transaction ID was returned.");
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    let submitted = false;
    if (!walletAddress || !connector || walletStatus !== "connected" || chainId !== studioChainId) {
      setCreateError("Connect a wallet on GenLayer StudioNet to deploy an order."); return;
    }
    if (createTx) { setCreateError("Inspect the submitted deployment before attempting another."); return; }
    if (!validAddress(draftSupplier) || same(draftSupplier, walletAddress)) {
      setCreateError("Enter a nonzero supplier wallet different from your buyer wallet."); return;
    }
    if (!draftTitle.trim() || draftTitle.trim().length > 100) { setCreateError("Use an order title of 1–100 characters."); return; }
    try {
      let total = 0n;
      const terms = draftTerms.map((term, index) => {
        if (!term.text.trim() || term.text.trim().length > 400) throw new Error(`T${index + 1}: use 1–400 characters of observable wording.`);
        const amount = parseEther(term.amount);
        if (amount <= 0n || amount > 10n ** 18n) throw new Error(`T${index + 1}: tranche must be greater than zero and at most 1 GEN.`);
        total += amount;
        return { id: `T${index + 1}`, text: term.text.trim(), amount_wei: String(amount), requires: term.requires };
      });
      if (total > 5n * 10n ** 18n) throw new Error("Order total cannot exceed 5 GEN.");
      setBusy(true);
      setCreateNotice("Preparing deployment. Your wallet must approve the contract creation.");
      const provider = await connector.getProvider();
      const deployed = await deployOrder({
        provider: provider as never,
        walletAddress,
        supplier: draftSupplier,
        title: draftTitle.trim(),
        termsJson: JSON.stringify(terms),
        onSubmitted: tx => { submitted = true; setCreateTx(tx); setCreateNotice("Deployment submitted; awaiting finalized receipt."); },
      });
      setCreateTx("");
      setCreateNotice(`Order deployed at ${deployed}. Review its finalized state below before funding.`);
      setAddressText(deployed);
      setContractAddress(deployed);
      setOrder(null);
      const query = new URLSearchParams(window.location.search);
      query.set("address", deployed);
      window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
    } catch (reason) {
      setCreateError(errorText(reason));
      setCreateNotice(submitted ? "A deployment was submitted. Check its explorer receipt before retrying." : "No finalized deployment was confirmed.");
    } finally { setBusy(false); }
  }

  function updateDraft(index: number, patch: Partial<DraftTerm>) {
    setDraftTerms(current => current.map((term, i) => i === index ? { ...term, ...patch } : term));
  }

  const walletReady = Boolean(walletAddress && walletStatus === "connected" && chainId === studioChainId);
  const active = order?.status === "ACTIVE";
  const amendment = order?.amendment;
  const settledEditBlocksSignature = Boolean(amendment?.edits.some(edit =>
    order?.terms.some(term => term.id === edit.id && (term.claimed || term.refunded))));

  return <div className="page-shell">
    <header className="site-header wrap">
      <a className="brand" href="/" aria-label="ChangeOrder Firewall home"><span className="brand-mark">C<span>F</span></span><span>ChangeOrder <b>Firewall</b></span></a>
      <nav aria-label="Primary"><a href="#mechanism">How it works</a><a href="#proof">Live proof</a><a href="#create">Create</a><a href="#review">Review an order</a><a href="#limitations">Limits</a></nav>
      <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
    </header>

    <main>
      <section className="hero wrap">
        <div className="hero-copy"><span className="eyebrow">GENLAYER · VERSION-AWARE APPROVALS</span>
          <h1>Orders change.<br/><em>Approvals shouldn’t lie.</em></h1>
          <p className="lede">A signed change to one requirement should not silently reuse an old approval—or erase approvals for unrelated work. ChangeOrder Firewall makes that boundary explicit and auditable.</p>
          <div className="hero-actions"><a className="button button-primary" href="#review">Inspect an order <span aria-hidden="true">↗</span></a><a className="button button-ghost" href="#mechanism">See the mechanism</a></div>
          <p className="honesty">Live StudioNet receipts and exact test-GEN settlement. The diagram shows the post-amendment snapshot; a separate buyer MetaMask path was finalized on earlier contract code.</p>
        </div>
        <div className="hero-visual" aria-label="A material change to T1 blocks T1 and its dependent T3, while T2 remains valid">
          <div className="diagram-head"><span>RECORDED REVISION 01</span><span className="live-dot">Post-amendment snapshot</span></div>
          <div className="diagram-row changed"><span className="diagram-node">T1</span><div><strong>Export schema</strong><small>Five columns → three</small></div><span className="diagram-state">REAPPROVE</span></div>
          <div className="diagram-branch"><span></span><span>↳ dependency propagates</span></div>
          <div className="diagram-row blocked"><span className="diagram-node">T3</span><div><strong>Integration package</strong><small>Depends on the T1 schema</small></div><span className="diagram-state">REAPPROVE</span></div>
          <div className="diagram-row safe"><span className="diagram-node">T2</span><div><strong>Training guide</strong><small>Independent obligation</small></div><span className="diagram-state">STILL VALID</span></div>
          <div className="diagram-footer">One amendment. Only affected approvals reset.</div>
        </div>
      </section>

      <section id="mechanism" className="mechanism-band">
        <div className="wrap"><div className="section-heading"><span className="eyebrow">THE CORE INVARIANT</span><h2>A firewall for every revision.</h2><p>Validators interpret wording. Ordinary contract code decides dependencies, permissions, deadlines and exact GEN amounts.</p></div>
          <div className="steps"><article><span>01</span><h3>Freeze the order</h3><p>Both parties work from public, bounded obligations. Each payment tranche and dependency is fixed before funding.</p></article><article><span>02</span><h3>Sign the change</h3><p>Either party proposes new wording; both must sign. Unclaimed payouts pause while its effects are reviewed.</p></article><article><span>03</span><h3>Judge one term</h3><p>GenLayer validators independently decide whether that exact old/new wording materially changes one obligation.</p></article><article><span>04</span><h3>Propagate in code</h3><p>A material or unclear change resets the affected branch. Untouched branches retain their approval and fixed payout.</p></article></div>
        </div>
      </section>

      <section className="example wrap" aria-labelledby="example-title"><div><span className="eyebrow">RECORDED STUDIONET CASE · REVISION 1</span><h2 id="example-title">Three tranches, one changed requirement.</h2><p>The signed amendment removed CSV columns from T1. Its dependent integration T3 needed fresh approval, while unrelated T2 kept its approval. This is the recorded state immediately after the amendment; all three tranches were subsequently claimed.</p></div><div className="example-list">{exampleTerms.map(term => <div key={term.id}><span>{term.id}</span><div><strong>{term.name}</strong><small>{term.old} · {term.changed}</small></div><StatusPill kind={term.id === "T2" ? "good" : "warn"}>{term.status}</StatusPill></div>)}</div></section>

      <section id="proof" className="proof-band"><div className="wrap proof-grid"><div><span className="eyebrow">FINALIZED STUDIO RECEIPTS</span><h2>A checkable path from edit to payout.</h2><p>This case used two test-only wallets. The saved snapshots show generations <code>[1, 0, 1]</code> after the signed amendment and approvals <code>[0, 0, 0]</code>: T1 and T3 were stale, while T2 remained current.</p><a className="proof-contract" href={proof.contract.explorer} target="_blank" rel="noreferrer">Open deployed contract ↗</a><a className="proof-contract" href="/proof.json" target="_blank" rel="noreferrer">Download proof manifest ↗</a><p>A separate historical one-term case on earlier contract code verified buyer MetaMask deployment, exact 0.0001 test-GEN funding and approval with human confirmations. The test supplier completed the claim and withdrawal through a script. This is not a browser write test of the current contract revision.</p><a className="proof-contract" href="/?address=0x75cBC25e870b68bcA32078ef803bffbFAA192f47#review">Inspect historical buyer-wallet case ↗</a><a className="proof-contract" href="https://github.com/Demigodd00/changeorder-firewall/blob/main/deploy/browser-wallet-proof.json" target="_blank" rel="noreferrer">Read historical browser-wallet proof ↗</a></div><div className="proof-list">
        <a href={proof.transactions.judge_material_T1.explorer} target="_blank" rel="noreferrer"><span>01</span><div><strong>Materiality: MATERIAL</strong><small>Validators classified the changed CSV obligation.</small></div><b>Receipt ↗</b></a>
        <a href={proof.transactions.apply_material_T1.explorer} target="_blank" rel="noreferrer"><span>02</span><div><strong>T1 and T3 invalidated; T2 survives</strong><small>The dependency rule advanced only the affected generations.</small></div><b>Receipt ↗</b></a>
        <a href={proof.transactions.stale_T1_claim.explorer} target="_blank" rel="noreferrer"><span>03</span><div><strong>Old T1 approval rejected</strong><small>Finalized execution error; order state remained unchanged.</small></div><b>Receipt ↗</b></a>
        <a href={proof.transactions.claim_unaffected_T2.explorer} target="_blank" rel="noreferrer"><span>04</span><div><strong>Unrelated T2 claim succeeded</strong><small>Its existing approval was still valid.</small></div><b>Receipt ↗</b></a>
        <a href={proof.transactions.withdraw_supplier_credit.explorer} target="_blank" rel="noreferrer"><span>05</span><div><strong>Exact 0.003 test GEN withdrawn</strong><small>Supplier credit reached zero; wallet balance rose by 0.003 GEN.</small></div><b>Receipt ↗</b></a>
      </div></div></section>

      <section id="create" className="create-band"><div className="wrap create-grid"><div><span className="eyebrow">START A NEW ORDER</span><h2>Freeze the terms before the work changes.</h2><p>As buyer, name the supplier and define 1–6 observable obligations. A tranche’s exact test-GEN amount and dependencies are immutable after deployment. The example is editable; it does not deploy until you sign.</p><div className="review-tip"><b>After deployment</b><span>Screen each obligation, fund the exact total, and have the supplier accept. Only then can the buyer approve completed terms or either party propose a jointly signed change.</span></div></div>
        <form className="create-form" onSubmit={e => void createOrder(e)}><h3>Create on StudioNet</h3><label htmlFor="draftTitle">Order title</label><input id="draftTitle" value={draftTitle} maxLength={100} onChange={e => setDraftTitle(e.target.value)} required />
          <label htmlFor="draftSupplier">Supplier wallet address</label><input id="draftSupplier" value={draftSupplier} onChange={e => setDraftSupplier(e.target.value)} placeholder="0x…" spellCheck={false} required />
          <div className="draft-head"><h4>Obligations</h4><span>Max 6 · 1 GEN per tranche</span></div>
          {draftTerms.map((term, index) => <div className="draft-term" key={index}><strong>T{index + 1}</strong><label htmlFor={`draftText${index}`}>Checkable obligation</label><textarea id={`draftText${index}`} value={term.text} maxLength={400} onChange={e => updateDraft(index, { text: e.target.value })} required /><label htmlFor={`draftAmount${index}`}>Tranche in test GEN</label><input id={`draftAmount${index}`} type="number" min="0.000000000000000001" max="1" step="any" value={term.amount} onChange={e => updateDraft(index, { amount: e.target.value })} required />{index > 0 && <fieldset><legend>Depends on earlier terms</legend>{draftTerms.slice(0, index).map((_, prior) => <label key={prior}><input type="checkbox" checked={term.requires.includes(`T${prior + 1}`)} onChange={e => updateDraft(index, { requires: e.target.checked ? [...term.requires, `T${prior + 1}`] : term.requires.filter(id => id !== `T${prior + 1}`) })} /> T{prior + 1}</label>)}</fieldset>}</div>)}
          <div className="draft-controls"><button type="button" disabled={draftTerms.length >= 6 || busy} onClick={() => setDraftTerms(current => [...current, { text: "", amount: "0.01", requires: [] }])}>Add term</button><button type="button" disabled={draftTerms.length <= 1 || busy} onClick={() => setDraftTerms(current => current.slice(0, -1))}>Remove last</button></div>
          <p className="form-disclaimer">Deploying does not fund the order. Never use production funds; StudioNet uses test GEN. Contract screening can reject vague terms after deployment.</p>
          <button className="button-primary create-submit" type="submit" disabled={!walletReady || busy || Boolean(createTx)}>Deploy order</button>
          {!walletReady && <small className="wallet-note">Connect a wallet on GenLayer StudioNet to enable deployment.</small>}
          {createError && <p className="alert alert-error" role="alert">{createError}</p>}{createNotice && <p className="alert alert-info" role="status">{createNotice} {createTx && <a href={`https://explorer-studio.genlayer.com/tx/${createTx}`} target="_blank" rel="noreferrer">Inspect transaction ↗</a>}</p>}
          {createTx && <button type="button" className="text-button" onClick={() => { setCreateTx(""); setCreateNotice("Confirm the previous deployment in the explorer before retrying."); }}>I inspected the deployment receipt</button>}
        </form></div></section>

      <section id="review" className="review-band"><div className="wrap review-grid"><div className="review-intro"><span className="eyebrow">REVIEWER MODE</span><h2>Read a finalized order without a wallet.</h2><p>Paste a deployed StudioNet contract address to see its frozen terms, approved generations, revision history and exact tranche accounting. Connecting a wallet is only for taking an action.</p><div className="review-tip"><b>What to verify</b><span>After a material T1 amendment, T1 and dependent T3 must have newer generations; independent T2 must not. An old T1 approval must not be claimable.</span></div></div>
        <div className="review-panel"><div className="panel-title"><span className="panel-light"></span><strong>Contract inspector</strong><StatusPill>{order ? "FINALIZED READ" : "AWAITING ADDRESS"}</StatusPill></div>
          <form onSubmit={inspect} className="address-form"><label htmlFor="contractAddress">StudioNet Intelligent Contract address</label><div><input id="contractAddress" value={addressText} onChange={e => setAddressText(e.target.value)} placeholder="0x…" spellCheck={false}/><button type="submit">Inspect</button></div></form>
          {loading && <p className="panel-note">Reading finalized chain state…</p>}
          {!contractAddress && <p className="panel-note">Enter a StudioNet contract address to read its finalized state. The live demo address is preloaded by default.</p>}
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {notice && <p className="alert alert-info" role="status">{notice} {pendingTx && <a href={`https://explorer-studio.genlayer.com/tx/${pendingTx}`} target="_blank" rel="noreferrer">Inspect transaction ↗</a>}</p>}
          {pendingTx && <button className="text-button" onClick={() => { setPendingTx(""); void refresh(); }}>I inspected this transaction; refresh state</button>}
          {order && <><div className="order-head"><div><small>{order.status} · REVISION {order.revision}</small><h3>{order.title}</h3><p>Buyer {short(order.buyer)} · Supplier {short(order.supplier)}</p></div><a href={`https://explorer-studio.genlayer.com/address/${contractAddress}`} target="_blank" rel="noreferrer">Explorer ↗</a></div>
            <div className="metric-row"><div><small>Order total</small><strong>{gen(order.total_wei)}</strong></div><div><small>Still reserved</small><strong>{gen(order.reserved_wei)}</strong></div><div><small>Revision</small><strong>#{order.revision}</strong></div></div>
            <div className="hash-row"><span>Frozen agreement hash</span><code title={order.agreement_hash}>{order.agreement_hash.slice(0, 18)}…</code></div>
            <div className="panel-subheading"><h4>Obligations and approvals</h4><button className="text-button" onClick={() => void refresh()} disabled={loading}>Refresh final state</button></div>
            <div className="terms">{order.terms.map((term, index) => <TermCard key={term.id} term={term} index={index} order={order} walletAddress={walletAddress} busy={busy || Boolean(pendingTx)} onAction={(method, args) => void act(method, args)} />)}</div>
            {order.history.length > 0 && <div className="history"><h4>Revision history</h4>{order.history.map((entry, index) => <div className="history-item" key={index}><strong>{String(entry.outcome || "Event")}</strong><span>Revision {String(entry.revision)} · Affected: {Array.isArray(entry.affected) ? entry.affected.join(", ") || "none" : "n/a"}</span><code>Proposal {String(entry.proposal_hash || "").slice(0, 18)}…</code></div>)}</div>}
            <div className="deadlines"><span>Order approval deadline: {date(order.settle_deadline)}</span><span>Supplier claim deadline: {date(order.claim_deadline)}</span></div>
            <div className="actions-panel"><h4>Actions</h4><p>Only the appropriate wallet can sign party-specific actions. Permissionless checks and expiry calls still require a wallet to pay transaction fees.</p>
              {order.status === "CHECKING" && <div className="action-row">{order.checks.map((check, i) => check === "PENDING" && <button key={i} disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("check_term", [i])}>Check {order.terms[i].id}</button>)}<button disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("expire_checks")}>Expire checks if due</button></div>}
              {order.status === "READY_TO_FUND" && <div className="action-row"><button className="button-primary" disabled={!same(walletAddress, order.buyer) || busy || Boolean(pendingTx)} onClick={() => void act("fund", [], BigInt(order.total_wei))}>Fund exact {gen(order.total_wei)}</button><button disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("expire_unfunded")}>Expire if due</button></div>}
              {order.status === "AWAITING_SUPPLIER" && <div className="action-row"><button disabled={!same(walletAddress, order.supplier) || busy || Boolean(pendingTx)} onClick={() => void act("accept")}>Accept order</button><button disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("expire_acceptance")}>Expire acceptance if due</button></div>}
              {active && !amendment && <form className="amend-form" onSubmit={e => { e.preventDefault(); if (amendText.trim()) void act("propose_amendment", [JSON.stringify([{ id: amendTerm, new_text: amendText.trim() }])]); }}><label htmlFor="amendTerm">Propose a text-only amendment</label><select id="amendTerm" value={amendTerm} onChange={e => setAmendTerm(e.target.value)}>{order.terms.filter(t => !t.claimed && !t.refunded).map(t => <option key={t.id} value={t.id}>{t.id}</option>)}</select><textarea aria-label="New obligation wording" value={amendText} onChange={e => setAmendText(e.target.value)} placeholder="Enter the entire replacement obligation, not just the difference…" maxLength={400}/><button disabled={!walletReady || busy || Boolean(pendingTx) || !amendText.trim() || !order.terms.some(t => !t.claimed && !t.refunded)}>Propose amendment</button></form>}
              {amendment && <div className="amend-review"><div><StatusPill kind="warn">{amendment.phase}</StatusPill><span>Deadline {date(amendment.deadline)}</span></div>{amendment.phase === "PROPOSED" && <p>A proposal is not binding until countersigned. If an edited tranche settles first, this proposal cannot be signed and must expire.</p>}{settledEditBlocksSignature && <p>Signing is blocked: an edited tranche has already been claimed or refunded.</p>}{amendment.edits.map((edit, i) => <div key={i} className="edit-card"><b>{edit.id}: {edit.material}</b><p><del>{edit.old_text}</del><br/>{edit.new_text}</p><small>Observability: {edit.screen}</small>{amendment.phase === "REVIEW" && <div className="action-row"><button disabled={!walletReady || busy || Boolean(pendingTx) || edit.screen !== "PENDING"} onClick={() => void act("screen_edit", [i])}>Screen wording</button><button disabled={!walletReady || busy || Boolean(pendingTx) || edit.screen !== "OBSERVABLE" || edit.material !== "PENDING"} onClick={() => void act("judge_edit", [i])}>Judge materiality</button></div>}</div>)}<div className="action-row">{amendment.phase === "PROPOSED" && <><button disabled={!walletReady || busy || Boolean(pendingTx) || settledEditBlocksSignature || same(walletAddress, amendment.proposer)} onClick={() => void act("sign_amendment")}>Countersign</button><button disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("expire_proposal")}>Expire if due</button></>}{amendment.phase === "REVIEW" && <button disabled={!walletReady || busy || Boolean(pendingTx)} onClick={() => void act("finalize_amendment")}>Finalize when ready</button>}</div></div>}
              {walletAddress && BigInt(credit) > 0n && <div className="credit-row"><span>Your pull credit: <strong>{gen(credit)}</strong></span><button disabled={busy || Boolean(pendingTx) || !walletReady} onClick={() => void act("withdraw_credit")}>Withdraw</button></div>}
              {!mobileWalletsEnabled && <small className="wallet-note">Mobile QR wallet pairing is not configured; use an extension wallet or a wallet-enabled browser. A Reown project ID enables the additional wallets.</small>}
            </div>
          </>}
        </div>
      </div></section>

      <section id="limitations" className="limits wrap"><div><span className="eyebrow">HONEST BOUNDARIES</span><h2>What the firewall does—and doesn’t—prove.</h2></div><div><p>It records whether validators agreed that changed wording materially affects an obligation, and it enforces approval generations and exact pre-funded amounts. It does <b>not</b> prove physical delivery, authenticate a document issuer, or adjudicate whether work was actually completed.</p><p>The main amendment proof used script-controlled test wallets. A separate buyer MetaMask deploy/fund/approve flow was verified on an earlier contract version with human confirmations; latest-version browser writes, supplier browser signing and mobile QR pairing remain untested. None of this is a production-funds security audit.</p></div></section>
    </main>
    <footer className="site-footer"><div className="wrap"><span>ChangeOrder Firewall</span><span>Built for verifiable amendment impact on GenLayer.</span><a href="https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle" target="_blank" rel="noreferrer">GenLayer documentation ↗</a></div></footer>
  </div>;
}
