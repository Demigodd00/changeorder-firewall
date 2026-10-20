# Two-minute reviewer demo

This is a script for a screen recording or live walkthrough, not a claim that a video already exists. Use the [public app](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/) and the links below. No wallet is required for this recorded case.

**0:00–0:20 — The problem.** “A buyer may approve work, then sign a change order that quietly changes the requirement. A simple approval flag no longer tells us which version was approved.” Point to the hero diagram: T1 is a CSV schema, T3 depends on it, and T2 is independent.

**0:20–0:45 — The GenLayer boundary.** Open “How it works.” Explain that validators independently classify the meaning of one old/new clause as `MATERIAL`, `NON_MATERIAL` or `UNCLEAR`. The contract compares only the canonical decision field; code—not AI—chooses the affected dependency closure, parties, deadlines and fixed amounts.

**0:45–1:15 — The live amendment.** In “Live proof,” open the [materiality receipt](https://explorer-studio.genlayer.com/tx/0x9c4a9783167b67df1cba06af30ee5e63d59dd4396c3c5f4c95d836212e25cd23), then [amendment finalization](https://explorer-studio.genlayer.com/tx/0x645cfdb212fd0297d223430e630afadb47c05ae5136e8bf29390e43544107a9b). Show the saved post-amendment generations `[1,0,1]`: T1 and T3 require fresh approval, T2 does not.

**1:15–1:40 — The negative and positive cases.** Open the [expected failed stale T1 claim](https://explorer-studio.genlayer.com/tx/0xab2b0cd728bd66c5251bdc8a51848bfcc14185ee8a56b813c8b456bce8330faf) and the [successful unaffected T2 claim](https://explorer-studio.genlayer.com/tx/0xc55bf8718f0de7fab1230e66711a9912d971007239d2ee03245cd0336510d38f). The failure left state unchanged; T2's prior approval remained usable.

**1:40–2:00 — Final accounting and honest limit.** Scroll to “Review an order” to show finalized state: all three terms claimed, revision 1, reserve zero. Link the [withdrawal](https://explorer-studio.genlayer.com/tx/0x722a50041e988f6d879c96422da4b11dd1300c16ec48c3def6390e6173021b5f) and [machine-checkable manifest](https://changeorder-firewall-studionet.esuspsychic.chatgpt.site/proof.json). Say: “This proves test-GEN settlement and approval invalidation for this recorded case; it does not prove physical delivery or current-version browser-wallet writes.”
