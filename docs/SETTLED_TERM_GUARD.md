# Settled-term amendment guard

## What changed

An amendment proposal is not a signed change order. Claims and refunds may continue while it is merely `PROPOSED`. Previously, a party could propose new wording for an unsettled term, allow that term to be claimed or refunded, then countersign and finalize the proposal. This could rewrite the on-chain description of an already-settled obligation.

`sign_amendment()` now rechecks every edited term immediately before the second signature and rejects a proposal if any edited term has been claimed or refunded. As a second fail-closed guard, `finalize_amendment()` aborts if an edited term somehow settled during review. The UI explains this timing and disables countersigning when the finalized state shows an edited term has settled.

## Verification and scope

The direct tests `test_claim_during_proposal_blocks_late_countersignature` and `test_refund_during_proposal_blocks_late_countersignature` exercise both interleavings. They assert that the late signature reverts, the old text and revision remain unchanged, and the proposal can expire. Contract lint, 14 direct tests and the frontend build pass. The latest primary StudioNet proof demonstrates the patched contract's normal material-amendment and settlement path; these two adversarial interleavings are direct-test evidence, not claimed as live receipts.

This is a specific race fix, not a production-funds audit. A previously settled tranche remains final and cannot be clawed back.
