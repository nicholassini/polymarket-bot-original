import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../reporting/logs';

export interface TradeRecord {
  orderId: string;
  walletId: string;
  marketId: string;
  tokenId?: string;
  conditionId?: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  price: number;
  size: number;
  cost: number;
  fee: number;
  txHash?: string;
  timestamp: string;
  status?: string;
}

export interface PersistedPosition {
  id?: number;
  walletId: string;
  marketId: string;
  tokenId?: string;
  conditionId?: string;
  outcome: string;
  side: string;
  size: number;
  avgPrice: number;
  totalCost: number;
  realizedPnl: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  updatedAt: string;
}

export class TradesDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const runtimeDir = path.join(process.cwd(), '.runtime');
    const resolved = dbPath ?? path.join(runtimeDir, 'trades.db');
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id    TEXT NOT NULL,
        wallet_id   TEXT NOT NULL,
        market_id   TEXT NOT NULL,
        token_id    TEXT,
        condition_id TEXT,
        side        TEXT NOT NULL,
        outcome     TEXT NOT NULL,
        price       REAL NOT NULL,
        size        REAL NOT NULL,
        cost        REAL NOT NULL,
        fee         REAL NOT NULL DEFAULT 0,
        tx_hash     TEXT,
        timestamp   TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'filled',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_trades_order  ON trades(order_id);

      CREATE TABLE IF NOT EXISTS positions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id    TEXT NOT NULL,
        market_id    TEXT NOT NULL,
        token_id     TEXT,
        condition_id TEXT,
        outcome      TEXT NOT NULL,
        side         TEXT NOT NULL DEFAULT 'BUY',
        size         REAL NOT NULL DEFAULT 0,
        avg_price    REAL NOT NULL DEFAULT 0,
        total_cost   REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        opened_at    TEXT NOT NULL,
        closed_at    TEXT,
        status       TEXT NOT NULL DEFAULT 'open',
        updated_at   TEXT NOT NULL,
        UNIQUE(wallet_id, market_id, outcome)
      );

      CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_id, status);

      CREATE TABLE IF NOT EXISTS balance_snapshots (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id           TEXT NOT NULL,
        pusd_balance        REAL NOT NULL,
        deployed_capital    REAL NOT NULL,
        open_position_count INTEGER NOT NULL,
        total_pnl           REAL NOT NULL,
        timestamp           TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_wallet ON balance_snapshots(wallet_id, timestamp);
    `);
  }

  recordTrade(trade: TradeRecord): void {
    try {
      this.db.prepare(`
        INSERT INTO trades (order_id, wallet_id, market_id, token_id, condition_id, side, outcome,
                            price, size, cost, fee, tx_hash, timestamp, status)
        VALUES (@orderId, @walletId, @marketId, @tokenId, @conditionId, @side, @outcome,
                @price, @size, @cost, @fee, @txHash, @timestamp, @status)
      `).run({
        orderId:     trade.orderId,
        walletId:    trade.walletId,
        marketId:    trade.marketId,
        tokenId:     trade.tokenId     ?? null,
        conditionId: trade.conditionId ?? null,
        side:        trade.side,
        outcome:     trade.outcome,
        price:       trade.price,
        size:        trade.size,
        cost:        trade.cost,
        fee:         trade.fee,
        txHash:      trade.txHash ?? null,
        timestamp:   trade.timestamp,
        status:      trade.status ?? 'filled',
      });
    } catch (err) {
      logger.warn({ err: String(err), orderId: trade.orderId }, 'trades_db: recordTrade failed');
    }
  }

  upsertPosition(pos: Omit<PersistedPosition, 'id' | 'status' | 'closedAt' | 'updatedAt'> & { status?: 'open' | 'closed' }): void {
    const now = new Date().toISOString();
    try {
      this.db.prepare(`
        INSERT INTO positions (wallet_id, market_id, token_id, condition_id, outcome, side,
                               size, avg_price, total_cost, realized_pnl, opened_at, status, updated_at)
        VALUES (@walletId, @marketId, @tokenId, @conditionId, @outcome, @side,
                @size, @avgPrice, @totalCost, @realizedPnl, @openedAt, @status, @updatedAt)
        ON CONFLICT(wallet_id, market_id, outcome) DO UPDATE SET
          size         = @size,
          avg_price    = @avgPrice,
          total_cost   = @totalCost,
          realized_pnl = @realizedPnl,
          side         = @side,
          updated_at   = @updatedAt
      `).run({
        walletId:    pos.walletId,
        marketId:    pos.marketId,
        tokenId:     pos.tokenId     ?? null,
        conditionId: pos.conditionId ?? null,
        outcome:     pos.outcome,
        side:        pos.side,
        size:        pos.size,
        avgPrice:    pos.avgPrice,
        totalCost:   pos.totalCost,
        realizedPnl: pos.realizedPnl,
        openedAt:    pos.openedAt ?? now,
        status:      pos.status ?? 'open',
        updatedAt:   now,
      });
    } catch (err) {
      logger.warn({ err: String(err), walletId: pos.walletId, marketId: pos.marketId }, 'trades_db: upsertPosition failed');
    }
  }

  closePosition(walletId: string, marketId: string, outcome: string, realizedPnl: number): void {
    const now = new Date().toISOString();
    try {
      this.db.prepare(`
        UPDATE positions
        SET status = 'closed', closed_at = ?, realized_pnl = ?, updated_at = ?
        WHERE wallet_id = ? AND market_id = ? AND outcome = ? AND status = 'open'
      `).run(now, realizedPnl, now, walletId, marketId, outcome);
    } catch (err) {
      logger.warn({ err: String(err), walletId, marketId }, 'trades_db: closePosition failed');
    }
  }

  loadOpenPositions(walletId: string): PersistedPosition[] {
    try {
      const rows = this.db.prepare(
        `SELECT * FROM positions WHERE wallet_id = ? AND status = 'open'`
      ).all(walletId) as Array<Record<string, unknown>>;
      return rows.map(this.rowToPosition);
    } catch (err) {
      logger.warn({ err: String(err), walletId }, 'trades_db: loadOpenPositions failed');
      return [];
    }
  }

  countOpenPositions(walletId?: string): number {
    try {
      if (walletId) {
        const row = this.db.prepare(
          `SELECT COUNT(*) as cnt FROM positions WHERE wallet_id = ? AND status = 'open'`
        ).get(walletId) as { cnt: number };
        return row.cnt;
      }
      const row = this.db.prepare(
        `SELECT COUNT(*) as cnt FROM positions WHERE status = 'open'`
      ).get() as { cnt: number };
      return row.cnt;
    } catch {
      return 0;
    }
  }

  getDeployedCapital(walletId: string): number {
    try {
      const row = this.db.prepare(
        `SELECT COALESCE(SUM(total_cost), 0) as total FROM positions WHERE wallet_id = ? AND status = 'open'`
      ).get(walletId) as { total: number };
      return row.total;
    } catch {
      return 0;
    }
  }

  snapshotBalance(
    walletId: string,
    pusdBalance: number,
    deployedCapital: number,
    openPositionCount: number,
    totalPnl: number,
  ): void {
    try {
      this.db.prepare(`
        INSERT INTO balance_snapshots (wallet_id, pusd_balance, deployed_capital, open_position_count, total_pnl, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(walletId, pusdBalance, deployedCapital, openPositionCount, totalPnl, new Date().toISOString());
    } catch (err) {
      logger.warn({ err: String(err), walletId }, 'trades_db: snapshotBalance failed');
    }
  }
/**
 * Returns the latest tx_hash for a (wallet, market, outcome) trade.
 *
 * IMPORTANT: This returns the most recent trade by timestamp, not necessarily the
 * original opening fill. For collateral detection (parsing PositionSplit from the
 * original buy tx), we need the FIRST fill of the position lifecycle. This works
 * today because every open position has exactly one fill — the strategy does not
 * average into positions. If position averaging or partial-exit-then-reopen flows
 * are reintroduced, this lookup will need to filter by lifecycle (e.g., trades
 * after the most recent closePosition timestamp for the same market+outcome).
 */
  getLatestTxHash(walletId: string, marketId: string, outcome: string): string | null {
    try {
      const row = this.db.prepare(
        `SELECT tx_hash FROM trades WHERE wallet_id = ? AND market_id = ? AND outcome = ? AND tx_hash IS NOT NULL ORDER BY timestamp DESC LIMIT 1`,
      ).get(walletId, marketId, outcome) as { tx_hash: string | null } | undefined;
      return row?.tx_hash ?? null;
    } catch {
      return null;
    }
  }

  getTradeStats(walletId: string): { totalTrades: number; totalCost: number; totalFees: number } {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as total_trades,
               COALESCE(SUM(cost), 0) as total_cost,
               COALESCE(SUM(fee),  0) as total_fees
        FROM trades WHERE wallet_id = ?
      `).get(walletId) as { total_trades: number; total_cost: number; total_fees: number };
      return { totalTrades: row.total_trades, totalCost: row.total_cost, totalFees: row.total_fees };
    } catch {
      return { totalTrades: 0, totalCost: 0, totalFees: 0 };
    }
  }

  getPositionSummary(walletId: string): { openCount: number; closedCount: number; totalRealizedPnl: number } {
    try {
      const row = this.db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'open'   THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
          COALESCE(SUM(CASE WHEN status = 'closed' THEN realized_pnl ELSE 0 END), 0) as total_realized_pnl
        FROM positions WHERE wallet_id = ?
      `).get(walletId) as { open_count: number; closed_count: number; total_realized_pnl: number };
      return {
        openCount:       row.open_count    ?? 0,
        closedCount:     row.closed_count  ?? 0,
        totalRealizedPnl: row.total_realized_pnl,
      };
    } catch {
      return { openCount: 0, closedCount: 0, totalRealizedPnl: 0 };
    }
  }

  close(): void {
    try { this.db.close(); } catch { /* ignore */ }
  }

  private rowToPosition(row: Record<string, unknown>): PersistedPosition {
    return {
      id:          row.id          as number,
      walletId:    row.wallet_id   as string,
      marketId:    row.market_id   as string,
      tokenId:     row.token_id    as string | undefined,
      conditionId: row.condition_id as string | undefined,
      outcome:     row.outcome     as string,
      side:        row.side        as string,
      size:        row.size        as number,
      avgPrice:    row.avg_price   as number,
      totalCost:   row.total_cost  as number,
      realizedPnl: row.realized_pnl as number,
      openedAt:    row.opened_at   as string,
      closedAt:    row.closed_at   as string | undefined,
      status:      row.status      as 'open' | 'closed',
      updatedAt:   row.updated_at  as string,
    };
  }
}

/* ── Singleton ── */

let _instance: TradesDB | null = null;

export function getTradesDB(): TradesDB {
  if (!_instance) _instance = new TradesDB();
  return _instance;
}

export function closeTradesDB(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}
