/**
 * Admin dashboard page — served at `/admin`.
 * Only accessible to users with is_admin = true.
 * Provides: Stripe config, user management, system stats, env settings.
 */
export function getAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Dashboard — Polymarket Bot</title>
<style>
:root {
  --bg:       #0b0e11;
  --surface:  #151a21;
  --surface2: #1c2330;
  --border:   #1e2630;
  --text:     #e4e8ed;
  --muted:    #8892a0;
  --accent:   #4f8ff7;
  --accent2:  #6366f1;
  --green:    #00d68f;
  --red:      #ff4d6a;
  --yellow:   #ffc107;
  --purple:   #a855f7;
  --orange:   #f97316;
  --radius:   12px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}

/* ═══ Layout ═══ */
.admin-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;background:var(--surface);border-bottom:1px solid var(--border)}
.admin-nav .logo{font-size:18px;font-weight:800;letter-spacing:-.5px}
.admin-nav .logo span{color:var(--accent)}
.admin-nav .badge{background:var(--red);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;margin-left:8px;letter-spacing:.5px}
.admin-nav .nav-right{display:flex;align-items:center;gap:12px}
.admin-nav a{text-decoration:none;font-size:13px;color:var(--muted);padding:8px 16px;border-radius:6px;border:1px solid var(--border);transition:all .2s}
.admin-nav a:hover{color:var(--text);border-color:var(--muted)}

.admin-body{max-width:1200px;margin:0 auto;padding:32px 24px}

/* Tabs */
.tabs{display:flex;gap:4px;margin-bottom:28px;border-bottom:1px solid var(--border);padding-bottom:0}
.tab{padding:12px 20px;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;background:none;border-top:none;border-left:none;border-right:none}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}

.tab-content{display:none}
.tab-content.active{display:block}

/* Stats cards */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.stat-card .stat-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.stat-card .stat-value{font-size:28px;font-weight:800}
.stat-card .stat-sub{font-size:12px;color:var(--muted);margin-top:4px}
.text-green{color:var(--green)}
.text-accent{color:var(--accent)}
.text-yellow{color:var(--yellow)}
.text-red{color:var(--red)}
.text-purple{color:var(--purple)}

/* Cards / Panels */
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:20px}
.panel h3{font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.panel h3 .icon{font-size:18px}

/* Forms */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.form-grid{grid-template-columns:1fr}}
.form-group{margin-bottom:0}
.form-group label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
.form-group input,.form-group select{width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:border-color .2s}
.form-group input:focus,.form-group select:focus{border-color:var(--accent)}
.form-group input::placeholder{color:#4a5568}
.form-group .hint{font-size:11px;color:var(--muted);margin-top:4px}
.form-full{grid-column:1/-1}

.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;transition:all .2s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{opacity:.9}
.btn-danger{background:var(--red);color:#fff}
.btn-danger:hover{opacity:.9}
.btn-outline{background:none;color:var(--muted);border:1px solid var(--border)}
.btn-outline:hover{color:var(--text);border-color:var(--muted)}
.btn-sm{padding:6px 14px;font-size:12px}

/* Status dot */
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.dot-green{background:var(--green)}
.dot-red{background:var(--red)}
.dot-yellow{background:var(--yellow)}

/* Table */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;border-bottom:1px solid var(--border)}
td{padding:12px;font-size:13px;border-bottom:1px solid var(--border)}
tr:hover td{background:var(--surface2)}
.user-email{font-weight:600}
.badge-sm{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.5px}
.badge-active{background:rgba(0,214,143,.12);color:var(--green)}
.badge-none{background:rgba(136,146,160,.12);color:var(--muted)}
.badge-canceled{background:rgba(255,77,106,.12);color:var(--red)}
.badge-past_due{background:rgba(255,193,7,.12);color:var(--yellow)}
.badge-admin{background:rgba(168,85,247,.12);color:var(--purple)}

/* Toast */
.toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;transform:translateY(100px);opacity:0;transition:all .3s;z-index:9999}
.toast.show{transform:translateY(0);opacity:1}
.toast-success{background:var(--green)}
.toast-error{background:var(--red)}

/* Alert */
.alert{padding:14px 18px;border-radius:8px;font-size:13px;margin-bottom:16px}
.alert-info{background:rgba(79,143,247,.08);border:1px solid rgba(79,143,247,.2);color:var(--accent)}
.alert-warn{background:rgba(255,193,7,.08);border:1px solid rgba(255,193,7,.2);color:var(--yellow)}

/* ═══ Analytics ═══ */
.analytics-period{display:flex;gap:6px;margin-bottom:24px}
.period-btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--muted);cursor:pointer;transition:all .2s}
.period-btn:hover{color:var(--text);border-color:var(--muted)}
.period-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.chart-container{position:relative;width:100%;height:220px;margin:12px 0}
.chart-container svg{width:100%;height:100%}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
@media(max-width:900px){.chart-grid{grid-template-columns:1fr}}
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.metric-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center}
.metric-card .metric-value{font-size:24px;font-weight:800;margin-bottom:2px}
.metric-card .metric-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.metric-card .metric-change{font-size:11px;margin-top:4px}
.donut-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;justify-content:center}
.donut-legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.donut-legend-item .swatch{width:10px;height:10px;border-radius:3px}
.hbar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.hbar-label{font-size:12px;color:var(--muted);min-width:80px;text-align:right}
.hbar-fill{height:20px;border-radius:4px;min-width:2px;transition:width .5s}
.hbar-value{font-size:12px;font-weight:600}
.activity-feed{max-height:300px;overflow-y:auto}
.activity-item{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
.activity-icon{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.activity-meta{color:var(--muted);font-size:11px}
.funnel-step{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.funnel-bar{height:32px;border-radius:6px;display:flex;align-items:center;padding:0 12px;font-size:12px;font-weight:700;color:#fff;min-width:50px;transition:width .5s}
.funnel-label{font-size:12px;color:var(--muted);min-width:100px}
.funnel-count{font-size:13px;font-weight:700;min-width:40px}
.hour-chart{display:flex;align-items:flex-end;gap:2px;height:80px}
.hour-bar{flex:1;border-radius:2px 2px 0 0;min-width:4px;transition:height .3s;cursor:default}
.hour-labels{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:4px}
</style>
</head>
<body>

<!-- Nav -->
<nav class="admin-nav">
  <div style="display:flex;align-items:center">
    <div class="logo">Poly<span>Market</span> Bot</div>
    <span class="badge">ADMIN</span>
  </div>
  <div class="nav-right">
    <a href="/dashboard">← Back to Dashboard</a>
    <a href="#" onclick="logout()">Sign Out</a>
  </div>
</nav>

<div class="admin-body">

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" data-tab="overview">Overview</button>
    <button class="tab" data-tab="analytics">Analytics</button>
    <button class="tab" data-tab="stripe">Billing</button>
    <button class="tab" data-tab="users">Users</button>
    <button class="tab" data-tab="settings">Settings</button>
  </div>

  <!-- ═══════════ OVERVIEW TAB ═══════════ -->
  <div class="tab-content active" id="tab-overview">
    <div class="stats-row" id="statsRow">
      <div class="stat-card">
        <div class="stat-label">Total Users</div>
        <div class="stat-value text-accent" id="statUsers">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Subscriptions</div>
        <div class="stat-value text-green" id="statActive">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Canceled</div>
        <div class="stat-value text-red" id="statCanceled">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Monthly Revenue (est)</div>
        <div class="stat-value text-purple" id="statRevenue">—</div>
      </div>
    </div>

    <div class="panel">
      <h3><span class="icon">⚙️</span> System Status</h3>
      <div class="stats-row" style="margin-bottom:0">
        <div class="stat-card">
          <div class="stat-label">Stripe</div>
          <div class="stat-value" style="font-size:16px" id="stripeStatus">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Lemon Squeezy</div>
          <div class="stat-value" style="font-size:16px" id="lsStatus">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">NOWPayments</div>
          <div class="stat-value" style="font-size:16px" id="npStatus">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Server Uptime</div>
          <div class="stat-value" style="font-size:16px" id="serverUptime">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Node.js</div>
          <div class="stat-value" style="font-size:16px" id="nodeVersion">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Wallets</div>
          <div class="stat-value" style="font-size:16px" id="totalWallets">—</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3><span class="icon">👤</span> Recent Signups</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Status</th><th>Signed Up</th></tr></thead>
          <tbody id="recentUsers"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══════════ ANALYTICS TAB ═══════════ -->
  <div class="tab-content" id="tab-analytics">
    <!-- Period Selector -->
    <div class="analytics-period">
      <button class="period-btn" data-days="7">7 Days</button>
      <button class="period-btn active" data-days="30">30 Days</button>
      <button class="period-btn" data-days="90">90 Days</button>
      <button class="period-btn" data-days="0">All Time</button>
    </div>

    <!-- Key Metrics -->
    <div class="metric-grid" id="analyticsMetrics"></div>

    <!-- Charts Row 1: Signups + Revenue -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">📈</span> User Growth</h3>
        <div class="chart-container" id="signupsChart"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">🤖</span> Bot Deployments</h3>
        <div class="chart-container" id="walletsChart"></div>
      </div>
    </div>

    <!-- Charts Row 2: Distributions -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">🎯</span> Subscription Funnel</h3>
        <div id="funnelChart"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">📊</span> Plan Distribution</h3>
        <div style="display:flex;align-items:center;justify-content:center;flex-direction:column">
          <div id="planDonut" style="width:180px;height:180px"></div>
          <div class="donut-legend" id="planLegend"></div>
        </div>
      </div>
    </div>

    <!-- Charts Row 3: Activity + Strategies -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">⚡</span> Daily Activity</h3>
        <div class="chart-container" id="activityChart"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">🕐</span> Hourly Activity (UTC)</h3>
        <div id="hourlyChart" style="padding:12px 0"></div>
      </div>
    </div>

    <!-- Row 4: Strategies + Providers -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">🧠</span> Strategy Breakdown</h3>
        <div id="strategyBars"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">💰</span> Payment Providers</h3>
        <div id="providerBars"></div>
      </div>
    </div>

    <!-- Row 5: Capital + Mode -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">🏦</span> Capital Overview</h3>
        <div id="capitalStats" class="stats-row" style="margin-bottom:0"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">🔄</span> Trading Mode Split</h3>
        <div style="display:flex;align-items:center;justify-content:center;flex-direction:column">
          <div id="modeDonut" style="width:160px;height:160px"></div>
          <div class="donut-legend" id="modeLegend"></div>
        </div>
      </div>
    </div>

    <!-- Row 6: Event totals + Top users -->
    <div class="chart-grid">
      <div class="panel">
        <h3><span class="icon">📋</span> Event Summary</h3>
        <div id="eventTotalsBars"></div>
      </div>
      <div class="panel">
        <h3><span class="icon">🏆</span> Top Users by Bots</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Bots</th><th>Plan</th><th>Status</th></tr></thead>
            <tbody id="topUsersBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Row 7: Cohort Retention -->
    <div class="panel">
      <h3><span class="icon">🔁</span> Monthly Cohort Retention</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cohort</th><th>Signups</th><th>Still Active</th><th>Retention Rate</th><th>Visual</th></tr></thead>
          <tbody id="cohortBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Row 8: Activity Feed -->
    <div class="panel">
      <h3><span class="icon">🔔</span> Recent Activity</h3>
      <div class="activity-feed" id="activityFeed"></div>
    </div>
  </div>

  <!-- ═══════════ STRIPE TAB ═══════════ -->
  <div class="tab-content" id="tab-stripe">
    <div class="panel">
      <h3><span class="icon">💳</span> Stripe Configuration</h3>
      <div id="stripeAlert"></div>
      <form id="stripeForm">
        <div class="form-grid">
          <div class="form-group">
            <label>Stripe Secret Key</label>
            <input type="password" id="stripeSecretKey" placeholder="sk_live_..." autocomplete="off">
            <div class="hint">Your Stripe secret API key (sk_live_... or sk_test_...)</div>
          </div>
          <div class="form-group">
            <label>Webhook Secret</label>
            <input type="password" id="stripeWebhookSecret" placeholder="whsec_..." autocomplete="off">
            <div class="hint">Found in Stripe Dashboard → Webhooks → Signing secret</div>
          </div>
          <div class="form-group">
            <label>Price ID (Monthly)</label>
            <input type="text" id="stripePriceId" placeholder="price_..." autocomplete="off">
            <div class="hint">The Stripe Price ID for the $99/mo subscription</div>
          </div>
          <div class="form-group">
            <label>Signup Fee (cents)</label>
            <input type="number" id="signupFeeCents" placeholder="0" min="0" autocomplete="off">
            <div class="hint">One-time signup fee in cents (0 = no signup fee)</div>
          </div>
        </div>
        <div style="margin-top:20px;display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn btn-primary">Save Stripe Settings</button>
          <button type="button" class="btn btn-outline" onclick="testStripe()">Test Connection</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h3><span class="icon">📋</span> Stripe Setup Guide</h3>
      <div class="alert alert-info" style="margin-bottom:12px">
        Follow these steps to enable billing for your SaaS.
      </div>
      <ol style="font-size:13px;color:var(--muted);line-height:2;padding-left:20px">
        <li>Create an account at <strong>stripe.com</strong></li>
        <li>Go to <strong>Developers → API keys</strong> and copy your secret key</li>
        <li>Create a <strong>Product</strong> with a <strong>$99/month recurring price</strong></li>
        <li>Copy the <strong>Price ID</strong> (starts with price_...)</li>
        <li>Go to <strong>Developers → Webhooks</strong>, add endpoint: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">https://yourdomain.com/api/billing/webhook</code></li>
        <li>Select events: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">checkout.session.completed</code>, <code style="background:var(--bg);padding:2px 6px;border-radius:4px">customer.subscription.updated</code>, <code style="background:var(--bg);padding:2px 6px;border-radius:4px">customer.subscription.deleted</code>, <code style="background:var(--bg);padding:2px 6px;border-radius:4px">invoice.payment_failed</code></li>
        <li>Copy the <strong>Signing secret</strong> (starts with whsec_...)</li>
        <li>Enter all values above and click <strong>Save Stripe Settings</strong></li>
      </ol>
    </div>

    <!-- ── Lemon Squeezy Configuration ── -->
    <div class="panel">
      <h3><span class="icon">🍋</span> Lemon Squeezy Configuration</h3>
      <div id="lsAlert"></div>
      <form id="lsForm">
        <div class="form-grid">
          <div class="form-group">
            <label>API Key</label>
            <input type="password" id="lsApiKey" placeholder="eyJ0eX..." autocomplete="off">
            <div class="hint">Your Lemon Squeezy API key from Settings → API</div>
          </div>
          <div class="form-group">
            <label>Webhook Secret</label>
            <input type="password" id="lsWebhookSecret" placeholder="whsec_..." autocomplete="off">
            <div class="hint">Signing secret from Webhooks settings</div>
          </div>
          <div class="form-group">
            <label>Store ID</label>
            <input type="text" id="lsStoreId" placeholder="12345" autocomplete="off">
            <div class="hint">Your Lemon Squeezy Store ID</div>
          </div>
          <div class="form-group">
            <label>Variant ID</label>
            <input type="text" id="lsVariantId" placeholder="67890" autocomplete="off">
            <div class="hint">The Variant ID for the $99/mo subscription product</div>
          </div>
        </div>
        <div style="margin-top:20px;display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn btn-primary">Save Lemon Squeezy Settings</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h3><span class="icon">📋</span> Lemon Squeezy Setup Guide</h3>
      <div class="alert alert-info" style="margin-bottom:12px">
        Alternative to Stripe — accept payments via Lemon Squeezy.
      </div>
      <ol style="font-size:13px;color:var(--muted);line-height:2;padding-left:20px">
        <li>Create an account at <strong>lemonsqueezy.com</strong></li>
        <li>Go to <strong>Settings → API</strong> and generate an API key</li>
        <li>Create a <strong>Store</strong> and note the <strong>Store ID</strong> from the URL</li>
        <li>Create a <strong>Product</strong> with a <strong>$99/month subscription</strong> variant</li>
        <li>Copy the <strong>Variant ID</strong> from the variant URL</li>
        <li>Go to <strong>Settings → Webhooks</strong>, add endpoint: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">https://yourdomain.com/api/billing/lemonsqueezy/webhook</code></li>
        <li>Select events: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">subscription_created</code>, <code style="background:var(--bg);padding:2px 6px;border-radius:4px">subscription_updated</code>, <code style="background:var(--bg);padding:2px 6px;border-radius:4px">subscription_cancelled</code></li>
        <li>Copy the <strong>Signing secret</strong> and enter all values above</li>
      </ol>
    </div>

    <!-- ── NOWPayments Configuration ── -->
    <div class="panel">
      <h3><span class="icon">₿</span> NOWPayments Configuration</h3>
      <div id="npAlert"></div>
      <form id="npForm">
        <div class="form-grid">
          <div class="form-group">
            <label>API Key</label>
            <input type="password" id="npApiKey" placeholder="your-api-key" autocomplete="off">
            <div class="hint">Your NOWPayments API key from the dashboard</div>
          </div>
          <div class="form-group">
            <label>Public Key</label>
            <input type="password" id="npPublicKey" placeholder="your-public-key" autocomplete="off">
            <div class="hint">Your NOWPayments Public Key from the dashboard</div>
          </div>
          <div class="form-group">
            <label>Price (USD)</label>
            <input type="number" id="npPriceUsd" placeholder="99" min="1" step="0.01" autocomplete="off">
            <div class="hint">Monthly subscription price in USD (default: $99)</div>
          </div>
        </div>
        <div style="margin-top:20px;display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn btn-primary">Save NOWPayments Settings</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h3><span class="icon">📋</span> NOWPayments Setup Guide</h3>
      <div class="alert alert-info" style="margin-bottom:12px">
        Accept cryptocurrency payments via NOWPayments.
      </div>
      <ol style="font-size:13px;color:var(--muted);line-height:2;padding-left:20px">
        <li>Create an account at <strong>nowpayments.io</strong></li>
        <li>Go to <strong>Store Settings → API Keys</strong> and create an API key</li>
        <li>Go to <strong>Store Settings → IPN</strong> and set callback URL: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">https://yourdomain.com/api/billing/nowpayments/webhook</code></li>
        <li>Copy the <strong>Public Key</strong> from the API Keys page</li>
        <li>Enter all values above and click <strong>Save NOWPayments Settings</strong></li>
      </ol>
    </div>
  </div>

  <!-- ═══════════ USERS TAB ═══════════ -->
  <div class="tab-content" id="tab-users">
    <div class="panel">
      <h3><span class="icon">👥</span> All Users</h3>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <input type="text" id="userSearch" placeholder="Search users by email..." style="flex:1;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Plan</th>
              <th>Subscription</th>
              <th>Wallets</th>
              <th>Signed Up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="usersTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══════════ SETTINGS TAB ═══════════ -->
  <div class="tab-content" id="tab-settings">
    <div class="panel">
      <h3><span class="icon">🔐</span> Environment Variables</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Edit environment settings below and click Save. Secrets are masked — enter a new value to replace, or leave masked to keep current. Some changes require a server restart.</p>
      <form id="envSettingsForm">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Variable</th><th>Value</th><th>Status</th></tr></thead>
            <tbody id="envTable"></tbody>
          </table>
        </div>
        <div style="margin-top:16px;display:flex;gap:12px">
          <button type="submit" class="btn btn-primary">Save Settings</button>
          <button type="button" class="btn btn-outline" onclick="loadAdminData()">Reset</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h3><span class="icon">🛡️</span> Admin Access</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Promote a user to admin or create a new admin account.</p>
      <form id="promoteForm" style="display:flex;gap:12px;align-items:flex-end">
        <div class="form-group" style="flex:1">
          <label>User Email</label>
          <input type="email" id="promoteEmail" placeholder="user@example.com" required>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-bottom:0;height:44px">Promote to Admin</button>
      </form>
    </div>
  </div>

</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
/* ───── Utilities ───── */
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast toast-' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const cls = status === 'active' ? 'badge-active' : status === 'canceled' ? 'badge-canceled' : status === 'past_due' ? 'badge-past_due' : 'badge-none';
  return '<span class="badge-sm ' + cls + '">' + status + '</span>';
}

/* ───── Tabs ───── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

/* ───── Load admin data ───── */
let allUsers = [];

async function loadAdminData() {
  try {
    const data = await api('/api/admin/data');
    allUsers = data.users;

    // Stats
    document.getElementById('statUsers').textContent = data.stats.totalUsers;
    document.getElementById('statActive').textContent = data.stats.activeSubscriptions;
    document.getElementById('statCanceled').textContent = data.stats.canceled;
    document.getElementById('statRevenue').textContent = '$' + (data.stats.activeSubscriptions * 99).toFixed(2);

    // System
    document.getElementById('stripeStatus').innerHTML = data.system.stripeConfigured
      ? '<span class="status-dot dot-green"></span>Connected'
      : '<span class="status-dot dot-red"></span>Not configured';
    document.getElementById('lsStatus').innerHTML = data.system.lemonSqueezyConfigured
      ? '<span class="status-dot dot-green"></span>Connected'
      : '<span class="status-dot dot-red"></span>Not configured';
    document.getElementById('npStatus').innerHTML = data.system.nowPaymentsConfigured
      ? '<span class="status-dot dot-green"></span>Connected'
      : '<span class="status-dot dot-red"></span>Not configured';
    document.getElementById('serverUptime').textContent = data.system.uptime;
    document.getElementById('nodeVersion').textContent = data.system.nodeVersion;
    document.getElementById('totalWallets').textContent = data.system.totalWallets;

    // Stripe form
    document.getElementById('stripeSecretKey').value = data.stripe.secretKey;
    document.getElementById('stripeWebhookSecret').value = data.stripe.webhookSecret;
    document.getElementById('stripePriceId').value = data.stripe.priceId;
    document.getElementById('signupFeeCents').value = data.stripe.signupFeeCents;

    // Stripe alert
    const alertEl = document.getElementById('stripeAlert');
    if (!data.system.stripeConfigured) {
      alertEl.innerHTML = '<div class="alert alert-warn">Stripe is not configured. Billing is disabled — all signups get free access.</div>';
    } else {
      alertEl.innerHTML = '<div class="alert alert-info">Stripe is connected and billing is active.</div>';
    }

    // Lemon Squeezy form
    if (data.lemonSqueezy) {
      document.getElementById('lsApiKey').value = data.lemonSqueezy.apiKey;
      document.getElementById('lsWebhookSecret').value = data.lemonSqueezy.webhookSecret;
      document.getElementById('lsStoreId').value = data.lemonSqueezy.storeId;
      document.getElementById('lsVariantId').value = data.lemonSqueezy.variantId;
    }
    const lsAlertEl = document.getElementById('lsAlert');
    if (!data.system.lemonSqueezyConfigured) {
      lsAlertEl.innerHTML = '<div class="alert alert-warn">Lemon Squeezy is not configured.</div>';
    } else {
      lsAlertEl.innerHTML = '<div class="alert alert-info">Lemon Squeezy is connected and active.</div>';
    }

    // NOWPayments form
    if (data.nowPayments) {
      document.getElementById('npApiKey').value = data.nowPayments.apiKey;
      document.getElementById('npPublicKey').value = data.nowPayments.publicKey;
      document.getElementById('npPriceUsd').value = data.nowPayments.priceUsd;
    }
    const npAlertEl = document.getElementById('npAlert');
    if (!data.system.nowPaymentsConfigured) {
      npAlertEl.innerHTML = '<div class="alert alert-warn">NOWPayments is not configured.</div>';
    } else {
      npAlertEl.innerHTML = '<div class="alert alert-info">NOWPayments is connected and active.</div>';
    }

    // Env table (editable)
    const secretKeys = new Set(['POLYMARKET_API_KEY','JWT_SECRET','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','LEMONSQUEEZY_API_KEY','LEMONSQUEEZY_WEBHOOK_SECRET','NOWPAYMENTS_API_KEY','NOWPAYMENTS_PUBLIC_KEY']);
    const envBody = document.getElementById('envTable');
    envBody.innerHTML = data.env.map(e => {
      const isSecret = secretKeys.has(e.key);
      const inputType = isSecret ? 'password' : 'text';
      const val = e.display.replace(/"/g, '&quot;');
      return '<tr>' +
        '<td style="font-family:monospace;font-size:12px">' + e.key + '</td>' +
        '<td><input type="' + inputType + '" name="env_' + e.key + '" value="' + val + '" placeholder="Not set" style="width:100%;font-family:monospace;font-size:12px;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--fg)"' + (isSecret ? ' onfocus="if(this.value.startsWith(\\'••••\\')){this.value=\\'\\';this.type=\\'text\\'}" onblur="if(!this.value){this.type=\\'password\\'}"' : '') + '></td>' +
        '<td>' + (e.set ? '<span class="status-dot dot-green"></span>Set' : '<span class="status-dot dot-red"></span>Not set') + '</td></tr>';
    }).join('');

    // Recent users
    const recentBody = document.getElementById('recentUsers');
    recentBody.innerHTML = data.users.slice(0, 5).map(u =>
      '<tr><td class="user-email">' + u.email + '</td>' +
      '<td>' + statusBadge(u.subscriptionStatus) + '</td>' +
      '<td>' + timeAgo(u.createdAt) + '</td></tr>'
    ).join('');

    renderUsersTable(allUsers);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ───── Users table ───── */
function planBadge(plan) {
  if (plan === 'enterprise') return '<span class="badge-sm badge-admin">Enterprise</span>';
  if (plan === 'pro') return '<span class="badge-sm badge-active">Pro</span>';
  return '<span class="badge-sm badge-none">Free</span>';
}

function renderUsersTable(users) {
  const body = document.getElementById('usersTableBody');
  body.innerHTML = users.map(u =>
    '<tr>' +
    '<td class="user-email">' + u.email + '</td>' +
    '<td>' + (u.isAdmin ? '<span class="badge-sm badge-admin">Admin</span>' : '<span class="badge-sm badge-none">User</span>') + '</td>' +
    '<td>' +
      '<select onchange="setPlan(\\'' + u.id + '\\', this.value)" style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">' +
        '<option value="free"' + (u.planTier === 'free' ? ' selected' : '') + '>Free</option>' +
        '<option value="pro"' + (u.planTier === 'pro' ? ' selected' : '') + '>Pro</option>' +
        '<option value="enterprise"' + (u.planTier === 'enterprise' ? ' selected' : '') + '>Enterprise</option>' +
      '</select>' +
    '</td>' +
    '<td>' + statusBadge(u.subscriptionStatus) + '</td>' +
    '<td>' + u.walletCount + '</td>' +
    '<td style="font-size:12px;color:var(--muted)">' + formatDate(u.createdAt) + '</td>' +
    '<td>' +
      (!u.isAdmin
        ? '<button class="btn btn-sm btn-outline" onclick="toggleAdmin(\\'' + u.id + '\\',true)">Make Admin</button> '
        : '<button class="btn btn-sm btn-outline" onclick="toggleAdmin(\\'' + u.id + '\\',false)">Remove Admin</button> ') +
      (u.subscriptionStatus !== 'active'
        ? '<button class="btn btn-sm btn-outline" onclick="setSubscription(\\'' + u.id + '\\',\\'active\\')">Activate</button>'
        : '<button class="btn btn-sm btn-danger" onclick="setSubscription(\\'' + u.id + '\\',\\'canceled\\')">Deactivate</button>') +
    '</td>' +
    '</tr>'
  ).join('');
}

// Search filter
document.getElementById('userSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderUsersTable(allUsers.filter(u => u.email.toLowerCase().includes(q)));
});

/* ───── Actions ───── */
async function toggleAdmin(userId, isAdmin) {
  try {
    await api('/api/admin/set-admin', { method: 'POST', body: JSON.stringify({ userId, isAdmin }) });
    toast(isAdmin ? 'User promoted to admin' : 'Admin role removed');
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

async function setPlan(userId, plan) {
  try {
    await api('/api/admin/set-plan', { method: 'POST', body: JSON.stringify({ userId, plan }) });
    toast('Plan updated to ' + plan.charAt(0).toUpperCase() + plan.slice(1));
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

async function setSubscription(userId, status) {
  try {
    await api('/api/admin/set-subscription', { method: 'POST', body: JSON.stringify({ userId, status }) });
    toast('Subscription updated to ' + status);
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

// Stripe form
document.getElementById('stripeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/stripe-config', {
      method: 'POST',
      body: JSON.stringify({
        secretKey: document.getElementById('stripeSecretKey').value.trim(),
        webhookSecret: document.getElementById('stripeWebhookSecret').value.trim(),
        priceId: document.getElementById('stripePriceId').value.trim(),
        signupFeeCents: parseInt(document.getElementById('signupFeeCents').value) || 0,
      }),
    });
    toast('Stripe settings saved. Restart server to apply.');
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}); 

async function testStripe() {
  try {
    const data = await api('/api/admin/stripe-test');
    toast(data.message);
  } catch (err) { toast(err.message, 'error'); }
}

// Lemon Squeezy form
document.getElementById('lsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/lemonsqueezy-config', {
      method: 'POST',
      body: JSON.stringify({
        apiKey: document.getElementById('lsApiKey').value.trim(),
        webhookSecret: document.getElementById('lsWebhookSecret').value.trim(),
        storeId: document.getElementById('lsStoreId').value.trim(),
        variantId: document.getElementById('lsVariantId').value.trim(),
      }),
    });
    toast('Lemon Squeezy settings saved. Restart server to apply.');
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
});

// NOWPayments form
document.getElementById('npForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/nowpayments-config', {
      method: 'POST',
      body: JSON.stringify({
        apiKey: document.getElementById('npApiKey').value.trim(),
        publicKey: document.getElementById('npPublicKey').value.trim(),
        priceUsd: document.getElementById('npPriceUsd').value.trim(),
      }),
    });
    toast('NOWPayments settings saved. Restart server to apply.');
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
});

// Promote form
document.getElementById('promoteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('promoteEmail').value.trim();
  if (!email) return;
  try {
    await api('/api/admin/promote', { method: 'POST', body: JSON.stringify({ email }) });
    toast(email + ' promoted to admin');
    document.getElementById('promoteEmail').value = '';
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
});

// Env settings form
document.getElementById('envSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {};
  document.querySelectorAll('#envTable input').forEach(input => {
    const key = input.name.replace('env_', '');
    const val = input.value.trim();
    if (val && !val.startsWith('••••')) settings[key] = val;
  });
  if (Object.keys(settings).length === 0) { toast('No changes to save', 'error'); return; }
  try {
    const data = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ settings }) });
    toast(data.message);
    loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
});

function logout() {
  fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/login');
}

/* ═══════════ ANALYTICS ═══════════ */
const CHART_COLORS = ['#4f8ff7','#00d68f','#ff4d6a','#ffc107','#a855f7','#f97316','#6366f1','#14b8a6','#ec4899','#84cc16'];
let analyticsPeriod = 30;

// Period buttons
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    analyticsPeriod = parseInt(btn.dataset.days) || 0;
    loadAnalytics();
  });
});

function svgAreaChart(container, data, labelKey, valueKey, color, label) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px">No data yet</div>';
    return;
  }
  const W = 600, H = 200, PAD = 40, PADT = 20, PADR = 20;
  const vals = data.map(d => d[valueKey]);
  const maxV = Math.max(...vals, 1);
  const xStep = data.length > 1 ? (W - PAD - PADR) / (data.length - 1) : 0;
  let pathD = '', areaD = '';
  const points = data.map((d, i) => {
    const x = PAD + i * xStep;
    const y = PADT + (H - PADT - PAD) * (1 - vals[i] / maxV);
    return { x, y, label: d[labelKey], value: vals[i] };
  });
  points.forEach((p, i) => {
    pathD += (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
    areaD += (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
  });
  if (points.length > 0) {
    areaD += 'L' + points[points.length-1].x + ',' + (H - PAD) + 'L' + points[0].x + ',' + (H - PAD) + 'Z';
  }
  // Y axis labels
  const yLabels = [0, Math.round(maxV/2), maxV];
  let yLabelsSvg = yLabels.map(v => {
    const y = PADT + (H - PADT - PAD) * (1 - v / maxV);
    return '<text x="' + (PAD-4) + '" y="' + (y+4) + '" text-anchor="end" fill="#8892a0" font-size="10">' + v + '</text>' +
           '<line x1="' + PAD + '" y1="' + y + '" x2="' + (W-PADR) + '" y2="' + y + '" stroke="#1e2630" stroke-dasharray="4"/>';
  }).join('');
  // X axis labels (show ~6)
  const step = Math.max(1, Math.floor(data.length / 6));
  let xLabelsSvg = points.filter((_, i) => i % step === 0 || i === points.length - 1).map(p =>
    '<text x="' + p.x + '" y="' + (H - PAD + 16) + '" text-anchor="middle" fill="#8892a0" font-size="10">' + p.label.slice(5) + '</text>'
  ).join('');
  // Dots
  let dots = points.map(p =>
    '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + color + '"/>'
  ).join('');
  container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    '<defs><linearGradient id="grad_' + label + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.3"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/></linearGradient></defs>' +
    yLabelsSvg + xLabelsSvg +
    '<path d="' + areaD + '" fill="url(#grad_' + label + ')"/>' +
    '<path d="' + pathD + '" stroke="' + color + '" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    dots +
    '</svg>';
}

function svgStackedBarChart(container, data, color1, color2, color3) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px">No data yet</div>';
    return;
  }
  const W = 600, H = 200, PAD = 40, PADT = 20, PADR = 20;
  const maxV = Math.max(...data.map(d => (d.login||0) + (d.signup||0) + (d.wallet_create||0) + (d.page_view||0)), 1);
  const barW = Math.max(4, Math.min(20, (W - PAD - PADR) / data.length - 2));
  let bars = '';
  data.forEach((d, i) => {
    const x = PAD + i * ((W - PAD - PADR) / data.length) + 1;
    const total = (d.login||0) + (d.signup||0) + (d.wallet_create||0) + (d.page_view||0);
    const h = (H - PADT - PAD) * (total / maxV);
    // stacked
    let y = H - PAD;
    const segments = [
      { val: d.page_view||0, color: '#1e2630' },
      { val: d.login||0, color: color1 },
      { val: d.signup||0, color: color2 },
      { val: d.wallet_create||0, color: color3 },
    ];
    segments.forEach(s => {
      const sh = (H - PADT - PAD) * (s.val / maxV);
      if (sh > 0) {
        y -= sh;
        bars += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + sh + '" rx="2" fill="' + s.color + '"/>';
      }
    });
  });
  // X labels
  const step = Math.max(1, Math.floor(data.length / 6));
  let xLabels = data.filter((_, i) => i % step === 0).map((d, _, arr) => {
    const idx = data.indexOf(d);
    const x = PAD + idx * ((W - PAD - PADR) / data.length) + barW / 2;
    return '<text x="' + x + '" y="' + (H - PAD + 16) + '" text-anchor="middle" fill="#8892a0" font-size="10">' + d.day.slice(5) + '</text>';
  }).join('');
  container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    bars + xLabels +
    '<text x="' + (W - PADR) + '" y="14" text-anchor="end" fill="#4f8ff7" font-size="9">● logins</text>' +
    '<text x="' + (W - PADR - 60) + '" y="14" text-anchor="end" fill="#00d68f" font-size="9">● signups</text>' +
    '<text x="' + (W - PADR - 120) + '" y="14" text-anchor="end" fill="#a855f7" font-size="9">● bots</text>' +
    '</svg>';
}

function svgDonut(container, legendContainer, data, labelKey, valueKey) {
  if (!data || data.length === 0 || data.every(d => d[valueKey] === 0)) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px">No data</div>';
    if (legendContainer) legendContainer.innerHTML = '';
    return;
  }
  const total = data.reduce((s, d) => s + d[valueKey], 0);
  const R = 70, r = 45, cx = 90, cy = 90;
  let angle = -Math.PI / 2;
  let paths = '';
  data.forEach((d, i) => {
    const slice = (d[valueKey] / total) * Math.PI * 2;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + slice);
    const y2 = cy + R * Math.sin(angle + slice);
    const x3 = cx + r * Math.cos(angle + slice);
    const y3 = cy + r * Math.sin(angle + slice);
    const x4 = cx + r * Math.cos(angle);
    const y4 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    paths += '<path d="M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + x2 + ',' + y2 + ' L' + x3 + ',' + y3 + ' A' + r + ',' + r + ' 0 ' + large + ',0 ' + x4 + ',' + y4 + 'Z" fill="' + CHART_COLORS[i % CHART_COLORS.length] + '" stroke="var(--surface)" stroke-width="2"/>';
    angle += slice;
  });
  container.innerHTML = '<svg viewBox="0 0 180 180">' + paths +
    '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="800">' + total + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" fill="var(--muted)" font-size="10">TOTAL</text></svg>';
  if (legendContainer) {
    legendContainer.innerHTML = data.map((d, i) =>
      '<div class="donut-legend-item"><div class="swatch" style="background:' + CHART_COLORS[i % CHART_COLORS.length] + '"></div>' +
      d[labelKey] + ' (' + d[valueKey] + ', ' + Math.round(d[valueKey]/total*100) + '%)</div>'
    ).join('');
  }
}

function renderHBars(container, data, labelKey, valueKey, color) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No data yet</div>';
    return;
  }
  const maxV = Math.max(...data.map(d => d[valueKey]), 1);
  container.innerHTML = data.map((d, i) =>
    '<div class="hbar"><span class="hbar-label">' + (d[labelKey] || 'unknown') + '</span>' +
    '<div class="hbar-fill" style="width:' + Math.max(4, (d[valueKey]/maxV*100)) + '%;background:' + (CHART_COLORS[i % CHART_COLORS.length]) + '"></div>' +
    '<span class="hbar-value">' + d[valueKey] + '</span></div>'
  ).join('');
}

function renderFunnel(container, metrics) {
  const steps = [
    { label: 'Total Users', count: metrics.totalUsers, color: '#4f8ff7' },
    { label: 'Free/Trial', count: metrics.freeUsers + metrics.trialingUsers, color: '#ffc107' },
    { label: 'Active Paid', count: metrics.activeSubscriptions, color: '#00d68f' },
    { label: 'Churned', count: metrics.canceledUsers, color: '#ff4d6a' },
  ];
  const maxC = Math.max(...steps.map(s => s.count), 1);
  container.innerHTML = steps.map(s =>
    '<div class="funnel-step">' +
    '<span class="funnel-label">' + s.label + '</span>' +
    '<div class="funnel-bar" style="width:' + Math.max(12, (s.count/maxC*100)) + '%;background:' + s.color + '">' + s.count + '</div>' +
    '<span class="funnel-count" style="color:' + s.color + '">' + (metrics.totalUsers > 0 ? Math.round(s.count/metrics.totalUsers*100) : 0) + '%</span>' +
    '</div>'
  ).join('');
}

function renderHourlyChart(container, data) {
  const hours = Array.from({length:24}, (_, i) => ({ hour: i, count: 0 }));
  (data || []).forEach(d => { if (hours[d.hour]) hours[d.hour].count = d.count; });
  const maxC = Math.max(...hours.map(h => h.count), 1);
  container.innerHTML =
    '<div class="hour-chart">' +
    hours.map(h =>
      '<div class="hour-bar" style="height:' + Math.max(2, h.count/maxC*100) + '%;background:' + (h.count > maxC*0.7 ? 'var(--accent)' : h.count > maxC*0.3 ? 'var(--accent2)' : 'var(--border)') + '" title="' + h.hour + ':00 — ' + h.count + ' events"></div>'
    ).join('') +
    '</div>' +
    '<div class="hour-labels"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>';
}

const EVENT_ICONS = { login: '🔑', signup: '🎉', wallet_create: '🤖', wallet_delete: '🗑️', page_view: '👁️', subscription_activated: '💳', subscription_canceled: '❌' };
const EVENT_COLORS = { login: 'rgba(79,143,247,.15)', signup: 'rgba(0,214,143,.15)', wallet_create: 'rgba(168,85,247,.15)', wallet_delete: 'rgba(255,77,106,.15)', page_view: 'rgba(136,146,160,.1)' };

function renderActivityFeed(container, events) {
  if (!events || events.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">No activity recorded yet. Events will appear here as users interact with the platform.</div>';
    return;
  }
  container.innerHTML = events.slice(0, 30).map(e =>
    '<div class="activity-item">' +
    '<div class="activity-icon" style="background:' + (EVENT_COLORS[e.type] || 'rgba(136,146,160,.1)') + '">' + (EVENT_ICONS[e.type] || '📌') + '</div>' +
    '<div style="flex:1"><div>' + e.email + ' <strong>' + e.type.replace(/_/g, ' ') + '</strong>' +
    (e.metadata ? ' <span style="color:var(--muted)">— ' + Object.entries(e.metadata).map(([k,v]) => k + ': ' + v).join(', ') + '</span>' : '') +
    '</div><div class="activity-meta">' + timeAgo(e.timestamp) + '</div></div></div>'
  ).join('');
}

async function loadAnalytics() {
  try {
    const data = await api('/api/admin/analytics?days=' + analyticsPeriod);
    const m = data.metrics;

    // Key Metrics
    const pricePerUser = 99;
    const mrr = m.activeSubscriptions * pricePerUser;
    const arpu = m.totalUsers > 0 ? Math.round(mrr / m.totalUsers * 100) / 100 : 0;
    const ltv = m.churnRate > 0 ? Math.round(arpu / (m.churnRate / 100) * 100) / 100 : 0;

    document.getElementById('analyticsMetrics').innerHTML = [
      { label: 'DAU', value: m.dau, color: 'text-accent' },
      { label: 'WAU', value: m.wau, color: 'text-accent' },
      { label: 'MAU', value: m.mau, color: 'text-accent' },
      { label: 'MRR', value: '$' + mrr.toLocaleString(), color: 'text-green' },
      { label: 'ARPU', value: '$' + arpu.toFixed(2), color: 'text-purple' },
      { label: 'LTV (est)', value: ltv > 0 ? '$' + ltv.toLocaleString() : '—', color: 'text-yellow' },
      { label: 'Conv. Rate', value: m.conversionRate + '%', color: 'text-green' },
      { label: 'Churn Rate', value: m.churnRate + '%', color: m.churnRate > 10 ? 'text-red' : 'text-green' },
      { label: 'Signups', value: m.signupsInPeriod, color: 'text-accent' },
      { label: 'Total Bots', value: m.totalWallets, color: 'text-purple' },
      { label: 'Avg Bots/User', value: m.avgWalletsPerUser, color: 'text-accent' },
      { label: 'Capital Managed', value: '$' + Math.round(m.totalCapitalManaged).toLocaleString(), color: 'text-green' },
    ].map(x =>
      '<div class="metric-card"><div class="metric-value ' + x.color + '">' + x.value + '</div><div class="metric-label">' + x.label + '</div></div>'
    ).join('');

    // Signup chart
    svgAreaChart(document.getElementById('signupsChart'), data.signupsByDay, 'day', 'count', '#4f8ff7', 'signups');

    // Wallets chart
    svgAreaChart(document.getElementById('walletsChart'), data.walletsByDay, 'day', 'count', '#a855f7', 'wallets');

    // Activity chart
    svgStackedBarChart(document.getElementById('activityChart'), data.eventsByDay, '#4f8ff7', '#00d68f', '#a855f7');

    // Funnel
    renderFunnel(document.getElementById('funnelChart'), m);

    // Plan donut
    svgDonut(document.getElementById('planDonut'), document.getElementById('planLegend'), data.planDistribution, 'plan', 'count');

    // Mode donut
    svgDonut(document.getElementById('modeDonut'), document.getElementById('modeLegend'), data.modeDistribution, 'mode', 'count');

    // Hourly activity
    renderHourlyChart(document.getElementById('hourlyChart'), data.hourlyActivity);

    // Strategy bars
    renderHBars(document.getElementById('strategyBars'), data.strategyDistribution, 'strategy', 'count');

    // Provider bars
    renderHBars(document.getElementById('providerBars'), data.providerDistribution, 'provider', 'count');

    // Event totals
    renderHBars(document.getElementById('eventTotalsBars'), data.eventTotals, 'event_type', 'count');

    // Capital stats
    const cs = data.capitalStats;
    document.getElementById('capitalStats').innerHTML = [
      { label: 'Total Capital', value: '$' + Math.round(cs.totalCapital||0).toLocaleString() },
      { label: 'Avg Capital', value: '$' + Math.round(cs.avgCapital||0).toLocaleString() },
      { label: 'Min Capital', value: '$' + Math.round(cs.minCapital||0).toLocaleString() },
      { label: 'Max Capital', value: '$' + Math.round(cs.maxCapital||0).toLocaleString() },
    ].map(x =>
      '<div class="stat-card"><div class="stat-label">' + x.label + '</div><div class="stat-value" style="font-size:18px">' + x.value + '</div></div>'
    ).join('');

    // Top users
    document.getElementById('topUsersBody').innerHTML = data.topUsers.map(u =>
      '<tr><td class="user-email">' + u.email + '</td><td><strong>' + u.walletCount + '</strong></td>' +
      '<td><span class="badge-sm badge-' + (u.plan === 'enterprise' ? 'admin' : u.plan === 'pro' ? 'active' : 'none') + '">' + u.plan + '</span></td>' +
      '<td>' + statusBadge(u.status) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No users yet</td></tr>';

    // Cohort retention
    document.getElementById('cohortBody').innerHTML = data.cohorts.map(c => {
      const rate = c.signups > 0 ? Math.round(c.stillActive / c.signups * 100) : 0;
      const barColor = rate > 60 ? 'var(--green)' : rate > 30 ? 'var(--yellow)' : 'var(--red)';
      return '<tr><td style="font-weight:600">' + c.cohort + '</td><td>' + c.signups + '</td><td>' + c.stillActive + '</td>' +
        '<td><span style="color:' + barColor + ';font-weight:700">' + rate + '%</span></td>' +
        '<td><div style="width:100%;background:var(--bg);border-radius:4px;height:16px;overflow:hidden"><div style="width:' + rate + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width .5s"></div></div></td></tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No cohort data yet</td></tr>';

    // Activity feed
    renderActivityFeed(document.getElementById('activityFeed'), data.recentEvents);

  } catch (err) {
    toast('Analytics error: ' + err.message, 'error');
  }
}

// Load analytics when tab is clicked
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'analytics') loadAnalytics();
  });
});

// Init
loadAdminData();
</script>

</body>
</html>`;
}
