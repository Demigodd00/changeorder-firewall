# Code walkthrough: a signed change without stale approvals

This walkthrough explains the deployed [contract source](https://github.com/Demigodd00/changeorder-firewall/blob/7fdf247e30e7d0df1e418d5ab413267ec6a2acc2/contracts/changeorder_firewall.py), rather than inventing a hypothetical application. Follow it with the [live proof](LIVE_EVIDENCE.md) and the [public read-only app](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/). The demo wallets and GEN amounts are test-only.

## 1. Bound the agreement before funding

The constructor validates a JSON list of 1–6 obligations. Each term contains an ID, bounded text, an immutable wei amount, and dependencies on *earlier* terms. That last restriction guarantees an acyclic graph, so the contract can traverse affected descendants deterministically. The buyer and supplier are fixed addresses. The constructor stores term generations at zero and approvals at minus one—an approval cannot exist by accident.

`check_term(index)` asks validators whether a single clause has a checkable deliverable, quantity, format, specification or deadline. The `judge_observable` prompt treats the clause as untrusted data and returns only `OBSERVABLE` or `VAGUE`. A vague clause rejects the order. Only when all clauses are observable can the buyer call payable `fund()` with exactly the predetermined total. Wrong, duplicate or unauthorized deposits become sender-owned refundable credits; they are not mixed into the order's reserved amount. The supplier then calls `accept()`.

## 2. Keep the AI output narrow

`judged_verdict` is the GenLayer-specific boundary. Its leader runs `gl.nondet.exec_prompt` with JSON output. Validators run the *same semantic task independently* inside `gl.vm.run_nondet_unsafe` and compare the normalized, sole state-affecting `verdict` string exactly. Free-form explanations never enter the equivalence check or contract state. Invalid JSON, extra fields or an unsupported enum fall back to a safe result: `VAGUE` during observability screening and `UNCLEAR` for materiality. This is a narrow use of subjective judgment, not an AI-controlled payment decision.

`judge_material(old_clause, new_clause)` returns `MATERIAL`, `NON_MATERIAL` or `UNCLEAR` for one edit. It is not asked who should be paid, how much to pay, or whether work was delivered. The amount and recipient remain ordinary immutable state. The contract treats `UNCLEAR` as affecting approvals, so uncertainty cannot preserve a possibly stale approval.

## 3. Require both parties, then update only the affected branch

Either party calls `propose_amendment` with changed text for existing, unsettled terms. `sign_amendment` requires the *other* party to countersign before review. During review, claims and refunds pause. Anyone may call `screen_edit` and `judge_edit` for each frozen edit. A vague replacement is rejected; an unscreened edit cannot activate just because the review deadline elapsed.

In `finalize_amendment`, code collects the IDs whose verdict is not `NON_MATERIAL`. `affected_closure` follows the already-agreed dependency edges, then increments the generation only for those unsettled terms. It also saves a revision-history entry with hashes and the exact affected IDs. The contract does not ask AI to compute the closure, change the graph, or alter amounts. This separation matters: model variability is confined to the meaning of one edit; repeatable code controls the operational consequence.

The live case has T1 (CSV export), T2 (independent guide), and T3 (integration depending on T1). Both parties signed a T1 edit that removed required CSV columns. Validators returned `MATERIAL`. The code advanced generations from `[0,0,0]` to `[1,0,1]`. An approval recorded against generation 0 therefore became stale for T1 and T3, while T2's generation-0 approval stayed valid. These are saved read-backs in `deploy/proof.json`, not just an illustration.

## 4. Enforce exact settlement

The buyer calls `approve_term(index)` to set `approval_generation` to the current generation. `claim_term` requires the supplier, an unsettled term, an open claim window, and exact equality between `approval_generation` and `generation`. The live stale T1 claim finalized with an expected execution error and no state change; the unaffected T2 claim succeeded. After fresh T1/T3 approvals, those claims succeeded too. Each claim moves only that term's fixed wei amount out of the reserve into supplier-owned pull credit. `withdraw_credit()` emits the external transfer on finalization; the proof verifier checks its credited amount and recipient separately from contract-call receipts.

This demonstrates version-aware approval validity and test-GEN accounting for one live case. It does *not* authenticate real-world deliverables, prove commercial identity, test every possible amendment, or establish production security. The published UI's read-only inspector works without a wallet; browser-wallet writes still need an end-to-end wallet test.
