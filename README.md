<div align="center">

# Polymarket Trading Bot — SaaS Platform

### Multi-Strategy Automated Trading with Auth, Billing & Admin Dashboard

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![Railway](https://img.shields.io/badge/Railway-Deployed-0B0D0E?logo=railway&logoColor=white)](https://railway.app/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**7 strategies · 3-tier plans · 3 payment providers · admin dashboard · one-click Railway deploy**

</div>

---

## Overview

A production-ready SaaS platform built on top of a Polymarket prediction-market trading bot. Users sign up, choose a plan, and get isolated wallets that run automated strategies — all managed through a web dashboard.

### Key Capabilities

| Area | Details |
|------|---------|
| **Trading Strategies** | Cross-market arbitrage, mispricing arbitrage, AI forecast, market making, momentum, convergence, whale copy-trading |
| **User Auth** | Email/password signup & login, JWT sessions, admin roles |
| **Billing** | Stripe, Lemon Squeezy, and NOWPayments (crypto) — all optional |
| **Plan Tiers** | Free (5 wallets), Pro (10 wallets, $99/mo), Enterprise (unlimited, $199/mo) |
| **Admin Dashboard** | User management, billing config, environment settings, analytics |
| **Deployment** | Docker multi-stage build, Railway with persistent volume |

---

## Architecture

```
src/
├── auth/               # User auth, JWT, login/signup/admin pages
│   ├── user_db.ts      # SQLite user database (better-sqlite3)
│   ├── jwt.ts          # JWT token signing/verification
│   ├── login_page.ts   # Login page (inline SPA)
│   ├── landing_page.ts # Marketing landing page with pricing
│   ├── checkout_page.ts# Checkout flow with plan selection
│   └── admin_page.ts   # Admin dashboard (users, billing, settings)
├── billing/            # Payment provider integrations
│   ├── stripe_billing.ts
│   ├── lemonsqueezy_billing.ts
│   └── nowpayments_billing.ts
├── strategies/         # Trading strategy implementations
│   ├── arbitrage/      # Cross-market & mispricing arbitrage
│   ├── convergence/    # High-probability convergence
│   ├── market_making/  # Automated market making
│   ├── trend/          # Momentum-based trading
│   ├── research_ai/    # AI-powered forecasting
│   ├── copy_trading/   # Whale copy-trade simulator
│   └── registry.ts     # Strategy registry
├── wallets/            # Per-user wallet management
├── whales/             # Whale tracker & scanner
├── reporting/
│   ├── dashboard_server.ts  # Main HTTP server (all routes + inline SPA)
│   └── console_log.ts       # Console reporting
├── core/               # Trading engine, market data
├── execution/          # Order execution pipeline
├── data/               # Market data providers
├── storage/            # Persistence layer
├── cli.ts              # CLI entry point
└── types.ts            # Shared type definitions
```

---

## Quick Start

### Prerequisites

- **Node.js 20+** (22+ recommended)
- **npm** (comes with Node.js)

### 1. Clone & Install

```bash
git clone https://github.com/dylanpersonguy/polymarket-saas.git
cd polymarket-saas
npm ci
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings. See [Environment Variables](#environment-variables) below.

### 3. Run in Development

```bash
npm run dev
```

### 4. Build & Run Production

```bash
npm run build
npm start
```

The dashboard launches at `http://localhost:3000`.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_LIVE_TRADING` | Enable real-money trading (requires API key) | `false` |
| `POLYMARKET_API_KEY` | Your Polymarket API key for live orders | — |
| `DASHBOARD_PORT` | HTTP server port | `3000` |
| `JWT_SECRET` | Secret for signing auth tokens (**change in production**) | `change-me-in-production` |
| `ADMIN_EMAIL` | Auto-promote this email to admin on signup | — |
| `DATA_DIR` | Directory for SQLite databases | `./data` |

### Stripe Billing

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_` or `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_`) |
| `STRIPE_PRICE_ID` | Recurring price ID for the subscription (`price_`) |
| `SIGNUP_FEE_CENTS` | One-time signup fee in cents (default: `4999`) |

### Lemon Squeezy Billing

| Variable | Description |
|----------|-------------|
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key |
| `LEMONSQUEEZY_STORE_ID` | Your store ID |
| `LEMONSQUEEZY_VARIANT_ID` | Subscription variant ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Webhook signing secret |

### NOWPayments (Crypto)

| Variable | Description |
|----------|-------------|
| `NOWPAYMENTS_API_KEY` | NOWPayments API key |
| `NOWPAYMENTS_IPN_SECRET` | IPN secret for webhook verification |
| `NOWPAYMENTS_PRICE_USD` | Monthly price in USD (default: `29.99`) |

> **Note:** If no billing provider is configured, all signups get free access automatically.

---

## Plan Tiers

| Plan | Price | Wallets | Target |
|------|-------|---------|--------|
| **Free** | $0/mo | 5 | Try it out with paper trading |
| **Pro** | $99/mo | 10 | Active traders |
| **Enterprise** | $199/mo | Unlimited | Power users & teams |

Wallet limits are enforced server-side. Admin users always get Enterprise-tier access.

---

## Trading Strategies

| Strategy | Description |
|----------|-------------|
| **Cross-Market Arbitrage** | Exploits price differences across correlated markets |
| **Mispricing Arbitrage** | Detects when YES + NO probabilities don't sum to 100% |
| **AI Forecast** | ML-powered probability predictions against market prices |
| **Market Making** | Provides liquidity with orders on both sides of the book |
| **Momentum** | Follows short-term price trends with configurable lookback |
| **Convergence** | Trades high-probability markets approaching resolution |
| **Whale Copy-Trading** | Mirrors trading activity from large wallets |

Strategies are configured in `config.yaml`. Each wallet can run multiple strategies simultaneously.

---

## Admin Dashboard

Navigate to `/admin` after logging in as an admin user.

### Tabs

- **Overview** — User count, active subscriptions, revenue estimate, system health
- **Billing** — Configure Stripe, Lemon Squeezy, and NOWPayments directly from the UI
- **Users** — Search users, promote/demote admins, activate/deactivate subscriptions, view wallet counts
- **Settings** — Edit all environment variables live with inline inputs; saves to `.env` and updates the running process

### First Admin Setup

Set `ADMIN_EMAIL` in your `.env` to your email address. When you sign up with that email, you're automatically promoted to admin.

---

## Deployment

### Railway (Recommended)

The project includes a multi-stage `Dockerfile` optimized for Railway.

1. **Install Railway CLI:** `brew install railway` (or [other methods](https://docs.railway.app/develop/cli))
2. **Login:** `railway login`
3. **Create project:** `railway init`
4. **Add persistent volume:** Mount at `/data` for SQLite databases
5. **Set environment variables** in Railway dashboard:
   - `NODE_OPTIONS=--max-old-space-size=4096`
   - `DATA_DIR=/data`
   - `PORT=3000`
   - `ADMIN_EMAIL=your@email.com`
   - `JWT_SECRET=<generate-a-random-string>`
6. **Deploy:** `railway up`

#### Auto-Deploy from GitHub

In Railway dashboard → Service → Settings → **Connect Repo** → select this repo and branch. Every push to `main` triggers a deploy automatically.

### Docker (Self-hosted)

```bash
docker build -t polymarket-saas .
docker run -d \
  -p 3000:3000 \
  -v polymarket-data:/data \
  -e DATA_DIR=/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_EMAIL=your@email.com \
  polymarket-saas
```

---

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/signup` | Register new user |
| `POST` | `/api/auth/login` | Login, returns JWT cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Current user info, plan tier, wallet count |

### Wallets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wallets` | List user's wallets |
| `POST` | `/api/wallets` | Create wallet (enforces plan limits) |
| `DELETE` | `/api/wallets/:id` | Remove wallet |

### Admin (requires admin role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/data` | Full admin dashboard data |
| `POST` | `/api/admin/settings` | Save environment variables to `.env` |
| `POST` | `/api/admin/set-admin` | Toggle admin role for a user |
| `POST` | `/api/admin/set-subscription` | Change user subscription status |
| `POST` | `/api/admin/promote` | Promote user to admin by email |
| `POST` | `/api/admin/stripe-config` | Save Stripe configuration |
| `POST` | `/api/admin/lemonsqueezy-config` | Save Lemon Squeezy configuration |
| `POST` | `/api/admin/nowpayments-config` | Save NOWPayments configuration |

### Billing Webhooks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/billing/webhook` | Stripe webhook |
| `POST` | `/api/billing/lemonsqueezy/webhook` | Lemon Squeezy webhook |
| `POST` | `/api/billing/nowpayments/webhook` | NOWPayments IPN webhook |

---

## Configuration

### config.yaml

Controls trading behavior:

```yaml
environment:
  enable_live_trading: false    # Must also set ENABLE_LIVE_TRADING=true in .env

strategy_config:
  cross_market_arbitrage:
    min_edge: 0.03
  mispricing_arbitrage:
    min_dislocation: 0.02
  ai_forecast:
    refresh_minutes: 30
  market_making:
    spread_bps: 40
  momentum:
    lookback_minutes: 15
  filtered_high_prob_convergence:
    enabled: true
    min_liquidity_usd: 10000
    min_prob: 0.65
    max_prob: 0.96
```

See `config.yaml` for all available options with inline comments.

---

## Development

```bash
npm run typecheck    # Type-check with tsc
npm test             # Run tests (vitest)
npm run build        # Compile to dist/
npm run dev          # Dev mode with hot reload (tsx)
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js 20+ with TypeScript 5.6 (CommonJS) |
| **Database** | SQLite via better-sqlite3 |
| **Auth** | bcryptjs + JWT (httpOnly cookies) |
| **Frontend** | Inline SPA — served from TypeScript template literals, no build step |
| **Billing** | Stripe SDK v22, Lemon Squeezy API, NOWPayments API |
| **Deploy** | Docker multi-stage build (bookworm-slim), Railway |

---

## Security

- JWT tokens stored as httpOnly cookies (not localStorage)
- Passwords hashed with bcrypt (cost factor 12)
- Admin endpoints require `isAdmin` flag checked server-side
- Secrets masked in admin dashboard (shows only last 4 characters)
- Environment variables saved to `.env` on disk, never exposed to clients
- Wallet operations scoped to authenticated user — no cross-user access
- Billing webhooks verify provider signatures before processing
- Allowlisted environment variables — only known keys can be set via admin UI

---

## License

MIT
