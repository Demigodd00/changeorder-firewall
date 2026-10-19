# Live StudioNet operations

`node web/scripts/live.mjs init` creates two **test-only** local wallets and prints their public addresses and balances. Their private keys stay in ignored `deploy/.wallets.json`; never commit, publish, reuse, or fund them with real assets. Back up that file before trying a funded demo. Losing it means losing the ability to countersign, approve, or claim in the demo.

`node web/scripts/live.mjs deploy` checks that the contract's working bytes equal the pushed Git blob, saves the deployment transaction hash immediately to ignored `deploy/.live-journal.json`, waits for finality and execution success, and saves the contract address and finalized initial read. Re-run the same command to resume a pending deployment rather than submitting a duplicate.

The runner probe is in `tests/integration/test_runner_probe.py`. It is intentionally small and uses a disposable auto-generated account. A passing probe does not prove the full project's LLM consensus or payable claims.

The live demo has completed. `node web/scripts/live.mjs screen`, `activate`, `amend`, and `settle` resume from saved hashes. Do not delete the ignored journal or test-wallet file while reproducing these checks. `node web/scripts/export-proof.mjs` validates the saved results and regenerates `deploy/proof.json` and the frontend's `web/public/proof.json`. The exporter never reads private keys. The public-safe manifest is a record of this specific test-only order, not a general security guarantee.
