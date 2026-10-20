# ChangeOrder Firewall

ChangeOrder Firewall is a GenLayer-native, version-aware approval protocol for commercial orders. When a buyer and supplier sign an amendment, validators decide whether the new wording materially changes each edited obligation. Deterministic contract code follows the pre-agreed dependency graph: an affected tranche needs fresh approval, while independent approved tranches remain claimable. AI never selects a wallet or payment amount.

**Status:** patched contract deployed and exercised on [StudioNet](https://explorer-studio.genlayer.com/address/0x5206cF2B8414049fB08a866dc1ac3D5c0D2B3037). The [public app](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/) and [dedicated public repository](https://github.com/Demigodd00/changeorder-firewall) are available for review. No GenLayer Portal submission has been made. Start with the [submission pack](docs/SUBMISSION.md), [proof manifest](deploy/proof.json), [settled-term race fix](docs/SETTLED_TERM_GUARD.md), and [live evidence runbook](docs/LIVE_EVIDENCE.md).

## What makes it different

MatchPay checks whether an invoice and delivery evidence match one frozen order, then pays or refunds. ChangeOrder Firewall maintains *approval validity across signed revisions*. It enforces the invariant `approval_generation == obligation_generation` before claim, and increments generations only for terms affected by a material semantic edit or an explicit dependency. A changed export schema can invalidate both its own approval and an integration approval, while an unrelated guide approval survives. This is not achievable by checking a single invoice or renaming a verdict.

## Architecture

```text
Buyer creates bounded order text + DAG + fixed GEN amounts
           │
           ▼
GenLayer validators independently screen one clause for observability
           │ exact enum equality across leader/validator
           ▼
Buyer funds exact total ── Supplier accepts ── Buyer approves terms
           │
           ▼
Both parties sign an old/new text amendment
           │
           ▼
Validators independently judge ONE edit's materiality
           │ exact canonical MATERIAL / NON_MATERIAL / UNCLEAR
           ▼
Deterministic graph traversal increments affected generations
           │
           ├─ unaffected approvals survive and remain claimable
           └─ affected approvals require reapproval or time out to refund
```

The contract stores the full agreed text, SHA-256 hashes, participants, fixed tranches, generations, deadlines and revision history. Each contract represents one order with at most six terms and four applied revisions. Dependencies must point to earlier terms, so the graph cannot cycle. Tranches are GEN test-token wei strings and are fixed at creation. Contract funds become recipient-owned pull credits on claim or refund. Credit withdrawal is emitted only on finalization; a failed child transfer is a remaining risk to test live before production claims.

No outside document is treated as proof of delivery. The frozen text is evidence of what the two wallets agreed, not evidence that physical goods or services were delivered. The buyer's approval attests acceptance of a term; GenLayer only judges the semantic *effect of changing that term*. The prompt treats all user text as untrusted data.

## Local setup

Requirements: Python 3.12 with `genvm-linter`, `genlayer-test`, `pytest`; Node 24 with pnpm or npm. The local checks used `genvm-linter 0.11.0`, `genlayer-test 0.29.2`, and `pytest 9.1.1`. The contract pins a concrete GenVM runner in its first line. A StudioNet probe confirmed the runner before this contract was deployed.

```powershell
genvm-lint check contracts/changeorder_firewall.py --json
genvm-lint typecheck contracts/changeorder_firewall.py --json
pytest tests/direct -q
cd web
pnpm install
pnpm build
pnpm dev
```

The frontend imports the exact Python source in this repository and offers a bounded order-creation form. Its wallet-free reviewer view preloads the live StudioNet demo contract; `VITE_CONTRACT_ADDRESS` can override that default. `VITE_WALLETCONNECT_PROJECT_ID` optionally enables WalletConnect-compatible mobile wallets; without one, the pinned RainbowKit configuration offers a browser-extension wallet. The [public site](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/) serves the latest proof for finalized read-only inspection. Buyer-side MetaMask deployment, exact funding and approval were tested on an earlier contract version; latest-version browser writes, supplier browser signing and mobile pairing have not been tested.

## Order lifecycle

1. Deploy the contract with the supplier wallet, title, and a JSON array of terms (`id`, `text`, `requires`, `amount_wei`). The deployer is the buyer. Each term is judged for observability before money can enter the order.
2. The buyer calls `fund()` with the exact sum, the supplier calls `accept()`, and the buyer calls `approve_term(index)` as work is accepted. Wrong or premature calls to `fund()` are recorded as refundable credits instead of reverting after value is received.
3. Either party calls `propose_amendment()` with a bounded list of `{id,new_text}`. A proposal is not binding: an edited tranche may settle before the other party signs, and `sign_amendment()` then rejects that stale proposal. Claims and refunds pause only during joint review after countersignature. Anyone can call `screen_edit(index)` and `judge_edit(index)` on each frozen edit, then `finalize_amendment()`.
4. `MATERIAL` and `UNCLEAR` edits invalidate old approvals for the edited term and its dependent descendants. `NON_MATERIAL` edits retain them. A vague proposed clause aborts the amendment. Old paid tranches stay final.
5. The buyer may reapprove affected terms. A supplier may claim only with a generation-current approval. Unapproved or unclaimed tranches eventually become refundable. `withdraw_credit()` sends the caller's credit through a finalized GenLayer message.

All waiting phases have deadlines. See [the detailed design](docs/DESIGN.md) and [the initial demo case](docs/DEMO_PLAN.md).

## Verification status and limitations

`genvm-lint check`, type checking, and 14 direct-mode tests passed locally, including claim/refund-before-countersignature regression tests. A pinned-runner StudioNet probe finalized successfully, followed by the deployed order. The live demo covers observability screening, exact 0.003 test GEN funding, both-party amendment approval, `MATERIAL` judgment, generation propagation `[1,0,1]`, rejection of a stale T1 claim, a successful unaffected T2 claim, fresh T1/T3 approvals and claims, and an exact 0.003 test GEN pull-credit withdrawal. The deployment code was compared with the pinned contract source. Every transaction hash, validator-vote map, snapshot and payout check is recorded in [the primary proof manifest](deploy/proof.json). Re-run the read-only verifier with `cd web; pnpm verify:proof`.

A separate historical [browser-wallet proof](deploy/browser-wallet-proof.json) records a one-term [StudioNet test order](https://explorer-studio.genlayer.com/address/0x75cBC25e870b68bcA32078ef803bffbFAA192f47) on an earlier deployed source. A human confirmed MetaMask prompts in Chrome for buyer deployment, exact 0.0001 test GEN funding, and `approve_term(0)`. The project-controlled test supplier screened, accepted, claimed, and withdrew. All seven contract transactions and the external payout finalized; the supplier credit became zero and its wallet balance rose by exactly 0.0001 GEN. Run `cd web; pnpm verify:browser-proof` for a read-only recheck of receipts, pinned historical source bytes, payout, and final state. This proves the tested buyer browser path on that earlier source, not a buyer write on the latest contract, supplier browser signing, or production-funds safety.

The contract intentionally does not judge whether work was truly delivered. It cannot reverse a tranche already paid before an amendment. GEN sent through an undefined method or a raw transfer is outside its normal `fund()` accounting path; use only the documented payable method. Mobile-wallet QR pairing is not configured, and supplier-side browser-wallet actions remain unverified. None of these limits should be hidden from reviewers.

No score or Portal outcome is guaranteed. The public repository and frontend are published; the human submits to the Portal.
