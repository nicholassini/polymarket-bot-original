# Polymarket Bot — Overnight Audit Report
**Generated:** 2026-04-09 ~20:50 EDT  
**Bot Runtime:** ~13 hours 22 minutes (started 07:25:38 EDT)  
**Process PID:** 935 | **Mode:** PAPER (all wallets)

---

## 1. Executive Summary

- **Bot is running and profitable.** 9 of 18 wallets are actively trading right now. Portfolio gross PnL is **+$2,947** on $875 total capital deployed (337% paper return) across 13+ hours.
- **Top strategy: user_defined** contributed +$1,465 (49.7% of all profits). Market making contributed +$962 (32.6%). Both are significantly outperforming other strategies.
- **Critical: 6 wallets have stopped trading entirely** — including `paper_market_making` (stopped 9.5 hrs ago), `paper_cross_market_arb` (5.4 hrs ago), `wallet_1/2/3` (11-13 hrs ago). Cause is unclear — possible open-position cap hit or capital exhaustion. Investigation needed.
- **Momentum strategy is consistently losing money** (-$4.98 combined, low win rates ~36%). Both momentum wallets are still active and accumulating losses.
- **Memory is stable and healthy** — current RSS ~540-560MB, within the expected 600MB baseline. No OOM warnings. One 13-minute Gamma API outage at ~09:15-09:28 EDT; bot self-recovered with no data loss.

---

## 2. Performance Dashboard

### By Strategy (Aggregated Across All Wallets)

| Strategy | Wallets | Trades | Volume ($) | Gross PnL ($) | Win Rate | Status |
|---|---|---|---|---|---|---|
| user_defined | paper_user_defined, user_d0b27 | 11,010 | 5,165 | **+$1,465.41** | ~74% | ACTIVE |
| market_making | wallet_3, paper_market_making, ma | 50,635 | 26,912 | **+$961.50** | ~97% (ma) | MIXED ⚠️ |
| ai_forecast | wallet_2, paper_ai_forecast, ai_d0b28f78 | 5,094 | 1,651 | **+$256.82** | ~72% | ACTIVE |
| cross_market_arb | wallet_1, paper_cross_market_arb, arb_d0b27 | 30,662 | 38,518 | **+$180.91** | varied | MIXED ⚠️ |
| mispricing_arb | paper_mispricing_arb, mispd_d0b28f78 | 17,044 | 9,462 | **+$87.07** | varied | MIXED ⚠️ |
| convergence | wallet_4, paper_convergence, highprob_d0b28f78 | 170 | 150 | **+$0.55** | ~28% | IDLE ⚠️ |
| momentum | paper_momentum, momentum_d0b28f78 | 2,890 | 4,021 | **-$4.98** | ~36% | ACTIVE ❌ |
| **TOTAL** | **18 wallets** | **117,480** | **$83,098** | **+$2,947.28** | | |

> **Note:** No fee column exists in the `trades` table — fee analysis unavailable. Net PnL = Gross PnL.

### Per-Wallet Detail

| Wallet | Strategy | Capital ($) | Balance ($) | Realized PnL ($) | ROI | Last Trade | Status |
|---|---|---|---|---|---|---|---|
| user_d0b27 | user_defined | 100 | 906.44 | +808.87 | +809% | <1s ago | ACTIVE |
| ma | market_making | 50 | 444.79 | +703.07 | +1,406% | <1s ago | ACTIVE |
| paper_user_defined | user_defined | 50 | 703.57 | +656.54 | +1,313% | <1s ago | ACTIVE |
| paper_market_making | market_making | 50 | 175.19 | +196.37 | +393% | 9.5 hrs ago | STOPPED ⚠️ |
| paper_ai_forecast | ai_forecast | 50 | 182.29 | +133.97 | +268% | <1 min ago | ACTIVE |
| arb_d0b27 | cross_market_arb | 100 | 47.21 | +128.84 | +129% | <1s ago | ACTIVE |
| ai_d0b28f78 | ai_forecast | 50 | 170.38 | +123.22 | +246% | <1 min ago | ACTIVE |
| paper_mispricing_arb | mispricing_arb | 55 | 45.62 | +97.48 | +177% | <1s ago | ACTIVE |
| wallet_3 | market_making | 5 | 49.37 | +62.06 | +1,241% | 11.9 hrs ago | STOPPED ⚠️ |
| paper_cross_market_arb | cross_market_arb | 60 | 43.47 | +48.69 | +81% | 5.4 hrs ago | STOPPED ⚠️ |
| wallet_1 | cross_market_arb | 10 | 10.75 | +3.38 | +34% | 13.4 hrs ago | STOPPED ⚠️ |
| highprob_d0b28f78 | convergence | 50 | 43.09 | +0.48 | +1% | 1.4 hrs ago | IDLE |
| wallet_4 | convergence | 20 | 14.58 | +0.04 | +0.2% | 1.5 hrs ago | IDLE |
| paper_convergence | convergence | 60 | 51.27 | +0.03 | +0.05% | 1.5 hrs ago | IDLE |
| wallet_2 | ai_forecast | 5 | 3.16 | -0.37 | -7.3% | 13.1 hrs ago | STOPPED |
| paper_momentum | momentum | 60 | 40.09 | -0.50 | -0.8% | <2 min ago | ACTIVE ❌ |
| momentum_d0b28f78 | momentum | 50 | 32.49 | -4.48 | -9% | <2 min ago | ACTIVE ❌ |
| mispd_d0b28f78 | mispricing_arb | 100 | 84.24 | -10.41 | -10.4% | 12.9 hrs ago | STOPPED |

---

## 3. Trade Activity Timeline

| Hour (EDT) | Trades | Volume ($) | Hourly PnL ($) |
|---|---|---|---|
| 07:00–08:00 | 7,905 | 5,166 | +235.37 |
| 08:00–09:00 | 14,251 | 9,767 | +319.77 |
| 09:00–10:00 | 11,774 | 8,307 | +277.11 |
| 10:00–11:00 | 11,412 | 7,257 | **+380.49 ← peak** |
| 11:00–12:00 | 9,227 | 6,730 | +234.70 |
| 12:00–13:00 | 8,204 | 6,985 | +104.75 ← dip |
| 13:00–14:00 | 8,426 | 6,990 | +137.72 |
| 14:00–15:00 | 8,281 | 5,747 | +166.49 |
| 15:00–16:00 | 7,348 | 4,989 | +237.50 |
| 16:00–17:00 | 6,575 | 4,800 | +181.54 |
| 17:00–18:00 | 6,176 | 4,208 | +109.51 |
| 18:00–19:00 | 6,206 | 4,128 | +129.85 |
| 19:00–20:00 | 6,507 | 4,687 | +232.36 |
| 20:00–20:50* | 5,565 | ~3,337 | +202.24 |

*Partial hour — captured at ~20:50 EDT

**Trend:** Trade volume declined steadily as wallets hit position/capital limits. PnL per hour remained positive throughout — the bot was profitable in every single hour of operation. The 12:00-14:00 dip coincides with when paper_cross_market_arb and other wallets stopped trading.

---

## 4. Issues Found

### CRITICAL

| # | Issue | Detail |
|---|---|---|
| C1 | **6 wallets stopped trading** | `paper_market_making` (9.5hrs), `paper_cross_market_arb` (5.4hrs), `wallet_1` (13.4hrs), `wallet_2` (13.1hrs), `wallet_3` (11.9hrs), `mispd_d0b28f78` (12.9hrs). No errors logged for these wallets. Likely hit `max_open_trades` cap or capital is fully deployed in open positions with no cash to trade. |
| C2 | **1,304 zero-cost trades recorded** | 1.1% of all trades have `size ≤ 0` and `cost = 0`. These may be cancelled/rejected orders still being written to the DB, or a logging bug in the paper trading engine. If phantom fills, trade counts and PnL attribution are distorted. |

### WARNING

| # | Issue | Detail |
|---|---|---|
| W1 | **Momentum strategy losing money** | Combined -$4.98. Win rate ~36%, both wallets still actively trading and accumulating losses. Avg loss (-$0.040-0.044) is comparable to avg win ($0.051-0.075), so profit factor < 1.0. |
| W2 | **Gamma API instability** | 36 WARN + 1 ERROR for Gamma API fetch failures (AbortError, SocketError). Major cluster at 09:15-09:28 EDT (~13 min). Bot self-recovered each time. Sporadic failures continuing throughout the day. |
| W3 | **Memory grew significantly from start** | 429MB at 08:17 → 559MB at 11:07 → stabilized ~540-560MB. 130MB growth over 4 hours, then GC stabilized it. Below 600MB baseline. Monitor if bot runs 24+ hours. |
| W4 | **Convergence strategy near-idle** | Only 170 total trades across all 3 convergence wallets in 13 hours (~13 trades/hour total). The 8-filter scan is highly selective (12-16 of 1,000 markets pass per cycle). May not justify capital allocation. |
| W5 | **`mispd_d0b28f78` large per-trade losses** | This mispricing wallet (stopped) had avg_loss of -$1.88 vs avg_win of $0.47. High-variance strategy with poor outcome on small sample (167 trades, -$10.41 loss). |

### INFO

| # | Issue | Detail |
|---|---|---|
| I1 | **Internal dashboard unreachable** | Port 3000 returns a marketing website (polytradingbot.xyz), not the bot's internal dashboard. `/healthz` endpoint not accessible. |
| I2 | **`paper_cross_market_arb` capital locked** | 50 open positions with $73.82 estimated exposure on $60 capital. Wallet stopped, capital is frozen in positions. |
| I3 | **`ma` wallet has 130 open positions** | $308.28 estimated exposure on $50 capital (~6× leverage via paper positions). Highest concentration of any wallet. |
| I4 | **`arb_d0b27` 33% win rate but profitable** | Wins=3,039 (33%), losses=6,229 (57%). Positive PnL (+$128.84) because avg win ($0.088) is 4× avg loss ($0.022). Classic arb profile — frequent small losses, occasional larger wins. |

---

## 5. Strategy Analysis

### Top Performer: user_defined

- **Combined PnL:** +$1,465.41 (49.7% of all portfolio profits)
- **Trades:** 11,010 | **Avg trade size:** $0.47
- **Win rate:** ~74% | **Avg win:** $0.43 | **Avg loss:** -$0.20
- **Profit factor:** ~1.7× (wins outsize losses in both frequency and magnitude)
- **Best single trade:** $0.89 | **Worst single trade:** -$0.47
- Both wallets (`user_d0b27`, `paper_user_defined`) actively trading right now.
- `user_d0b27` turned $100 → $906 (906% return), `paper_user_defined` turned $50 → $703 (1,313%).
- **Assessment:** Strongest and most consistent strategy. If this holds with realistic fill simulation, it merits the largest live capital allocation.

### Worst Performer: momentum

- **Combined PnL:** -$4.98
- **Trades:** 2,890 | **Avg trade size:** $1.39
- **Win rate:** ~36% | **Avg win:** $0.063 | **Avg loss:** -$0.040
- Both wallets still active and accumulating losses.
- **Assessment:** Buying into trends that reverse. The 36% win rate with near-parity reward:risk is a losing formula. Pause or reconfigure before live trading — tighten stop-losses or raise minimum signal confidence.

### Notable Concern: market_making (`ma`) 97% win rate

- **PnL:** +$703.07 on $50 capital | **Trades:** 36,410
- **Win rate:** 97.4% (17,594 wins, 463 losses out of 35,947 non-flat trades)
- This is almost certainly a paper trading artifact. Real market making faces adverse selection, spread, delayed fills, and toxicity from informed flow — none of which paper simulation captures. Validate against historical tick data with realistic fill model before attributing this result to strategy alpha.

---

## 6. Portfolio PnL Summary

```
Total Portfolio Gross PnL:  +$2,947.28
Total Capital Deployed:       $875.00
Portfolio Return (paper):      +336.8%

Profitable wallets:     14 / 18
Losing wallets:          2 / 18 (momentum_d0b28f78: -$4.48, mispd_d0b28f78: -$10.41)
Near-zero wallets:       2 / 18 (wallet_2: -$0.37, paper_convergence: +$0.03)

Unique markets traded:   650
Open positions:          405 total (across 18 wallets)
Largest single win:      +$5.72 (arb_d0b27, market_id 1796496)
Largest single loss:     -$3.48 (mispd_d0b28f78)
Avg trade size:          $0.71
Total trades:            117,480 (~2.5 trades/second sustained)
```

---

## 7. Process Health

```
PID:         935
RSS Memory:  ~540-560 MB (stable, below 600 MB baseline)
Runtime:     ~13 hours 22 minutes
Memory arc:  429 MB → 559 MB → stabilized ~540 MB (GC working)
Crashes:     0
Restarts:    0
OOM events:  0
Kill switch: Not triggered
```

---

## 8. Log Summary

```
ERRORs:   1  — "Gamma API page request failed after retries" (09:18 EDT, isolated)
WARNs:   36  — All "Gamma API fetch error, retrying" (all self-recovered)
INFO:    ~427K lines of normal operation
Crashes:  0
Uncaught exceptions: 0
```

Gamma API failures clustered at 09:15–09:28 EDT (13 min), then sporadic single-failure retries throughout the day. All recovered. No kill switch triggers, no unhandled rejections.

---

## 9. Recommendations

### Do immediately
1. **Investigate the 6 stopped wallets.** Check if `max_open_trades` is too restrictive or if these wallets depleted free cash into positions with no recycling logic. `paper_market_making` and `paper_cross_market_arb` stopped hours ago and are leaving money on the table.
2. **Pause momentum strategy.** Both wallets are losing at 36% win rate with no signs of improvement. Don't let this run into a live deployment losing real capital.
3. **Audit zero-cost trades (1,304 records).** Determine if these represent cancelled orders, simulator bugs, or something else. If they are phantom records, they inflate trade counts and may corrupt PnL tracking.

### Before going live
4. **Replace paper fill simulation for market_making.** A 97% paper win rate is a red flag — real fills will not match. Build a realistic fill model (adverse selection, spread, order book impact) before trusting this strategy's results.
5. **Tune `max_open_trades` per wallet.** Many wallets are stalling due to open position accumulation. Set limits based on capital × expected hold time, not a flat count.
6. **Add a `fee_amount` column to trades.** Polymarket charges a 2% fee. Currently impossible to compute real net PnL.
7. **Add Gamma API circuit breaker.** If failure rate exceeds a threshold in any 10-minute window, alert and potentially pause market scans to avoid missed signals during outages.

### What's working well
- **user_defined and ai_forecast** show consistent positive results with high win rates and good profit factors. Prioritize these for live capital.
- **Retry logic** for Gamma API failures works correctly — the one hard ERROR recovered without human intervention.
- **Memory management** is stable after an initial growth phase. No leaks detected over 13+ hours.
- **Zero crashes or restarts** in 13+ hours of continuous operation. The bot is stable.
