import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { DashboardServer } from '../src/reporting/dashboard_server';
import { WalletManager } from '../src/wallets/wallet_manager';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Database } from '../src/storage/database';

function makeTempDb(): { db: Database; dbPath: string } {
  const dbPath = path.join(os.tmpdir(), `dash-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);
  db.initSchema();
  return { db, dbPath };
}

function request(
  port: number,
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: urlPath, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Dashboard auth — kill-switch endpoint', () => {
  let server: DashboardServer;
  let db: Database;
  let dbPath: string;
  let port: number;

  beforeEach(async () => {
    ({ db, dbPath } = makeTempDb());
    const walletManager = new WalletManager(db);
    port = 30000 + Math.floor(Math.random() * 5000);
    server = new DashboardServer(walletManager, port);
    // DashboardServer.start() is the method that calls listen
    await new Promise<void>((resolve) => {
      server.start();
      // Give the server a moment to bind
      setTimeout(resolve, 50);
    });
  });

  afterEach(async () => {
    server.stop();
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    delete process.env.DASHBOARD_API_KEY;
    vi.restoreAllMocks();
    // Brief pause so the port is released
    await new Promise((r) => setTimeout(r, 30));
  });

  it('returns 403 on kill-switch activate when DASHBOARD_API_KEY is not set', async () => {
    delete process.env.DASHBOARD_API_KEY;
    const { status, body } = await request(port, 'POST', '/api/kill-switch/activate');
    expect(status).toBe(403);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it('returns 401 on kill-switch activate without token when DASHBOARD_API_KEY is set', async () => {
    process.env.DASHBOARD_API_KEY = 'secret-key-123';
    const { status, body } = await request(port, 'POST', '/api/kill-switch/activate');
    expect(status).toBe(401);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it('returns 200 on kill-switch activate with correct Bearer token', async () => {
    process.env.DASHBOARD_API_KEY = 'secret-key-123';
    const { status } = await request(port, 'POST', '/api/kill-switch/activate', {
      Authorization: 'Bearer secret-key-123',
    });
    expect(status).toBe(200);
  });

  it('/healthz remains accessible regardless of DASHBOARD_API_KEY', async () => {
    delete process.env.DASHBOARD_API_KEY;
    const { status } = await request(port, 'GET', '/healthz');
    expect(status).toBe(200);
  });
});
