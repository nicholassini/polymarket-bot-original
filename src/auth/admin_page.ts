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
            <label>IPN Secret</label>
            <input type="password" id="npIpnSecret" placeholder="your-ipn-secret" autocomplete="off">
            <div class="hint">IPN callback secret for verifying payment notifications</div>
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
        <li>Copy the <strong>IPN Secret</strong> from the IPN settings page</li>
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
              <th>Subscription</th>
              <th>Stripe Customer</th>
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
      document.getElementById('npIpnSecret').value = data.nowPayments.ipnSecret;
      document.getElementById('npPriceUsd').value = data.nowPayments.priceUsd;
    }
    const npAlertEl = document.getElementById('npAlert');
    if (!data.system.nowPaymentsConfigured) {
      npAlertEl.innerHTML = '<div class="alert alert-warn">NOWPayments is not configured.</div>';
    } else {
      npAlertEl.innerHTML = '<div class="alert alert-info">NOWPayments is connected and active.</div>';
    }

    // Env table (editable)
    const secretKeys = new Set(['POLYMARKET_API_KEY','JWT_SECRET','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','LEMONSQUEEZY_API_KEY','LEMONSQUEEZY_WEBHOOK_SECRET','NOWPAYMENTS_API_KEY','NOWPAYMENTS_IPN_SECRET']);
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
function renderUsersTable(users) {
  const body = document.getElementById('usersTableBody');
  body.innerHTML = users.map(u =>
    '<tr>' +
    '<td class="user-email">' + u.email + '</td>' +
    '<td>' + (u.isAdmin ? '<span class="badge-sm badge-admin">Admin</span>' : '<span class="badge-sm badge-none">User</span>') + '</td>' +
    '<td>' + statusBadge(u.subscriptionStatus) + '</td>' +
    '<td style="font-family:monospace;font-size:11px;color:var(--muted)">' + (u.stripeCustomerId || '—') + '</td>' +
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
        ipnSecret: document.getElementById('npIpnSecret').value.trim(),
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

// Init
loadAdminData();
</script>

</body>
</html>`;
}
