/**
 * Database — SQLite-backed persistence for wallet state, trades, positions, and pending orders.
 *
 * This module provides a unified Database class that wraps better-sqlite3 directly.
 * Tests import this class from src/storage/database.ts and expect a synchronous SQLite API.
 */
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { WalletState, TradeRecord, Position } from '../types';
import type { PendingOrder } from '../types/order';

export class Database {
  // Expose the raw db instance so tests can access it via db['db']
  private db: BetterSqlite3.Database;
  private stmts: Record<string, BetterSqlite3.Statement> = {};

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_state (
        wallet_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'PAPER',
        assigned_strategy TEXT NOT NULL DEFAULT 'momentum',
        capital_allocated REAL NOT NULL DEFAULT 0,
        available_balance REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        daily_pnl REAL NOT NULL DEFAULT 0,
        daily_pnl_reset_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        wallet_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        cost REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        cumulative_pnl REAL NOT NULL DEFAULT 0,
        balance_after REAL NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        fee_amount REAL NOT NULL DEFAULT 0,
        fee_rate REAL NOT NULL DEFAULT 0,
        order_type TEXT NOT NULL DEFAULT 'taker'
      );

      CREATE TABLE IF NOT EXISTS positions (
        wallet_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        size REAL NOT NULL DEFAULT 0,
        avg_price REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (wallet_id, market_id, outcome)
      );

      CREATE TABLE IF NOT EXISTS pending_orders (
        order_id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        submitted_at TEXT NOT NULL,
        last_checked_at TEXT NOT NULL,
        check_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Migration: add columns that may be missing in old schemas
    this._ensureColumn('trades', 'order_id', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('trades', 'wallet_id', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('trades', 'market_id', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('trades', 'outcome', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('trades', 'side', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('trades', 'price', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'size', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'cost', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'realized_pnl', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'cumulative_pnl', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'balance_after', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'timestamp', 'INTEGER NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'fee_amount', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'fee_rate', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('trades', 'order_type', "TEXT NOT NULL DEFAULT 'taker'");
    this._ensureColumn('wallet_state', 'daily_pnl', 'REAL NOT NULL DEFAULT 0');
    this._ensureColumn('wallet_state', 'daily_pnl_reset_at', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('wallet_state', 'mode', "TEXT NOT NULL DEFAULT 'PAPER'");
    this._ensureColumn('wallet_state', 'assigned_strategy', "TEXT NOT NULL DEFAULT 'momentum'");
    this._ensureColumn('wallet_state', 'capital_allocated', 'REAL NOT NULL DEFAULT 0');

    this._prepareStatements();
  }

  private _ensureColumn(table: string, column: string, definition: string): void {
    const cols = (this.db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes(column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private _prepareStatements(): void {
    this.stmts.upsertWallet = this.db.prepare(`
      INSERT INTO wallet_state
        (wallet_id, mode, assigned_strategy, capital_allocated, available_balance, realized_pnl, daily_pnl, daily_pnl_reset_at, updated_at)
      VALUES
        (@walletId, @mode, @assignedStrategy, @capitalAllocated, @availableBalance, @realizedPnl, @dailyPnl, @dailyPnlResetAt, datetime('now'))
      ON CONFLICT(wallet_id) DO UPDATE SET
        mode = excluded.mode,
        assigned_strategy = excluded.assigned_strategy,
        capital_allocated = excluded.capital_allocated,
        available_balance = excluded.available_balance,
        realized_pnl = excluded.realized_pnl,
        daily_pnl = excluded.daily_pnl,
        daily_pnl_reset_at = excluded.daily_pnl_reset_at,
        updated_at = datetime('now')
    `);

    this.stmts.loadWallets = this.db.prepare(`
      SELECT wallet_id, mode, assigned_strategy, capital_allocated, available_balance,
             realized_pnl, daily_pnl, daily_pnl_reset_at
      FROM wallet_state
    `);

    this.stmts.insertTrade = this.db.prepare(`
      INSERT INTO trades
        (order_id, wallet_id, market_id, outcome, side, price, size, cost,
         realized_pnl, cumulative_pnl, balance_after, timestamp, fee_amount, fee_rate, order_type)
      VALUES
        (@orderId, @walletId, @marketId, @outcome, @side, @price, @size, @cost,
         @realizedPnl, @cumulativePnl, @balanceAfter, @timestamp, @feeAmount, @feeRate, @orderType)
    `);

    this.stmts.upsertPosition = this.db.prepare(`
      INSERT INTO positions (wallet_id, market_id, outcome, size, avg_price, realized_pnl)
      VALUES (@walletId, @marketId, @outcome, @size, @avgPrice, @realizedPnl)
      ON CONFLICT(wallet_id, market_id, outcome) DO UPDATE SET
        size = excluded.size,
        avg_price = excluded.avg_price,
        realized_pnl = excluded.realized_pnl
    `);

    this.stmts.loadPositions = this.db.prepare(`
      SELECT market_id, outcome, size, avg_price, realized_pnl
      FROM positions WHERE wallet_id = ?
    `);

    this.stmts.removePosition = this.db.prepare(`
      DELETE FROM positions WHERE wallet_id = ? AND market_id = ?
    `);

    this.stmts.insertPendingOrder = this.db.prepare(`
      INSERT OR REPLACE INTO pending_orders
        (order_id, wallet_id, market_id, outcome, side, price, size, submitted_at, last_checked_at, check_count)
      VALUES
        (@orderId, @walletId, @marketId, @outcome, @side, @price, @size,
         @submittedAt, @lastCheckedAt, @checkCount)
    `);

    this.stmts.loadPendingOrders = this.db.prepare(`
      SELECT order_id, wallet_id, market_id, outcome, side, price, size,
             submitted_at, last_checked_at, check_count
      FROM pending_orders
    `);

    this.stmts.removePendingOrder = this.db.prepare(`
      DELETE FROM pending_orders WHERE order_id = ?
    `);
  }

  /** Save (upsert) a wallet's state */
  saveWallet(state: WalletState): void {
    this.stmts.upsertWallet.run({
      walletId: state.walletId,
      mode: state.mode ?? 'PAPER',
      assignedStrategy: state.assignedStrategy ?? 'momentum',
      capitalAllocated: state.capitalAllocated ?? 0,
      availableBalance: state.availableBalance,
      realizedPnl: state.realizedPnl,
      dailyPnl: state.dailyPnl ?? 0,
      dailyPnlResetAt: state.dailyPnlResetAt ?? '',
    });
  }

  /** Load all wallet states */
  loadWallets(): WalletState[] {
    const rows = this.stmts.loadWallets.all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      walletId: r.wallet_id as string,
      mode: (r.mode as string ?? 'PAPER') as 'LIVE' | 'PAPER',
      assignedStrategy: (r.assigned_strategy as string) ?? 'momentum',
      capitalAllocated: (r.capital_allocated as number) ?? 0,
      availableBalance: r.available_balance as number,
      realizedPnl: r.realized_pnl as number,
      dailyPnl: (r.daily_pnl as number) ?? 0,
      dailyPnlResetAt: (r.daily_pnl_reset_at as string) ?? '',
      openPositions: [],
      riskLimits: {
        maxPositionSize: 100,
        maxExposurePerMarket: 200,
        maxDailyLoss: 100,
        maxOpenTrades: 5,
        maxDrawdown: 0.2,
      },
    }));
  }

  /** Save a trade record.  walletId param ignored — use trade.walletId. */
  saveTrade(walletId: string, trade: TradeRecord): void {
    this.stmts.insertTrade.run({
      orderId: trade.orderId,
      walletId: trade.walletId,
      marketId: trade.marketId,
      outcome: trade.outcome,
      side: trade.side,
      price: trade.price,
      size: trade.size,
      cost: trade.cost,
      realizedPnl: trade.realizedPnl,
      cumulativePnl: trade.cumulativePnl,
      balanceAfter: trade.balanceAfter,
      timestamp: trade.timestamp,
      feeAmount: trade.feeAmount ?? 0,
      feeRate: trade.feeRate ?? 0,
      orderType: trade.orderType ?? 'taker',
    });
  }

  /** Upsert a position */
  savePosition(walletId: string, position: Position): void {
    this.stmts.upsertPosition.run({
      walletId,
      marketId: position.marketId,
      outcome: position.outcome,
      size: position.size,
      avgPrice: position.avgPrice,
      realizedPnl: position.realizedPnl,
    });
  }

  /** Load all positions for a wallet */
  loadPositions(walletId: string): Position[] {
    const rows = this.stmts.loadPositions.all(walletId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      marketId: r.market_id as string,
      outcome: r.outcome as 'YES' | 'NO',
      size: r.size as number,
      avgPrice: r.avg_price as number,
      realizedPnl: r.realized_pnl as number,
    }));
  }

  /** Remove a specific position */
  removePosition(walletId: string, marketId: string): void {
    this.stmts.removePosition.run(walletId, marketId);
  }

  /** Save a pending order to DB */
  savePendingOrder(order: PendingOrder): void {
    this.stmts.insertPendingOrder.run({
      orderId: order.orderId,
      walletId: order.walletId,
      marketId: order.submission.marketId,
      outcome: order.submission.outcome,
      side: order.submission.side,
      price: order.submission.price,
      size: order.submission.size,
      submittedAt: order.submittedAt,
      lastCheckedAt: order.lastCheckedAt,
      checkCount: order.checkCount,
    });
  }

  /** Load all pending orders from DB */
  loadPendingOrders(): PendingOrder[] {
    const rows = this.stmts.loadPendingOrders.all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      orderId: r.order_id as string,
      walletId: r.wallet_id as string,
      submission: {
        marketId: r.market_id as string,
        outcome: r.outcome as 'YES' | 'NO',
        side: r.side as 'BUY' | 'SELL',
        price: r.price as number,
        size: r.size as number,
      },
      submittedAt: r.submitted_at as string,
      lastCheckedAt: r.last_checked_at as string,
      checkCount: r.check_count as number,
    }));
  }

  /** Remove a pending order from DB */
  removePendingOrder(orderId: string): void {
    this.stmts.removePendingOrder.run(orderId);
  }

  close(): void {
    this.db.close();
  }
}
