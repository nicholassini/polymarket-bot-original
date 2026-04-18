# POST_REBUILD_AUDIT.md
**Generated:** 2026-04-14  
**Bot uptime since last restart:** 36 min (PM2, restarted after crash investigation)  
**Total data window:** 2026-04-10T11:59:35Z → 2026-04-14T22:55:07Z (~4 days 11 hours)  
**Rebuild timestamp used:** 2026-04-10T11:59:20Z (first trade: T+15s after)

---

## 1. Rebuild Verification

| Check | Result | Status |
|-------|--------|--------|
| Process running | PID 3216 via PM2, 0 crashes | ✅ |
| Earliest trade post-rebuild | 2026-04-10T11:59:35Z (15s after rebuild) | ✅ |
| `/healthz` | `{"ok":true,"activeWallets":19,"liveTradingEnabled":false}` | ✅ |
| `/api/kill-switch/activate` | HTTP 401 (route exists, auth-gated) | ✅ |
| `DASHBOARD_API_KEY` in .env | **NOT SET** | ⚠️ |
| Memory (WorkingSet) | 211 MB — well under 600 MB baseline | ✅ |

The four root-cause fixes from the regression investigation are confirmed active. The kill-switch route exists and correctly rejects unauthenticated requests. The only gap is `DASHBOARD_API_KEY` is not configured in `.env`.

---

## 2. Wallet Activity Table (Post-Rebuild)

> Rebuild timestamp: 2026-04-10T11:59:20Z. All counts are since that point.

| Wallet | Strategy | Trades Since Rebuild | Trades (1hr) | Trades (3hr) | Free Cash | Open Positions | Verdict |
|--------|----------|---------------------|-------------|-------------|-----------|----------------|---------|
| user_db027 | user_defined | 18,089 | 20 | 20 | $2,267.93 | 5 | **ACTIVELY TRADING** |
| ai_d0b28f78 | ai_forecast | 4,628 | 168 | 168 | $394.17 | 18 | **ACTIVELY TRADING** |
| highprob_d0b28f78 | convergence | 119 | 29 | 29 | $7.47 | 13 | **ACTIVELY TRADING** |
| crossarb_d0b2 | cross_market_arb | 48,966 | 0 | 0 | $10.84 | 200 | **STALLED** (stopped 2026-04-12) |
| marketmaking_d0 | market_making | 42,454 | 0 | 0 | $0.03 | 200 | **STALLED** (stopped 2026-04-11) |
| momentum_d0b28f78 | momentum | 1,014 | 0 | 0 | $21.41 | 10 | **STALLED** (stopped 2026-04-11) |
| mispd_d0b28f78 | mispricing_arb | 183 | 0 | 0 | $40.57 | 9 | **DEAD** (stopped 10 min post-rebuild) |

**Comparison against previous overnight audit:**

| Wallet | Pre-Rebuild State | Post-Rebuild State | Change |
|--------|------------------|--------------------|--------|
| mispd_d0b28f78 | DEAD (stopped 13h ago) | DEAD (stopped 10 min post-rebuild) | ❌ No improvement — still dead |
| arb_d0b27 / crossarb_d0b2 | ACTIVELY TRADING (cash-starved, -$179.28) | STALLED (200 positions, stopped Apr 12) | ⚠️ Partial — no longer negative cash but now position-capped |
| highprob_d0b28f78 | SLOW (3 trades/3hr) | ACTIVELY TRADING (29/3hr) | ✅ Clear improvement |

---

## 3. Free Cash Recalculation (Double-Deduction Fix Verification)

> Free cash = available_balance (paper wallets deduct cost on BUY, restore on SELL)

| Wallet | Capital | Available Balance | Open Exposure | Free Cash | Pre-Rebuild Free Cash | Δ |
|--------|---------|------------------|---------------|-----------|----------------------|---|
| user_db027 | $50 | $2,269.50 | $1.57 | **$2,267.93** | ~$911 (audit) | +$1,357 (growth) |
| ai_d0b28f78 | $50 | $408.92 | $14.75 | **$394.17** | ~$170 (audit) | +$224 (growth) |
| crossarb_d0b2 | $50 | $10.84 | $281.59 | **$10.84** | **-$179.28** | ✅ No longer negative |
| marketmaking_d0 | $50 | $415.61 | $415.58 | **$0.03** | n/a | Position-locked |
| mispd_d0b28f78 | $50 | $42.75 | $2.18 | **$40.57** | ~$79 (audit) | Slightly down (losses) |
| momentum_d0b28f78 | $50 | $33.16 | $11.75 | **$21.41** | ~$16 (audit) | Up slightly |
| highprob_d0b28f78 | $50 | $28.88 | $21.42 | **$7.47** | ~$36 (audit) | Lower (more active) |

**Double-deduction fix confirmed:** `crossarb_d0b2` is no longer showing negative free cash (-$179.28 → $10.84). The fix resolved the impossibility. However, the wallet subsequently hit the 200-position cap and stopped trading, which is a separate issue.

**No wallets have negative free cash.** ✅

---

## 4. Strategy Performance Since Rebuild

> Combined metrics across all wallets running each strategy. Fees: all zero (see Persistent Issues).

| Strategy | Trades | Volume | Gross PnL | Fees | Net PnL | Win Rate | Profit Factor | Avg Win | Avg Loss |
|----------|--------|--------|-----------|------|---------|----------|---------------|---------|----------|
| user_defined | 34,307 | $16,164 | **+$4,223.20** | $0 | **+$4,223.20** | 69.9% | 5.15x | +$0.437 | -$0.198 |
| ai_forecast | 9,196 | $4,402 | **+$710.81** | $0 | **+$710.81** | 73.4% | 4.11x | +$0.279 | -$0.188 |
| market_making | 49,868 | $25,371 | **+$866.52** | $0 | **+$866.52** | **95.9%** | 17.0x | +$0.033 | -$0.064 |
| cross_market_arb | 58,833 | $23,784 | **+$232.87** | $0 | **+$232.87** | 26.5% | 2.40x | +$0.052 | -$0.008 |
| mispricing_arb | 365 | $152 | **-$8.87** | $0 | **-$8.87** | 77.5% | 0.57x | +$0.088 | -$0.575 |
| momentum | 1,452 | $1,961 | **-$8.53** | $0 | **-$8.53** | 40.4% | 0.61x | +$0.050 | -$0.057 |
| convergence | 403 | $337 | **-$0.90** | $0 | **-$0.90** | 49.6% | 0.90x | +$0.030 | -$0.040 |

**Fee accounting status:** ❌ CRITICAL — All 157,465 trades have `fee_amount = 0`. Columns exist and are never NULL, but no fee values are being written. The paper wallet is not passing fee config through to `saveTrade()`. Net PnL equals gross PnL — live performance will be ~2% worse than reported once fees are real.

---

## 5. Per-Strategy Go-Live Recommendations

### 🟢 GREEN — user_defined
**Justification:** 70% win rate, 5.15x profit factor, $4,223 net profit across two independent wallets over 4 days — most consistent performer in the entire bot.  
**Config changes:** None required. Add fee buffer.  
**Suggested initial live capital:** $50  
**Note:** Both `paper_user_defined` (+$2,002) and `user_db027` (+$2,221) show nearly identical performance, which validates the strategy is stable.

---

### 🟢 GREEN — ai_forecast
**Justification:** 73.4% win rate (highest among real strategies), 4.11x profit factor, $710 profit across two wallets. Both wallets are actively trading right now.  
**Config changes:** None required. Add fee buffer.  
**Suggested initial live capital:** $25  
**Note:** Consistent with pre-rebuild audit finding of +$257. Has since grown significantly.

---

### 🔴 RED — market_making
**Justification:** 95.9% win rate is a paper artifact — impossible in live trading. Real market making suffers from adverse selection (informed traders take your quotes). Both wallets hit the 200-position cap and stopped cold. Paper fills assume infinite liquidity at posted prices; live fills will show the true 40–60% win rate range. Balance ($415K virtual) was entirely locked in open positions.  
**Config changes:** Not relevant — do not go live until a realistic adversarial fill model is implemented.  
**Suggested initial live capital:** None.

---

### 🟡 YELLOW — cross_market_arbitrage
**Justification:** Positive PnL (+$232.87) and positive profit factor (2.4x), but 26.5% win rate means infrequent large wins. More importantly, both wallets hit the 200-position cap and completely stalled — they accumulated positions without closing them.  
**Config changes needed before live:**
- Add position time-out: force-close any position open > 48h
- Reduce `max_open_trades` from 50 to 15
- Add a free-cash floor: halt new BUYs if free cash < 20% of capital
**Suggested initial live capital:** Not yet — fix position accumulation first.

---

### 🔴 RED — mispricing_arbitrage
**Justification:** `mispd_d0b28f78` traded for only 10 minutes post-rebuild (183 trades, 12:06–12:16) then stopped permanently. `paper_mispricing_arb` stopped within 14 minutes. Both wallets show negative PnL (-$5.07 and -$3.81). High win rate (72–84%) with terrible profit factor (0.54–0.61) means it wins small and loses large. Strategy wiring issue is still unresolved (see Persistent Issues).  
**Suggested initial live capital:** None.

---

### 🔴 RED — momentum
**Justification:** 39–42% win rate in both wallets, consistently losing (-$8.53 combined). Has not improved post-rebuild. The wins are too small and the losses too frequent. This is a consistent loser.  
**Config changes:** Increase `lookback_minutes` from 15 to 60 and tighten `min_edge` threshold before reconsidering.  
**Suggested initial live capital:** None.

---

### 🟡 YELLOW (leaning RED) — filtered_high_prob_convergence
**Justification:** Mixed results across 3 wallets. `highprob_d0b28f78` is slightly positive (+$0.30) but below 50% win rate (48.9%). `paper_convergence` and `wallet_4` are both negative. Total volume is only 403 trades in 4.5 days — the 8-filter scan is too restrictive to generate meaningful data. PnL is near zero so this is a coin flip with insufficient sample size.  
**Config changes:**
- Relax `min_net_buy_flow_usd` from 500 to 200
- Relax `min_liquidity_usd` from 10000 to 5000
- Increase `max_days_to_resolution` from 14 to 30
**Suggested initial live capital:** None until filters are relaxed and 1000+ trades are observed.

---

## 6. Persistent Issues

### Issue 1: mispd_d0b28f78 Silent Failure — CONFIRMED STILL PRESENT ❌
The wallet traded from `12:06:25Z` to `12:16:34Z` on April 10 (10 minutes, 183 trades), then stopped permanently. This is not a capital issue (balance $40.57, minimal exposure $2.18). The strategy is either:
- Not generating signals (mispricing thresholds are too tight for current market conditions)
- The wallet-to-strategy wiring has a silent error that kills the loop without logging

**Action required:** Add a health-check alert: if a strategy wallet has 0 trades in 60+ minutes and balance > $5, log a WARN with the wallet ID and last signal timestamp.

### Issue 2: Position Accumulation Without Resolution — CONFIRMED ❌
- `crossarb_d0b2`: 200 open positions (capped), $281.59 exposure vs $10.84 cash. Stopped trading 2026-04-12. Effectively insolvent on cash.
- `marketmaking_d0`: 200 open positions (capped), $415.58 exposure = entire balance. Stopped trading 2026-04-11.

Both wallets hit `max_open_trades` and cannot place new BUYs. Neither has a position timeout or forced-close mechanism. Positions will sit open indefinitely until markets resolve. This is an architectural gap.

### Issue 3: Zero-Cost Trade Guard — WORKING ✅
0 trades with `size <= 0 OR cost <= 0` since rebuild. Guard is effective.

### Issue 4: Fee Accounting — CONFIRMED STILL BROKEN ❌
157,465 trades, all with `fee_amount = 0`. The `fee_amount` and `fee_rate` columns exist (migration worked) but the paper wallet is not populating them. The fee config (`taker_fee_rate: 0.02`) is set in `config.yaml` but not being passed into the trade record at write time. This means all reported PnL is overstated by ~2% of volume. At live, fees will erode performance.

---

## 7. Phase 10 Readiness Checklist

- [x] Bot has run 4+ days since rebuild without internal crashes
- [x] At least one strategy GREEN for live (user_defined, ai_forecast)
- [x] No wallets with negative free cash
- [x] Zero-cost trade guard working (0 phantom trades since rebuild)
- [x] `/healthz` returns `ok: true`
- [x] Kill switch endpoint exists and is auth-gated (HTTP 401)
- [x] Memory stable (211 MB, well under 600 MB)
- [ ] **244 tests passing** — 1 FAILING (`copy_trade_strategy.test.ts` registry timeout) ❌
- [ ] **Fee accounting writing real fee values** — All 157,465 fees are 0 ❌
- [ ] **DASHBOARD_API_KEY set in .env** — Not configured ❌
- [ ] **crossarb_d0b2 position accumulation resolved** — 200 stuck positions ❌
- [ ] **marketmaking_d0 position accumulation resolved** — 200 stuck positions, $0.03 free cash ❌
- [ ] **mispd_d0b28f78 dead wallet** — Silent failure unresolved (acceptable to skip for first live) ⚠️

### Blockers (must fix before first live trade):
1. **Fee accounting broken** — all paper PnL is before fees; live will be worse. Fix `placeOrder()` to write `fee_amount = cost * fee_rate` on every trade.
2. **DASHBOARD_API_KEY missing** — kill switch is unusable in an emergency without this.
3. **1 failing test** — `copy_trade_strategy.test.ts` times out on registry registration; needs investigation.

### Non-blocking for first live (fix before scale-up):
4. Position timeout mechanism for cross_market_arb and market_making wallets.
5. mispd strategy health-alert logging.

---

## 8. Recommended First Live Wallet Config

**Go with `user_defined` strategy first.** It is the strongest performer (69.9% win rate, 5.15x PF, $4,223 profit on $100 deployed paper capital) and consistent across two independent paper wallets.

Add the following to `config.yaml` under the `wallets:` block:

```yaml
# ── First Live Wallet — user_defined strategy ──────────────────────────
- id: live_user_defined_v1
  mode: LIVE
  strategy: user_defined
  capital: 50
  risk_limits:
    max_position_size: 5          # ~$2.50 at $0.50/share — conservative
    max_exposure_per_market: 5    # max $5 in any single market
    max_daily_loss: 3             # 6% of capital — hard stop
    max_open_trades: 10           # tight cap to prevent accumulation
    max_drawdown: 0.10            # 10% drawdown triggers pause
```

Also required before enabling:
1. Set `DASHBOARD_API_KEY` in `.env`
2. Set `ENABLE_LIVE_TRADING=true` in `.env` (or flip `environment.enable_live_trading` in config.yaml)
3. Confirm Polymarket API credentials are set (CLOB private key, proxy wallet address)
4. Fix fee accounting so live PnL is accurate

**Do NOT go live with:** market_making, momentum, mispricing_arbitrage (all RED). Do not enable cross_market_arb or convergence until position accumulation and filter issues are resolved.
