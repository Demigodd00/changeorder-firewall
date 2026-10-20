# Portal submission pack — ChangeOrder Firewall

The user submits to the GenLayer Portal. This file is copy-ready review material, not a claim that Portal approval or points are guaranteed. Check the live Portal form before pasting; field names and limits can change.

**Contribution type:** Project (new standalone application).

**Project name:** ChangeOrder Firewall

**Primary tag suggestion:** AI & Agents. If the current Portal offers a more precise Governance or Dispute Resolution category, choose the category that best reflects *version-aware approval governance*, not invoice matching.

**One-liner:** GenLayer-native change orders that invalidate only approvals affected by a signed, material requirement change.

**Description (under 1,000 characters):** ChangeOrder Firewall stops stale procurement approvals surviving changed requirements. Buyer and supplier freeze observable obligations, dependency edges and exact test-GEN tranches in a GenLayer Intelligent Contract. Both sign text amendments. Validators judge whether new wording materially changes an obligation; contract code invalidates approval generations only for that term and its dependents. Unrelated approvals stay claimable. A live StudioNet case shows a material CSV-schema change invalidating T1 and dependent T3 while T2 survives; a stale T1 claim fails, T2 succeeds, and fresh approvals enable exact settlement. A separate browser test proves buyer MetaMask deployment, exact funding and approval with human confirmations, followed by test-supplier claim and payout. Reviewers can inspect both finalized cases without a wallet. Source, receipts and read-only verifiers are public. Real-world delivery and supplier browser signing are not proven.

**Website:** https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/

**GitHub repository:** https://github.com/Demigodd00/changeorder-firewall

**Contract explorer:** https://explorer-studio.genlayer.com/address/0xbb76b3A5af5328677cAb21781f1e70a7e2F4FE87

**Contract source pinned to deployment:** https://github.com/Demigodd00/changeorder-firewall/blob/7fdf247e30e7d0df1e418d5ab413267ec6a2acc2/contracts/changeorder_firewall.py

**Proof manifest:** https://github.com/Demigodd00/changeorder-firewall/blob/main/deploy/proof.json

**Buyer browser-wallet test order:** https://explorer-studio.genlayer.com/address/0x75cBC25e870b68bcA32078ef803bffbFAA192f47

**Browser-wallet proof manifest:** https://github.com/Demigodd00/changeorder-firewall/blob/main/deploy/browser-wallet-proof.json

## Exact reviewer path

1. Open the website. The “Live proof” section links the deployed contract and recorded receipts. Do not connect a wallet or spend test GEN to review the existing case.
2. Open “Review an order.” The preloaded address is the live contract. Click **Inspect** or **Refresh final state**. It should show an active revision-1 order, T1/T2/T3 `CLAIMED`, generations `[1,0,1]`, affected revision IDs `[T1,T3]`, and zero GEN reserved.
3. Open the proof manifest and compare `afterMaterialAmendment`: all three approvals were generation 0, but T1/T3 generations were 1 and T2 remained 0. `afterRejectedStaleClaim` must be identical. The [T1 stale-claim receipt](https://explorer-studio.genlayer.com/tx/0xd28d3170423c70dfd807ad784abae294d5de082cd824d2d6145d335b15102933) is an expected execution error.
4. Compare the [T2 claim](https://explorer-studio.genlayer.com/tx/0xee20dfcf52b6d9778a4fedb308d11203552a94a735b699e5dc6b83bb3a53eb3a), [materiality verdict](https://explorer-studio.genlayer.com/tx/0xec1bb68ecc86a30431f56592209e92b4e67efe7f7073516594daede2948a58ec), [finalization](https://explorer-studio.genlayer.com/tx/0x03222d2d5f713653cfb5d854d5a57ccdbeb3a23a05f8cdeb081d1f0aef4643e6) and [withdrawal](https://explorer-studio.genlayer.com/tx/0xdfb4cb806bc51b0b6fb2deae7544e3fdd3c14b5e9b27a681fd1555d0150b17ce).
5. Optional code check: clone the repo, `cd web`, `pnpm install`, `pnpm verify:proof`. This reads StudioNet and checks the deployed code, receipts, votes, payout and final state without a private key.
6. Optional browser-wallet check: open the separate test order by adding `?address=0x75cBC25e870b68bcA32078ef803bffbFAA192f47` to the website URL. It should show T1 `CLAIMED` and zero reserve. Compare buyer [deployment](https://explorer-studio.genlayer.com/tx/0xb0f69f25095f78ce36868bed3afd0d88d12c13ce5b499b8afbbbc54c7c954f97), [funding](https://explorer-studio.genlayer.com/tx/0xfa14b2d028b3fbc8abbffe4e41c206eb49e966e5497278c6b0dc845e9be656f0) and [approval](https://explorer-studio.genlayer.com/tx/0x1acc1bbf93a8cddbe697dbaab796f7df0153c9f33cb37fdcfb60c65befd56160) with the browser-wallet manifest. `pnpm verify:browser-proof` independently rechecks finalized receipts, source equality, exact payout and final state without a key.

**Expected verification outcome:** The public inspector displays the finalized revision-1 order with all three fixed 0.001 test-GEN tranches claimed and zero reserve. The manifest shows that the material T1 wording change advanced T1 and dependent T3 to generation 1 while independent T2 stayed at 0. The stale T1 claim is a finalized expected execution error with unchanged state; the T2 claim succeeds without reapproval. After fresh approvals, T1/T3 claims succeed. The supplier received exactly 0.003 test GEN through a finalized pull-credit withdrawal. The read-only verifier should print `PASS` for 21 finalized IC transactions, one credited external transfer, source equality and final state.

**Optional demo video:** Not yet recorded. Use [the two-minute script](DEMO_SCRIPT.md) if recording one.

## Evidence and claims

The positive/negative receipts, deployed source equality, validator votes, state read-backs and exact credited transfer are live evidence. The site has been checked for wallet-free finalized reads and buyer-side MetaMask deploy/fund/approve. Supplier browser signing and mobile QR pairing have not been verified. No production-funds audit or real-world delivery attestation is claimed. See [the code tutorial](TUTORIAL.md) and [live evidence details](LIVE_EVIDENCE.md).
