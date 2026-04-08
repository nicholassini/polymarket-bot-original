import { EventEmitter } from 'events';
import http from 'http';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ConsoleLog — Global in-memory log ring-buffer + SSE broadcaster
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Provides a central place to log structured trading events that
   are then:
     1. Stored in a fixed-size ring buffer (last N entries)
     2. Broadcast via Server-Sent Events to connected dashboard clients

   Categories:
     SCAN      – market data polling / scanning
     SIGNAL    – strategy signal generation
     ORDER     – order sizing, routing, submission
     FILL      – trade fills (paper or live)
     POSITION  – position management (exits, trailing stops)
     RISK      – risk checks, limit breaches
     ENGINE    – engine lifecycle (start, stop, tick)
     STRATEGY  – strategy init, config, shutdown
     WALLET    – wallet registration, creation, removal
     SYSTEM    – general system events
     ERROR     – errors and warnings

   Levels:  DEBUG | INFO | WARN | ERROR | SUCCESS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export type LogCategory =
  | 'SCAN'
  | 'SIGNAL'
  | 'ORDER'
  | 'FILL'
  | 'POSITION'
  | 'RISK'
  | 'ENGINE'
  | 'STRATEGY'
  | 'WALLET'
  | 'SYSTEM'
  | 'ERROR';

export interface ConsoleEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  /** Optional structured data for the detail pane */
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const MAX_LOGS_PER_SEC = 50; // Rate-limit to avoid Railway's 500/s ceiling
const MAX_DATA_KEYS = 8;     // Max keys per data object
const MAX_DATA_STRING_LEN = 200; // Truncate string values in data

/** Categories that contain no user-specific data and can be seen by anyone */
const GLOBAL_CATEGORIES = new Set<LogCategory>(['SCAN', 'ENGINE', 'SYSTEM']);

interface SSEClientInfo {
  walletIds: Set<string>;
  isAdmin: boolean;
}

class ConsoleLogSingleton extends EventEmitter {
  private readonly buffer: ConsoleEntry[] = [];
  private seq = 0;
  private readonly sseClients = new Map<http.ServerResponse, SSEClientInfo>();

  /* ── Rate-limiting state ── */
  private rateWindowStart = 0;
  private rateCount = 0;
  private rateDropped = 0;

  /* ── Public API ─────────────────────────────────────────────── */

  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    // Rate-limit: allow max N logs per 1-second window (always allow WARN/ERROR)
    const now = Date.now();
    if (now - this.rateWindowStart >= 1000) {
      if (this.rateDropped > 0) {
        // Emit a single summary for dropped entries at window reset
        const dropped = this.rateDropped;
        this.rateDropped = 0;
        this.rateWindowStart = now;
        this.rateCount = 1;
        const dropEntry: ConsoleEntry = {
          id: ++this.seq,
          timestamp: now,
          level: 'WARN',
          category: 'SYSTEM',
          message: `Rate-limited: ${dropped} log entries suppressed in last second`,
        };
        this.buffer.push(dropEntry);
        if (this.buffer.length > MAX_ENTRIES) this.buffer.shift();
        this.broadcast(dropEntry);
      } else {
        this.rateWindowStart = now;
        this.rateCount = 0;
      }
    }
    if (level !== 'WARN' && level !== 'ERROR') {
      this.rateCount++;
      if (this.rateCount > MAX_LOGS_PER_SEC) {
        this.rateDropped++;
        return; // silently drop
      }
    }

    const entry: ConsoleEntry = {
      id: ++this.seq,
      timestamp: now,
      level,
      category,
      message,
      data: data ? this.truncateData(data) : undefined,
    };

    // Ring buffer
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }

    // Broadcast to SSE clients
    this.broadcast(entry);

    // EventEmitter for in-process listeners
    this.emit('entry', entry);
  }

  /* Convenience methods */
  debug(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', category, message, data);
  }
  info(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('INFO', category, message, data);
  }
  warn(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('WARN', category, message, data);
  }
  error(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('ERROR', category, message, data);
  }
  success(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('SUCCESS', category, message, data);
  }

  /* ── Buffer access ──────────────────────────────────────────── */

  getEntries(limit = 500, offset = 0, walletIds?: Set<string>, isAdmin?: boolean): ConsoleEntry[] {
    const start = Math.max(0, this.buffer.length - limit - offset);
    const end = this.buffer.length - offset;
    const slice = this.buffer.slice(start, end);
    if (isAdmin || !walletIds) return slice;
    return slice.filter((e) => this.isEntryVisibleTo(e, walletIds));
  }

  getEntriesSince(sinceId: number): ConsoleEntry[] {
    const idx = this.buffer.findIndex((e) => e.id > sinceId);
    if (idx === -1) return [];
    return this.buffer.slice(idx);
  }

  getStats(walletIds?: Set<string>, isAdmin?: boolean): {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const e of this.buffer) {
      if (!isAdmin && walletIds && !this.isEntryVisibleTo(e, walletIds)) continue;
      total++;
      byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    }
    return { total, byLevel, byCategory };
  }

  /* ── SSE (Server-Sent Events) ───────────────────────────────── */

  /** Handle an incoming SSE connection from the dashboard */
  addSSEClient(res: http.ServerResponse, walletIds: Set<string>, isAdmin: boolean): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send recent history as a burst so the client is immediately populated
    const recent = this.getEntries(200, 0, walletIds, isAdmin);
    for (const entry of recent) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    this.sseClients.set(res, { walletIds, isAdmin });

    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /** Update the wallet set for an existing SSE client (e.g. after wallet creation) */
  updateSSEClientWallets(res: http.ServerResponse, walletIds: Set<string>): void {
    const info = this.sseClients.get(res);
    if (info) info.walletIds = walletIds;
  }

  /** Check if a log entry is visible to a user based on their wallet ownership */
  private isEntryVisibleTo(entry: ConsoleEntry, walletIds: Set<string>): boolean {
    // Global categories (SCAN, ENGINE, SYSTEM) without a walletId are visible to all
    if (GLOBAL_CATEGORIES.has(entry.category) && !entry.data?.['walletId']) return true;
    // Entries with a walletId are only visible if owned
    const entryWalletId = entry.data?.['walletId'] as string | undefined;
    if (entryWalletId) return walletIds.has(entryWalletId);
    // Entries without a walletId in non-global categories (e.g. ERROR without wallet context)
    // are visible to all — they're system-wide
    if (!entryWalletId && !entry.data?.['walletId']) return true;
    return false;
  }

  private broadcast(entry: ConsoleEntry): void {
    if (this.sseClients.size === 0) return; // skip stringify when nobody's listening
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const [client, info] of this.sseClients) {
      try {
        if (info.isAdmin || this.isEntryVisibleTo(entry, info.walletIds)) {
          client.write(payload);
        }
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /** Truncate data objects to prevent large strings/arrays in the ring buffer */
  private truncateData(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let keyCount = 0;
    for (const [k, v] of Object.entries(data)) {
      if (++keyCount > MAX_DATA_KEYS) break;
      if (typeof v === 'string') {
        out[k] = v.length > MAX_DATA_STRING_LEN ? v.slice(0, MAX_DATA_STRING_LEN) + '…' : v;
      } else if (Array.isArray(v)) {
        // Keep at most 5 elements, and only primitives / shallow objects
        out[k] = v.slice(0, 5);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
}

/** Global singleton */
export const consoleLog = new ConsoleLogSingleton();
