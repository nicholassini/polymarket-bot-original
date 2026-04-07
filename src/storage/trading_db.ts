import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { TradeRecord, Position } from '../types';

export interface SavedWalletState {
  walletId: string;
  availableBalance: number;
  realizedPnl: number;
  capitalAllocated: number;
}

export class TradingDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const resolved = dbPath ?? path.join(dataDir, 'trading.db');
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.prepareStatements();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id      TEXT NOT NULL,
        wallet_id     TEXT NOT NULL,
        market_id     TEXT NOT NULL,
        outcome       TEXT NOT NULL,
        side          TEXT NOT NULL,
        price         REAL NOT NULL,
        size          REAL NOT NULL,
        cost          REAL NOT NULL,
        realized_pnl  REAL NOT NULL,
        cumulative_pnl REAL NOT NULL,
        balance_after REAL NOT NULL,
        timestamp     INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_id);
      CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades(wallet_id, timestamp);

      CREATE TABLE IF NOT EXISTS wallet_state (
        wallet_id         TEXT PRIMARY KEY,
        available_balance REAL NOT NULL,
        realized_pnl      REAL NOT NULL,
        capital_allocated REAL NOT NULL,
        updated_at        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS positions (
        wallet_id     TEXT NOT NULL,
        market_id     TEXT NOT NULL,
        outcome       TEXT NOT NULL,
        size          REAL NOT NULL,
        avg_price     REAL NOT NULL,
        realized_pnl  REAL NOT NULL,
        PRIMARY KEY (wallet_id, market_id, outcome)
      );
    `);
  }

  /* ── Trades ── */

  private _insertTrade!: Database.Statement;
  private _upsertState!: Database.Statement;
  private _upsertPosition!: Database.Statement;
  private _deletePosition!: Database.Statement;

  private prepareStatements(): void {
    this._insertTrade = this.db.prepare(`
      INSERT INTO trades (order_id, wallet_id, market_id, outcome, side, price, size, cost, realized_pnl, cumulative_pnl, balance_after, timestamp)
      VALUES (@orderId, @walletId, @marketId, @outcome, @side, @price, @size, @cost, @realizedPnl, @cumulativePnl, @balanceAfter, @timestamp)
    `);
    this._upsertState = this.db.prepare(`
      INSERT INTO wallet_state (wallet_id, available_balance, realized_pnl, capital_allocated, updated_at)
      VALUES (@walletId, @availableBalance, @realizedPnl, @capitalAllocated, @updatedAt)
      ON CONFLICT(wallet_id) DO UPDATE SET
        available_balance = @availableBalance,
        realized_pnl      = @realizedPnl,
        capital_allocated  = @capitalAllocated,
        updated_at         = @updatedAt
    `);
    this._upsertPosition = this.db.prepare(`
      INSERT INTO positions (wallet_id, market_id, outcome, size, avg_price, realized_pnl)
      VALUES (@walletId, @marketId, @outcome, @size, @avgPrice, @realizedPnl)
      ON CONFLICT(wallet_id, market_id, outcome) DO UPDATE SET
        size         = @size,
        avg_price    = @avgPrice,
        realized_pnl = @realizedPnl
    `);
    this._deletePosition = this.db.prepare(
      `DELETE FROM positions WHERE wallet_id = ? AND market_id = ? AND outcome = ?`
    );
  }

  saveTrade(trade: TradeRecord): void {
    this._insertTrade.run(trade);
  }

  loadTrades(walletId: string, limit = 10_000): TradeRecord[] {
    const rows = this.db.prepare(
      `SELECT order_id, wallet_id, market_id, outcome, side, price, size, cost,
              realized_pnl, cumulative_pnl, balance_after, timestamp
       FROM trades WHERE wallet_id = ? ORDER BY timestamp ASC LIMIT ?`
    ).all(walletId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      orderId: r.order_id as string,
      walletId: r.wallet_id as string,
      marketId: r.market_id as string,
      outcome: r.outcome as 'YES' | 'NO',
      side: r.side as 'BUY' | 'SELL',
      price: r.price as number,
      size: r.size as number,
      cost: r.cost as number,
      realizedPnl: r.realized_pnl as number,
      cumulativePnl: r.cumulative_pnl as number,
      balanceAfter: r.balance_after as number,
      timestamp: r.timestamp as number,
    }));
  }

  /* ── Wallet state ── */

  saveWalletState(walletId: string, availableBalance: number, realizedPnl: number, capitalAllocated: number): void {
    this._upsertState.run({
      walletId,
      availableBalance,
      realizedPnl,
      capitalAllocated,
      updatedAt: Date.now(),
    });
  }

  loadWalletState(walletId: string): SavedWalletState | null {
    const row = this.db.prepare(
      `SELECT wallet_id, available_balance, realized_pnl, capital_allocated
       FROM wallet_state WHERE wallet_id = ?`
    ).get(walletId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      walletId: row.wallet_id as string,
      availableBalance: row.available_balance as number,
      realizedPnl: row.realized_pnl as number,
      capitalAllocated: row.capital_allocated as number,
    };
  }

  /* ── Positions ── */

  savePositions(walletId: string, positions: Position[]): void {
    const txn = this.db.transaction(() => {
      // Remove all positions for this wallet, then re-insert current ones
      this.db.prepare(`DELETE FROM positions WHERE wallet_id = ?`).run(walletId);
      for (const p of positions) {
        this._upsertPosition.run({
          walletId,
          marketId: p.marketId,
          outcome: p.outcome,
          size: p.size,
          avgPrice: p.avgPrice,
          realizedPnl: p.realizedPnl,
        });
      }
    });
    txn();
  }

  loadPositions(walletId: string): Position[] {
    const rows = this.db.prepare(
      `SELECT market_id, outcome, size, avg_price, realized_pnl
       FROM positions WHERE wallet_id = ?`
    ).all(walletId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      marketId: r.market_id as string,
      outcome: r.outcome as 'YES' | 'NO',
      size: r.size as number,
      avgPrice: r.avg_price as number,
      realizedPnl: r.realized_pnl as number,
    }));
  }

  /* ── Cleanup ── */

  deleteWalletData(walletId: string): void {
    const txn = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM trades WHERE wallet_id = ?`).run(walletId);
      this.db.prepare(`DELETE FROM positions WHERE wallet_id = ?`).run(walletId);
      this.db.prepare(`DELETE FROM wallet_state WHERE wallet_id = ?`).run(walletId);
    });
    txn();
  }

  close(): void {
    this.db.close();
  }
}
