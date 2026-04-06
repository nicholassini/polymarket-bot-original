import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string; // 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'none'
  paymentProvider: string | null; // 'stripe' | 'lemonsqueezy' | 'nowpayments' | null
  isAdmin: boolean;
  polymarketApiKey: string | null;
  planTier: string; // 'free' | 'pro' | 'enterprise'
  createdAt: number;
}

const SALT_ROUNDS = 12;

export class UserDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const resolved = dbPath ?? path.join(dataDir, 'users.db');
    const dir = path.dirname(resolved);
    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id                  TEXT PRIMARY KEY,
        email               TEXT UNIQUE NOT NULL,
        password_hash       TEXT NOT NULL,
        stripe_customer_id  TEXT,
        subscription_id     TEXT,
        subscription_status TEXT NOT NULL DEFAULT 'none',
        created_at          INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_wallets (
        wallet_id TEXT NOT NULL,
        user_id   TEXT NOT NULL REFERENCES users(id),
        PRIMARY KEY (wallet_id),
        UNIQUE (wallet_id)
      );
    `);

    // Migration: add is_admin column if missing
    const cols = this.db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!cols.some((c: any) => c.name === 'is_admin')) {
      this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    }
    // Migration: add payment_provider column if missing
    if (!cols.some((c: any) => c.name === 'payment_provider')) {
      this.db.exec('ALTER TABLE users ADD COLUMN payment_provider TEXT');
    }
    // Migration: add polymarket_api_key column if missing
    if (!cols.some((c: any) => c.name === 'polymarket_api_key')) {
      this.db.exec('ALTER TABLE users ADD COLUMN polymarket_api_key TEXT');
    }
    // Migration: add plan_tier column if missing
    if (!cols.some((c: any) => c.name === 'plan_tier')) {
      this.db.exec("ALTER TABLE users ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free'");
    }

    // Migration: wallet_configs table for persisting wallet state across restarts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_configs (
        wallet_id TEXT PRIMARY KEY,
        user_id   TEXT NOT NULL REFERENCES users(id),
        strategy  TEXT NOT NULL,
        capital   REAL NOT NULL,
        mode      TEXT NOT NULL DEFAULT 'PAPER',
        max_position_size REAL,
        max_exposure      REAL,
        max_daily_loss    REAL,
        max_open_trades   INTEGER,
        max_drawdown      REAL,
        created_at INTEGER NOT NULL
      );
    `);

    // Migration: analytics events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    // Create indexes if they don't exist
    try { this.db.exec('CREATE INDEX idx_events_type_date ON analytics_events(event_type, created_at)'); } catch {}
    try { this.db.exec('CREATE INDEX idx_events_user ON analytics_events(user_id, created_at)'); } catch {}
  }

  async createUser(email: string, password: string): Promise<User> {
    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw new Error('Email already registered');

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, subscription_status, created_at)
      VALUES (?, ?, ?, 'none', ?)
    `).run(id, email.toLowerCase().trim(), passwordHash, now);

    return { id, email: email.toLowerCase().trim(), passwordHash, stripeCustomerId: null, subscriptionId: null, subscriptionStatus: 'none', paymentProvider: null, isAdmin: false, polymarketApiKey: null, planTier: 'free', createdAt: now };
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as any;
    if (!row) return null;

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return null;

    return this.rowToUser(row);
  }

  getUserById(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row ? this.rowToUser(row) : null;
  }

  updateStripeCustomer(userId: string, customerId: string): void {
    this.db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, userId);
  }

  updateSubscription(userId: string, subscriptionId: string, status: string): void {
    this.db.prepare('UPDATE users SET subscription_id = ?, subscription_status = ? WHERE id = ?').run(subscriptionId, status, userId);
  }

  updateSubscriptionByCustomerId(customerId: string, subscriptionId: string, status: string): void {
    this.db.prepare('UPDATE users SET subscription_id = ?, subscription_status = ? WHERE stripe_customer_id = ?').run(subscriptionId, status, customerId);
  }

  updatePaymentProvider(userId: string, provider: string): void {
    this.db.prepare('UPDATE users SET payment_provider = ? WHERE id = ?').run(provider, userId);
  }

  updatePolymarketApiKey(userId: string, apiKey: string | null): void {
    this.db.prepare('UPDATE users SET polymarket_api_key = ? WHERE id = ?').run(apiKey, userId);
  }

  updatePlanTier(userId: string, tier: string): void {
    this.db.prepare('UPDATE users SET plan_tier = ? WHERE id = ?').run(tier, userId);
  }

  getUserByStripeCustomerId(customerId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId) as any;
    return row ? this.rowToUser(row) : null;
  }

  /** Associate a wallet with a user */
  assignWallet(walletId: string, userId: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO user_wallets (wallet_id, user_id) VALUES (?, ?)'
    ).run(walletId, userId);
  }

  /** Remove wallet-user association */
  unassignWallet(walletId: string): void {
    this.db.prepare('DELETE FROM user_wallets WHERE wallet_id = ?').run(walletId);
  }

  /** Get all wallet IDs belonging to a user */
  getWalletIds(userId: string): string[] {
    const rows = this.db.prepare('SELECT wallet_id FROM user_wallets WHERE user_id = ?').all(userId) as any[];
    return rows.map(r => r.wallet_id);
  }

  /** Promote / demote a user to admin */
  setAdmin(userId: string, isAdmin: boolean): void {
    this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
  }

  /** List all users (admin view) */
  getAllUsers(): User[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.rowToUser(r));
  }

  /** Count users */
  getUserCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
    return row.cnt;
  }

  /** Get the user who owns a wallet */
  getWalletOwner(walletId: string): string | null {
    const row = this.db.prepare('SELECT user_id FROM user_wallets WHERE wallet_id = ?').get(walletId) as any;
    return row ? row.user_id : null;
  }

  /** Persist a wallet config so it survives restarts */
  saveWalletConfig(walletId: string, userId: string, strategy: string, capital: number, mode: string, riskLimits?: { maxPositionSize?: number; maxExposurePerMarket?: number; maxDailyLoss?: number; maxOpenTrades?: number; maxDrawdown?: number }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO wallet_configs (wallet_id, user_id, strategy, capital, mode, max_position_size, max_exposure, max_daily_loss, max_open_trades, max_drawdown, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      walletId, userId, strategy, capital, mode,
      riskLimits?.maxPositionSize ?? capital * 0.2,
      riskLimits?.maxExposurePerMarket ?? capital * 0.3,
      riskLimits?.maxDailyLoss ?? capital * 0.1,
      riskLimits?.maxOpenTrades ?? 10,
      riskLimits?.maxDrawdown ?? 0.2,
      Date.now(),
    );
  }

  /** Remove a persisted wallet config */
  removeWalletConfig(walletId: string): void {
    this.db.prepare('DELETE FROM wallet_configs WHERE wallet_id = ?').run(walletId);
  }

  /** Load all persisted wallet configs (for restoring on startup) */
  getAllWalletConfigs(): Array<{ walletId: string; userId: string; strategy: string; capital: number; mode: string; maxPositionSize: number; maxExposure: number; maxDailyLoss: number; maxOpenTrades: number; maxDrawdown: number }> {
    const rows = this.db.prepare('SELECT * FROM wallet_configs').all() as any[];
    return rows.map(r => ({
      walletId: r.wallet_id,
      userId: r.user_id,
      strategy: r.strategy,
      capital: r.capital,
      mode: r.mode,
      maxPositionSize: r.max_position_size,
      maxExposure: r.max_exposure,
      maxDailyLoss: r.max_daily_loss,
      maxOpenTrades: r.max_open_trades,
      maxDrawdown: r.max_drawdown,
    }));
  }

  /** Remove user_wallets entries that have no corresponding wallet_configs entry */
  cleanupOrphanedWallets(): number {
    const result = this.db.prepare(
      'DELETE FROM user_wallets WHERE wallet_id NOT IN (SELECT wallet_id FROM wallet_configs)'
    ).run();
    return result.changes;
  }

  /** Track an analytics event */
  trackEvent(eventType: string, userId?: string, metadata?: Record<string, any>): void {
    try {
      this.db.prepare(
        'INSERT INTO analytics_events (event_type, user_id, metadata, created_at) VALUES (?, ?, ?, ?)'
      ).run(eventType, userId || null, metadata ? JSON.stringify(metadata) : null, Date.now());
    } catch { /* non-critical */ }
  }

  /** Get comprehensive analytics data */
  getAnalyticsData(days: number = 30): Record<string, any> {
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;

    // Signups per day
    const signupsByDay = this.db.prepare(`
      SELECT date(created_at/1000, 'unixepoch') as day, COUNT(*) as count
      FROM users WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `).all(cutoff) as any[];

    // Plan distribution
    const planDistribution = this.db.prepare(
      "SELECT COALESCE(plan_tier, 'free') as plan, COUNT(*) as count FROM users GROUP BY plan_tier"
    ).all() as any[];

    // Provider distribution
    const providerDistribution = this.db.prepare(
      "SELECT COALESCE(payment_provider, 'none') as provider, COUNT(*) as count FROM users GROUP BY payment_provider"
    ).all() as any[];

    // Subscription status distribution
    const subscriptionDistribution = this.db.prepare(
      'SELECT subscription_status as status, COUNT(*) as count FROM users GROUP BY subscription_status'
    ).all() as any[];

    // Strategy distribution from wallet_configs
    const strategyDistribution = this.db.prepare(
      'SELECT strategy, COUNT(*) as count FROM wallet_configs GROUP BY strategy'
    ).all() as any[];

    // Mode distribution
    const modeDistribution = this.db.prepare(
      'SELECT mode, COUNT(*) as count FROM wallet_configs GROUP BY mode'
    ).all() as any[];

    // Capital stats
    const capitalStats = this.db.prepare(`
      SELECT COUNT(*) as totalWallets, COALESCE(SUM(capital),0) as totalCapital,
             COALESCE(AVG(capital),0) as avgCapital, COALESCE(MIN(capital),0) as minCapital,
             COALESCE(MAX(capital),0) as maxCapital
      FROM wallet_configs
    `).get() as any;

    // Wallets created per day
    const walletsByDay = this.db.prepare(`
      SELECT date(created_at/1000, 'unixepoch') as day, COUNT(*) as count
      FROM wallet_configs WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `).all(cutoff) as any[];

    // Events aggregated by day and type
    const rawEventsByDay = this.db.prepare(`
      SELECT date(created_at/1000, 'unixepoch') as day, event_type, COUNT(*) as count
      FROM analytics_events WHERE created_at >= ?
      GROUP BY day, event_type ORDER BY day
    `).all(cutoff) as any[];

    // Pivot events into { day, login, signup, wallet_create, page_view, ... }
    const eventMap = new Map<string, Record<string, number>>();
    for (const row of rawEventsByDay) {
      if (!eventMap.has(row.day)) eventMap.set(row.day, {});
      eventMap.get(row.day)![row.event_type] = row.count;
    }
    const eventsByDay = Array.from(eventMap.entries()).map(([day, events]) => ({ day, ...events }));

    // Recent events
    const recentEvents = this.db.prepare(`
      SELECT e.event_type, e.user_id, e.metadata, e.created_at, u.email
      FROM analytics_events e LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.created_at DESC LIMIT 50
    `).all() as any[];

    // Top users by wallet count
    const topUsers = this.db.prepare(`
      SELECT u.email, u.plan_tier, u.subscription_status, COUNT(wc.wallet_id) as wallet_count
      FROM users u LEFT JOIN wallet_configs wc ON u.id = wc.user_id
      GROUP BY u.id ORDER BY wallet_count DESC LIMIT 10
    `).all() as any[];

    // DAU / WAU / MAU
    const dau = (this.db.prepare(
      'SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= ? AND user_id IS NOT NULL'
    ).get(Date.now() - 86400000) as any).c;
    const wau = (this.db.prepare(
      'SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= ? AND user_id IS NOT NULL'
    ).get(Date.now() - 7 * 86400000) as any).c;
    const mau = (this.db.prepare(
      'SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= ? AND user_id IS NOT NULL'
    ).get(Date.now() - 30 * 86400000) as any).c;

    // Monthly cohort retention
    const cohorts = this.db.prepare(`
      SELECT strftime('%Y-%m', created_at/1000, 'unixepoch') as cohort,
             COUNT(*) as signups,
             SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) as still_active
      FROM users GROUP BY cohort ORDER BY cohort
    `).all() as any[];

    // User counts
    const totalUsers = (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
    const activeSubscriptions = (this.db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'active'").get() as any).c;
    const freeUsers = (this.db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'none' OR subscription_status = 'free'").get() as any).c;
    const canceledUsers = (this.db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'canceled'").get() as any).c;
    const trialingUsers = (this.db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'trialing'").get() as any).c;

    // Signups in period
    const signupsInPeriod = (this.db.prepare(
      'SELECT COUNT(*) as c FROM users WHERE created_at >= ?'
    ).get(cutoff) as any).c;

    // Avg wallets per active user
    const avgWallets = (this.db.prepare(`
      SELECT COALESCE(AVG(wc), 0) as avg FROM (
        SELECT COUNT(wallet_configs.wallet_id) as wc FROM users
        LEFT JOIN wallet_configs ON users.id = wallet_configs.user_id
        GROUP BY users.id HAVING wc > 0
      )
    `).get() as any).avg;

    // Hourly activity distribution (hour of day in UTC)
    const hourlyActivity = this.db.prepare(`
      SELECT CAST(strftime('%H', created_at/1000, 'unixepoch') AS INTEGER) as hour, COUNT(*) as count
      FROM analytics_events WHERE created_at >= ?
      GROUP BY hour ORDER BY hour
    `).all(cutoff) as any[];

    // Events total by type
    const eventTotals = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events WHERE created_at >= ?
      GROUP BY event_type ORDER BY count DESC
    `).all(cutoff) as any[];

    return {
      metrics: {
        totalUsers,
        activeSubscriptions,
        freeUsers,
        canceledUsers,
        trialingUsers,
        dau,
        wau,
        mau,
        signupsInPeriod,
        avgWalletsPerUser: Math.round(avgWallets * 10) / 10,
        totalCapitalManaged: capitalStats.totalCapital,
        avgCapital: Math.round(capitalStats.avgCapital * 100) / 100,
        totalWallets: capitalStats.totalWallets,
        conversionRate: totalUsers > 0 ? Math.round((activeSubscriptions / totalUsers) * 1000) / 10 : 0,
        churnRate: (activeSubscriptions + canceledUsers) > 0
          ? Math.round((canceledUsers / (activeSubscriptions + canceledUsers)) * 1000) / 10 : 0,
      },
      signupsByDay,
      walletsByDay,
      eventsByDay,
      planDistribution,
      providerDistribution,
      subscriptionDistribution,
      strategyDistribution,
      modeDistribution,
      capitalStats,
      hourlyActivity,
      eventTotals,
      recentEvents: recentEvents.map((e: any) => ({
        type: e.event_type,
        email: e.email || 'system',
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
        timestamp: e.created_at,
      })),
      topUsers: topUsers.map((u: any) => ({
        email: u.email,
        walletCount: u.wallet_count,
        plan: u.plan_tier,
        status: u.subscription_status,
      })),
      cohorts: cohorts.map((c: any) => ({
        cohort: c.cohort,
        signups: c.signups,
        stillActive: c.still_active,
      })),
    };
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      stripeCustomerId: row.stripe_customer_id,
      subscriptionId: row.subscription_id,
      subscriptionStatus: row.subscription_status,
      paymentProvider: row.payment_provider ?? null,
      isAdmin: row.is_admin === 1,
      polymarketApiKey: row.polymarket_api_key ?? null,
      planTier: row.plan_tier || 'free',
      createdAt: row.created_at,
    };
  }
}
