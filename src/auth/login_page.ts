/**
 * Login / Signup page — inline SPA, same pattern as getDashboardHtml().
 * After successful auth, sets a cookie and redirects to /dashboard.
 */
export function getLoginHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polymarket Bot — Sign In</title>
<meta name="description" content="Sign in or create your free PolyMarket Bot account. Automate Polymarket trading with proven strategies — no credit card required.">
<link rel="canonical" href="https://polytradingbot.xyz/login">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="PolyMarket Bot">
<meta property="og:title" content="Polymarket Bot — Sign In">
<meta property="og:description" content="Sign in or create your free PolyMarket Bot account. Automate Polymarket trading with proven strategies.">
<meta property="og:url" content="https://polytradingbot.xyz/login">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Polymarket Bot — Sign In">
<meta name="twitter:description" content="Sign in or create your free PolyMarket Bot account.">
<style>
:root {
  --bg:       #0b0e11;
  --surface:  #151a21;
  --surface2: #1c2330;
  --border:   #1e2630;
  --text:     #e4e8ed;
  --muted:    #8892a0;
  --accent:   #4f8ff7;
  --green:    #00d68f;
  --red:      #ff4d6a;
  --radius:   12px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{width:100%;max-width:420px;padding:20px}
.logo{text-align:center;font-size:24px;font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
.logo span{color:var(--accent)}
.subtitle{text-align:center;color:var(--muted);font-size:14px;margin-bottom:32px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px}
.card h2{font-size:20px;font-weight:700;margin-bottom:24px;text-align:center}
.tab-row{display:flex;margin-bottom:24px;border-bottom:1px solid var(--border)}
.tab-btn{flex:1;background:transparent;border:none;color:var(--muted);padding:12px;font-size:14px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
.tab-btn:hover{color:var(--text)}
.tab-btn.active{color:var(--accent);border-bottom-color:var(--accent)}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:6px}
.form-group input{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text);font-size:14px;outline:none;transition:border-color .2s}
.form-group input:focus{border-color:var(--accent)}
.btn{width:100%;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;margin-top:8px}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{opacity:.9}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.error-msg{color:var(--red);font-size:13px;margin-top:12px;text-align:center;min-height:20px}
.success-msg{color:var(--green);font-size:13px;margin-top:12px;text-align:center;min-height:20px}
.pricing{text-align:center;margin-top:24px;color:var(--muted);font-size:13px;line-height:1.6}
.pricing strong{color:var(--text)}
.form-pane{display:none}
.form-pane.active{display:block}
</style>
</head>
<body>
<div class="container">
  <div class="logo">Poly<span>Market</span> Bot</div>
  <div class="subtitle">Automated prediction market trading</div>
  <div class="card">
    <div class="tab-row">
      <button class="tab-btn active" onclick="switchTab('login')">Sign In</button>
      <button class="tab-btn" onclick="switchTab('signup')">Sign Up</button>
    </div>

    <!-- Login form -->
    <div id="pane-login" class="form-pane active">
      <form onsubmit="handleLogin(event)">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="login-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="login-password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
        <div class="error-msg" id="login-error"></div>
      </form>
    </div>

    <!-- Signup form -->
    <div id="pane-signup" class="form-pane">
      <form onsubmit="handleSignup(event)">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="signup-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="signup-password" required minlength="8" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>Confirm Password</label>
          <input type="password" id="signup-confirm" required minlength="8" autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn-primary" id="signup-btn">Create Account</button>
        <div class="error-msg" id="signup-error"></div>
        <div class="success-msg" id="signup-success"></div>
      </form>
    </div>
  </div>

  <div class="pricing">
    Start trading with automated strategies.<br>
    <strong>Monthly subscription</strong> — cancel anytime.
  </div>
</div>

<script>
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.form-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-' + tab).classList.add('active');
  event.target.classList.add('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed';
      return;
    }
    // Token is set as httpOnly cookie by the server
    window.location.href = '/dashboard';
  } catch (err) {
    errEl.textContent = 'Network error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  const successEl = document.getElementById('signup-success');
  const btn = document.getElementById('signup-btn');
  errEl.textContent = '';
  successEl.textContent = '';

  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('signup-email').value,
        password,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Signup failed';
      return;
    }

    // If Stripe checkout URL is returned, redirect to payment
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }

    // Otherwise, token is set as cookie — go to dashboard
    window.location.href = '/dashboard';
  } catch (err) {
    errEl.textContent = 'Network error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}
</script>
</body>
</html>`;
}
