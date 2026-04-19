# Phase 10c — Live Trading Wiring Audit

## Context
This is a Polymarket prediction market trading bot (TypeScript, Node.js, Polygon chain ID 137). It's been running in PAPER mode successfully. We're preparing for the first live trade. Before configuring credentials and going live, I need a complete map of how the live trading path is wired today.

**Do NOT modify any code.** This is a read-only audit.

## What To Do

Read the following files and produce a single report answering every question below. Read each file fully — don't skim.

### Files to read (in this order):

1. `src/wallets/polymarket_wallet.ts` — the live wallet implementation
2. `src/wallets/wallet_manager.ts` — how wallets are registered and selected
3. `src/wallets/paper_wallet.ts` — for comparison with live wallet interface
4. `src/execution/trade_executor.ts` — how orders flow from strategy to wallet
5. `src/execution/order_tracker.ts` — how pending orders are polled and filled
6. `src/core/config_loader.ts` — how config.yaml is parsed, especially wallet/live trading sections
7. `src/core/config_validator.ts` — what validations run at startup for live mode
8. `src/reporting/dashboard_server.ts` — how dashboard creates wallets (search for `new PaperWallet` and `new PolymarketWallet` and `registerWallet`)
9. `src/cli.ts` or `src/index.ts` — the main entry point, how everything is wired together
10. `config.yaml` — current configuration
11. `.env` — current environment variables (redact any real secrets, just confirm which vars are set vs empty)
12. `package.json` — check for `@polymarket/clob-client` dependency and version
13. `LIVE_MIGRATION_GUIDE.md` — reference for intended live setup
14. `polymarket-phase10-go-live-walkthrough.md` — reference for the 10-step plan

### Questions to answer in the report:

**A. Live Wallet Creation Path**
1. Does `PolymarketWallet` exist and is it fully implemented?
2. What constructor arguments does it require?
3. Where can a `PolymarketWallet` be instantiated? (config.yaml path? dashboard path? both? neither?)
4. Is there a dashboard UI flow for creating a LIVE wallet, or only PAPER wallets?
5. If the dashboard only creates paper wallets, what's the path to get a live wallet running?

**B. Credential Flow**
1. Which env vars does `PolymarketWallet` read? List every `process.env.XXXXX` reference.
2. Does it support per-wallet credentials or only global env vars?
3. How does the CLOB client get instantiated? Show the exact constructor call.
4. What signature type is used (0 = EOA, 1 = Gnosis Safe, 2 = Polymarket proxy)?

**C. Order Execution Path (Live)**
1. Trace the full path: Strategy signal → trade_executor → wallet.submitOrder() → CLOB API call. What happens at each step?
2. What does `submitOrder()` return? How does OrderResult differ between paper and live?
3. What are the 8 pre-flight checks in polymarket_wallet.ts? List each one.
4. How are order IDs handled? (CLOB-assigned vs locally generated)
5. Does order_tracker.ts handle live orders differently from paper orders?

**D. Balance & Risk Management (Live)**
1. How does PolymarketWallet track balance? Internal state? On-chain query? Both?
2. Where is the on-chain reconciliation logic?
3. How does the balance reservation pattern work for live orders?
4. What happens if a live order is partially filled?
5. How does the daily loss limit integrate with the kill switch?

**E. Configuration Requirements**
1. What exact config.yaml structure is needed for a live wallet? Show the expected YAML shape.
2. What does config_validator.ts check for live mode? List every validation.
3. Are there any hardcoded values (URLs, chain IDs, contract addresses) that need verification?
4. What's the `ENABLE_LIVE_TRADING` env var check? Where is it enforced?

**F. Dependencies & Versions**
1. What version of `@polymarket/clob-client` is installed?
2. Are there any other Polymarket-related dependencies?
3. Is `ethers` v5 or v6? This matters for wallet/signer compatibility.

**G. Gap Analysis**
1. List anything that looks incomplete, stubbed out, or TODO-marked in the live path.
2. Are there any code paths that would silently fall back to paper mode?
3. Any error handling gaps that could lose money (e.g., order submitted but not tracked)?
4. Does the dashboard need changes to support live wallet monitoring?

## Output Format

Write the report as `PHASE_10C_WIRING_AUDIT.md` in the project root. Use the section headers A–G above. For each answer, include the exact file and line number where you found the evidence. If something is missing or unclear, say so explicitly — don't guess.

At the end, include a section called **"Go-Live Readiness Verdict"** with:
- ✅ Ready (no changes needed)
- ⚠️ Ready with caveats (list them)
- ❌ Blocked (list what needs to be fixed first)
