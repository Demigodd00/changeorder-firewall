# Portal submission pack — ChangeOrder Firewall

The user submits to the GenLayer Portal. This file is copy-ready review material, not a claim that Portal approval or points are guaranteed. Check the live Portal form before pasting; field names and limits can change.

**Contribution type:** Project (new standalone application).

**Project name:** ChangeOrder Firewall

**Primary tag suggestion:** AI & Agents. If the current Portal offers a more precise Governance or Dispute Resolution category, choose the category that best reflects *version-aware approval governance*, not invoice matching.

**One-liner:** GenLayer-native change orders that invalidate only approvals affected by a signed, material requirement change.

**Description (under 1,000 characters):** ChangeOrder Firewall stops stale approvals surviving changed requirements. Buyer and supplier freeze observable obligations, dependencies and exact test-GEN tranches in a GenLayer Intelligent Contract. Both sign text amendments. Validators judge materiality; deterministic code invalidates approvals only for affected terms and their dependents. Unrelated approvals remain claimable. A fresh StudioNet case shows a material T1 CSV-schema change invalidating T1 and dependent T3 while T2 survives: a stale T1 claim fails, T2 succeeds, and fresh approvals enable exact settlement. The contract now blocks countersigning a proposal after an edited term settles, with claim/refund regression tests. A separate historical MetaMask case verifies buyer deployment, funding and approval on earlier source. Reviewers can inspect finalized cases without a wallet. Real-world delivery, current-version browser writes and supplier browser signing are not proven.

**Website:** https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/

**GitHub repository:** https://github.com/Demigodd00/changeorder-firewall

**Contract explorer:** https://explorer-studio.genlayer.com/address/0x5206cF2B8414049fB08a866dc1ac3D5c0D2B3037

**Contract source pinned to deployment:** https://github.com/Demigodd00/changeorder-firewall/blob/ce25e284b0878819a8744d33d72ad3006cd7f333/contracts/changeorder_firewall.py

**Proof manifest:** https://github.com/Demigodd00/changeorder-firewall/blob/main/deploy/proof.json

**Historical buyer browser-wallet test order (earlier source):** https://explorer-studio.genlayer.com/address/0x75cBC25e870b68bcA32078ef803bffbFAA192f47

**Browser-wallet proof manifest:** https://github.com/Demigodd00/changeorder-firewall/blob/main/deploy/browser-wallet-proof.json

## Exact reviewer path

1. Open the website. The “Live proof” section links the deployed contract and recorded receipts. Do not connect a wallet or spend test GEN to review the existing case.
2. Open “Review an order.” The preloaded address is the live contract. Click **Inspect** or **Refresh final state**. It should show an active revision-1 order, T1/T2/T3 `CLAIMED`, generations `[1,0,1]`, affected revision IDs `[T1,T3]`, and zero GEN reserved.
3. Open the proof manifest and compare `afterMaterialAmendment`: all three approvals were generation 0, but T1/T3 generations were 1 and T2 remained 0. `afterRejectedStaleClaim` must be identical. The [T1 stale-claim receipt](https://explorer-studio.genlayer.com/tx/0xab2b0cd728bd66c5251bdc8a51848bfcc14185ee8a56b813c8b456bce8330faf) is an expected execution error.
4. Compare the [T2 claim](https://explorer-studio.genlayer.com/tx/0xc55bf8718f0de7fab1230e66711a9912d971007239d2ee03245cd0336510d38f), [materiality verdict](https://explorer-studio.genlayer.com/tx/0x9c4a9783167b67df1cba06af30ee5e63d59dd4396c3c5f4c95d836212e25cd23), [finalization](https://explorer-studio.genlayer.com/tx/0x645cfdb212fd0297d223430e630afadb47c05ae5136e8bf29390e43544107a9b) and [withdrawal](https://explorer-studio.genlayer.com/tx/0x722a50041e988f6d879c96422da4b11dd1300c16ec48c3def6390e6173021b5f).
5. Optional code check: clone the repo, `cd web`, `pnpm install`, `pnpm verify:proof`. This reads StudioNet and checks the deployed code, receipts, votes, payout and final state without a private key.
6. Optional historical browser-wallet check: open the earlier one-term test order by adding `?address=0x75cBC25e870b68bcA32078ef803bffbFAA192f47` to the website URL. It should show T1 `CLAIMED` and zero reserve. Compare buyer [deployment](https://explorer-studio.genlayer.com/tx/0xb0f69f25095f78ce36868bed3afd0d88d12c13ce5b499b8afbbbc54c7c954f97), [funding](https://explorer-studio.genlayer.com/tx/0xfa14b2d028b3fbc8abbffe4e41c206eb49e966e5497278c6b0dc845e9be656f0) and [approval](https://explorer-studio.genlayer.com/tx/0x1acc1bbf93a8cddbe697dbaab796f7df0153c9f33cb37fdcfb60c65befd56160) with the browser-wallet manifest. `pnpm verify:browser-proof` checks that earlier deployment against its pinned historical source, not the latest contract.

**Expected verification outcome (under 500 characters):** Open the app without a wallet and inspect the preloaded StudioNet order. It shows revision 1, generations `[1,0,1]`, all three tranches claimed, and zero reserve. The manifest records a material T1 amendment, an unchanged state after the rejected stale T1 claim, a valid independent T2 claim, and the exact 0.003 test-GEN supplier payout. `cd web; pnpm verify:proof` should print `PASS` after checking finalized receipts, on-chain source, the credited transfer and final state.

**Optional demo video:** Not yet recorded. Use [the two-minute script](DEMO_SCRIPT.md) if recording one.

## Evidence and claims

The positive/negative receipts, deployed source equality, validator votes, state read-backs and exact credited transfer are live evidence for the latest contract. The settled-term race interleavings are [direct-test evidence](SETTLED_TERM_GUARD.md), not live receipts. The site has been checked for wallet-free finalized reads; buyer-side MetaMask deploy/fund/approve was checked only on the earlier source. Latest-version browser writes, supplier browser signing and mobile QR pairing remain unverified. No production-funds audit or real-world delivery attestation is claimed. See [the code tutorial](TUTORIAL.md) and [live evidence details](LIVE_EVIDENCE.md).
