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
