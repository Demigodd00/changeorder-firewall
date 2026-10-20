# Two-minute reviewer demo

This is a script for a screen recording or live walkthrough, not a claim that a video already exists. Use the [public app](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/) and the links below. No wallet is required for this recorded case.

**0:00–0:20 — The problem.** “A buyer may approve work, then sign a change order that quietly changes the requirement. A simple approval flag no longer tells us which version was approved.” Point to the hero diagram: T1 is a CSV schema, T3 depends on it, and T2 is independent.

**0:20–0:45 — The GenLayer boundary.** Open “How it works.” Explain that validators independently classify the meaning of one old/new clause as `MATERIAL`, `NON_MATERIAL` or `UNCLEAR`. The contract compares only the canonical decision field; code—not AI—chooses the affected dependency closure, parties, deadlines and fixed amounts.

**0:45–1:15 — The live amendment.** In “Live proof,” open the [materiality receipt](https://explorer-studio.genlayer.com/tx/0xec1bb68ecc86a30431f56592209e92b4e67efe7f7073516594daede2948a58ec), then [amendment finalization](https://explorer-studio.genlayer.com/tx/0x03222d2d5f713653cfb5d854d5a57ccdbeb3a23a05f8cdeb081d1f0aef4643e6). Show the saved post-amendment generations `[1,0,1]`: T1 and T3 require fresh approval, T2 does not.

**1:15–1:40 — The negative and positive cases.** Open the [expected failed stale T1 claim](https://explorer-studio.genlayer.com/tx/0xd28d3170423c70dfd807ad784abae294d5de082cd824d2d6145d335b15102933) and the [successful unaffected T2 claim](https://explorer-studio.genlayer.com/tx/0xee20dfcf52b6d9778a4fedb308d11203552a94a735b699e5dc6b83bb3a53eb3a). The failure left state unchanged; T2's prior approval remained usable.

**1:40–2:00 — Final accounting and honest limit.** Scroll to “Review an order” to show finalized state: all three terms claimed, revision 1, reserve zero. Link the [withdrawal](https://explorer-studio.genlayer.com/tx/0xdfb4cb806bc51b0b6fb2deae7544e3fdd3c14b5e9b27a681fd1555d0150b17ce) and [machine-checkable manifest](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/proof.json). Say: “This proves test-GEN settlement and approval invalidation for this recorded case; it does not prove physical delivery or browser-wallet writes.”
