# ChangeOrder Firewall design

## Distinct invariant

For any unclaimed tranche, a buyer approval is claimable only if its approval generation equals the current generation of its obligation. A jointly signed amendment can change term text, but a material change increments the generation of that term and every dependent term. Unrelated approvals retain their generation. This is selective invalidation across revisions, not a one-document match/refund classifier.

## Trust boundary

- Buyer and supplier sign a bounded, public on-chain agreement. They control its words, not the model's verdict or the deterministic dependency traversal. The agreement text is the authoritative evidence of what they consented to; it is not proof of physical delivery.
- Validators independently judge one term's observability, or one amendment's material effect on one old term. They compare the sole canonical decision field exactly. No reasoning or unverified quote enters state.
- Code controls graph validation, affected-branch propagation, fixed amounts, authorization, deadlines, approval generations, and credits. The model cannot pick a payment recipient or amount.
- The web app reads finalized contract state. Its diagram is illustrative; the separate public proof manifest records the live StudioNet case.

## State and deadlines

One contract represents one order. The buyer proposes up to six terms, each with frozen text, earlier-term dependencies, and a fixed GEN tranche. Terms must pass an observable-criterion check before funding. The buyer funds exactly the sum; other/wrong deposits are recorded as refundable credits. The supplier accepts. Buyer approvals are per tranche; supplier claims become pull credits. Unapproved tranches become refundable after the order deadline; approved but unclaimed tranches become refundable after the claim deadline. Any credit is withdrawable by its owner.

Either party proposes changed text for a subset of terms; the other signs. During joint review, all unclaimed claims and refunds pause. Each edit gets an observability check and then a materiality judgment. A vague edit cancels the amendment without changing the prior version. Unknown materiality is treated as material. On finalization, code propagates affected generations along dependency edges. An affected term requires fresh buyer approval within its reapproval window; after that, its unapproved tranche refunds. A proposal that is not countersigned expires with no change. A review that cannot finish by its deadline treats still-unknown materiality as material; missing observability aborts the amendment.

Already claimed funds cannot be retroactively clawed back. No amendment may change recipients, tranche amounts, or dependency edges. A later amendment cannot revive a refunded tranche.

## Demo plan

Illustrative software order: T1 requires a CSV export with five named columns, T2 requires a Markdown training guide, and T3 is an integration package that depends on T1. Approve all three; amend T1 to omit two columns. GenLayer must judge T1 material; code invalidates T1 and T3, while T2 remains claimable. Show a failed stale-approval claim of T1 and a successful claim of T2. Separate cases show a typo-only amendment retaining approval, a vague amendment being rejected, and text containing an instruction to the validator still being judged as data. All demo texts are frozen on-chain and mirrored at a pinned Git commit; they are not claimed to be real commercial delivery records.

## Comparison

MatchPay checks order-document consistency and makes one fixed payout/refund decision. SponsorProof checks a deliverable against sponsorship terms. SpecGate checks an inspection report against one frozen order. ChangeOrder Firewall instead makes approvals *version-sensitive* and deterministically propagates a judged semantic change through an explicit dependency DAG, preserving unrelated approved branches.

## Stage gates

Local lint, direct tests, a StudioNet runner probe, deployed source comparison, finalized receipts, state read-backs and a public read-only frontend are recorded. Browser-wallet actions remain unverified, so the site must not claim that complete path has passed. The public repository and site were published with user approval; Portal submission remains a human action.
