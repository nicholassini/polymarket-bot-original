/**
 * Checkout page — served at `/checkout`.
 * Collects account info and processes payment via the signup + Stripe flow.
 */
export function getCheckoutHtml(providers?: { stripe?: boolean; lemonSqueezy?: boolean; nowPayments?: boolean; userEmail?: string }): string {
  const p = providers ?? {};
  const stripeOn = !!p.stripe;
  const lsOn = !!p.lemonSqueezy;
  const npOn = !!p.nowPayments;
  const firstProvider = stripeOn ? 'stripe' : lsOn ? 'lemonsqueezy' : npOn ? 'nowpayments' : '';
  const loggedIn = !!p.userEmail;
  const userEmail = p.userEmail || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Checkout — Polymarket Bot</title>
<meta name="description" content="Choose your PolyMarket Bot plan — Free, Pro ($69/mo FLASH SALE), or Enterprise ($199/mo). Automate prediction market trading with 8+ strategies.">
<link rel="canonical" href="https://polytradingbot.xyz/checkout">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="PolyMarket Bot">
<meta property="og:title" content="Checkout — Polymarket Bot">
<meta property="og:description" content="Choose your PolyMarket Bot plan — Free, Pro, or Enterprise. Start automating Polymarket trading today.">
<meta property="og:url" content="https://polytradingbot.xyz/checkout">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Checkout — Polymarket Bot">
<meta name="twitter:description" content="Choose your PolyMarket Bot plan and start automating Polymarket trading.">
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
  --purple:   #a855f7;
  --radius:   12px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}

.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 48px;max-width:1200px;margin:0 auto;width:100%}
.nav .logo{font-size:20px;font-weight:800;letter-spacing:-.5px;text-decoration:none;color:var(--text)}
.nav .logo span{color:var(--accent)}
.nav-links{display:flex;gap:12px}
.nav-links a{text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:8px;transition:all .2s;color:var(--muted);border:1px solid var(--border)}
.nav-links a:hover{color:var(--text);border-color:var(--muted)}

.checkout-wrapper{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:60px 24px}
.checkout-container{display:grid;grid-template-columns:1fr 1fr;gap:48px;max-width:880px;width:100%}
@media(max-width:768px){.checkout-container{grid-template-columns:1fr;gap:32px}}

/* Order Summary */
.order-summary{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px}
.order-summary h2{font-size:20px;font-weight:700;margin-bottom:24px}
.plan-row{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--border)}
.plan-info h3{font-size:16px;font-weight:700}
.plan-info p{font-size:13px;color:var(--muted);margin-top:2px}
.plan-price{font-size:20px;font-weight:800;color:var(--accent)}
.summary-features{margin-top:20px}
.summary-features li{list-style:none;padding:6px 0;font-size:13px;color:var(--muted)}
.summary-features li::before{content:'\\2713 ';color:var(--green);font-weight:700}
.summary-total{margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.summary-total .label{font-size:14px;color:var(--muted)}
.summary-total .amount{font-size:24px;font-weight:900;color:var(--text)}
.summary-total .period{font-size:13px;color:var(--muted)}
.guarantee{margin-top:16px;font-size:12px;color:var(--muted);text-align:center}
.guarantee strong{color:var(--green)}

/* Checkout Form */
.checkout-form{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px}
.checkout-form h2{font-size:20px;font-weight:700;margin-bottom:24px}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
.form-group input{width:100%;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:15px;outline:none;transition:border-color .2s}
.form-group input:focus{border-color:var(--accent)}
.form-group input::placeholder{color:#4a5568}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.divider{height:1px;background:var(--border);margin:24px 0}
.divider-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px}
.submit-btn{width:100%;padding:16px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s;margin-top:8px}
.submit-btn:hover{opacity:.9;transform:translateY(-1px)}
.submit-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.error-msg{background:rgba(255,77,106,.1);border:1px solid var(--red);border-radius:8px;padding:12px 16px;font-size:13px;color:var(--red);margin-bottom:16px;display:none}
.secure-note{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;font-size:12px;color:var(--muted)}
.secure-note svg{width:14px;height:14px;fill:var(--muted)}

/* Payment method selector */
.payment-methods{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.pm-option{display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg);border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all .2s}
.pm-option:hover{border-color:var(--muted)}
.pm-option.selected{border-color:var(--accent);background:rgba(79,143,247,.06)}
.pm-option input[type="radio"]{display:none}
.pm-icon{font-size:24px;flex-shrink:0;width:36px;text-align:center}
.pm-label{display:flex;flex-direction:column}
.pm-label strong{font-size:14px;font-weight:700;color:var(--text)}
.pm-label span{font-size:12px;color:var(--muted)}

/* Plan toggle */
.plan-toggle{display:flex;gap:10px;margin-bottom:24px}
.plan-toggle-btn{flex:1;padding:16px;background:var(--bg);border:2px solid var(--border);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s}
.plan-toggle-btn:hover{border-color:var(--muted)}
.plan-toggle-btn.active{border-color:var(--accent);background:rgba(79,143,247,.08)}
.plan-toggle-btn.active-ent{border-color:var(--purple);background:rgba(168,85,247,.08)}
.plan-toggle-btn .plan-name{font-size:15px;font-weight:800;color:var(--text)}
.plan-toggle-btn .plan-price-tag{font-size:22px;font-weight:900;margin-top:4px}
.plan-toggle-btn .plan-detail{font-size:12px;color:var(--muted);margin-top:2px}
.plan-toggle-btn .plan-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
.badge-popular{background:rgba(79,143,247,.15);color:var(--accent)}
.badge-power{background:rgba(168,85,247,.15);color:var(--purple)}
.sale-tag{background:linear-gradient(135deg,#dc2626,#ea580c);color:#fff;font-size:10px;font-weight:900;padding:3px 8px;border-radius:5px;margin-left:6px;letter-spacing:.3px}
.sale-original{text-decoration:line-through;opacity:.5;font-size:16px;font-weight:500;margin-right:2px}
.flash-bar{background:linear-gradient(135deg,#dc2626 0%,#ea580c 50%,#dc2626 100%);background-size:200% 200%;animation:flashG 3s ease infinite;color:#fff;text-align:center;padding:12px 24px;font-size:14px;font-weight:700;letter-spacing:.3px}
@keyframes flashG{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

footer{text-align:center;padding:24px;color:var(--muted);font-size:12px;border-top:1px solid var(--border)}
</style>
</head>
<body>

<!-- Nav -->
<nav class="nav">
  <a href="/" class="logo">Poly<span>Market</span> Bot</a>
  <div class="nav-links">
    ${loggedIn ? `<a href="/dashboard">${userEmail}</a>` : `<a href="/login">Sign In</a>`}
  </div>
</nav>

<div class="checkout-wrapper">
  <div class="checkout-container">

    <!-- Order Summary -->
    <div class="order-summary">
      <h2>Choose Your Plan</h2>
      <div class="plan-toggle">
        <div class="plan-toggle-btn active" data-plan="pro" onclick="selectPlan('pro')">
          <div class="plan-badge badge-popular">\uD83D\uDD25 FLASH SALE</div>
          <div class="plan-name">Pro Trader</div>
          <div class="plan-price-tag" style="color:var(--accent)"><span class="sale-original">$99</span>$69<span style="font-size:13px;font-weight:400;color:var(--muted)">/mo</span> <span class="sale-tag">30% OFF</span></div>
          <div class="plan-detail">Up to 10 bots</div>
        </div>
        <div class="plan-toggle-btn" data-plan="enterprise" onclick="selectPlan('enterprise')">
          <div class="plan-badge badge-power">Max Power</div>
          <div class="plan-name">Enterprise</div>
          <div class="plan-price-tag" style="color:var(--purple)">$199<span style="font-size:13px;font-weight:400;color:var(--muted)">/mo</span></div>
          <div class="plan-detail">Unlimited bots</div>
        </div>
      </div>
      <div class="plan-row">
        <div class="plan-info">
          <h3 id="summaryPlanName">Pro Trader Plan</h3>
          <p>Monthly subscription</p>
        </div>
        <div class="plan-price" id="summaryPlanPrice">$69</div>
      </div>
      <ul class="summary-features" id="summaryFeatures">
        <li>All 8 trading strategies</li>
        <li id="featureBots">Up to 10 bots</li>
        <li>Real-time dashboard &amp; analytics</li>
        <li>Whale tracking &amp; copy trading</li>
        <li>Paper &amp; live trading modes</li>
        <li>Full risk management suite</li>
        <li>Priority support</li>
      </ul>
      <div class="summary-total">
        <div>
          <div class="label">Total due today</div>
          <div class="period">Billed monthly, cancel anytime</div>
        </div>
        <div class="amount" id="summaryTotal">$69</div>
      </div>
      <div class="guarantee"><strong>30-day money-back guarantee.</strong> Not satisfied? Get a full refund, no questions asked.</div>
    </div>

    <!-- Checkout Form -->
    <div class="checkout-form">
      <h2>${loggedIn ? 'Upgrade Your Account' : 'Create Your Account'}</h2>
      <div id="errorMsg" class="error-msg"></div>
      <form id="checkoutForm" autocomplete="on">
        ${loggedIn ? `<p style="color:var(--muted);font-size:14px;margin-bottom:16px">Signed in as <strong style="color:var(--text)">${userEmail}</strong></p>` : `<div class="form-group">
          <label>Email Address</label>
          <input type="email" id="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="password" placeholder="Min 8 characters" minlength="8" required autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>Confirm Password</label>
          <input type="password" id="confirmPassword" placeholder="Confirm your password" minlength="8" required autocomplete="new-password">
        </div>`}

        <div class="divider"></div>
        <p class="divider-label">Choose Payment Method</p>
        <div class="payment-methods">
          ${stripeOn ? `<label class="pm-option${firstProvider === 'stripe' ? ' selected' : ''}" data-provider="stripe">
            <input type="radio" name="provider" value="stripe"${firstProvider === 'stripe' ? ' checked' : ''}>
            <div class="pm-icon">💳</div>
            <div class="pm-label">
              <strong>Card (Stripe)</strong>
              <span>Visa, Mastercard, etc.</span>
            </div>
          </label>` : ''}
          ${lsOn ? `<label class="pm-option${firstProvider === 'lemonsqueezy' ? ' selected' : ''}" data-provider="lemonsqueezy">
            <input type="radio" name="provider" value="lemonsqueezy"${firstProvider === 'lemonsqueezy' ? ' checked' : ''}>
            <div class="pm-icon">🍋</div>
            <div class="pm-label">
              <strong>Lemon Squeezy</strong>
              <span>Card, PayPal, Apple Pay</span>
            </div>
          </label>` : ''}
          ${npOn ? `<label class="pm-option${firstProvider === 'nowpayments' ? ' selected' : ''}" data-provider="nowpayments">
            <input type="radio" name="provider" value="nowpayments"${firstProvider === 'nowpayments' ? ' checked' : ''}>
            <div class="pm-icon">₿</div>
            <div class="pm-label">
              <strong>Crypto</strong>
              <span>BTC, ETH, USDT & more</span>
            </div>
          </label>` : ''}
        </div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:18px;margin-top:14px" id="providerHint">
          After creating your account you'll be redirected to complete your payment securely.
        </p>

        <button type="submit" class="submit-btn" id="submitBtn">${loggedIn ? 'Upgrade' : 'Continue to Payment'} \u2014 $69/mo</button>
        <div class="secure-note">
          <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
          All payments processed securely via encrypted checkout
        </div>
        <div style="text-align:center;margin-top:18px">
          ${loggedIn ? `<a href="/dashboard" style="color:var(--muted);font-size:13px;text-decoration:underline">Back to dashboard</a>` : `<a href="/login" style="color:var(--muted);font-size:13px;text-decoration:underline" onclick="localStorage.setItem('authTab','signup')">Or start with a free account (paper trading only)</a>`}
        </div>
      </form>
    </div>

  </div>
</div>

<footer>&copy; 2026 PolyMarket Bot. All rights reserved.</footer>

<script>
const form = document.getElementById('checkoutForm');
const errorMsg = document.getElementById('errorMsg');
const submitBtn = document.getElementById('submitBtn');

const plans = {
  pro:        { name: 'Pro Trader Plan', price: 69, originalPrice: 99, bots: 'Up to 10 bots', color: 'var(--accent)' },
  enterprise: { name: 'Enterprise Plan',  price: 199, originalPrice: null, bots: 'Unlimited bots', color: 'var(--purple)' },
};
let selectedPlan = new URLSearchParams(location.search).get('plan') === 'enterprise' ? 'enterprise' : 'pro';

function selectPlan(plan) {
  selectedPlan = plan;
  const p = plans[plan];
  document.getElementById('summaryPlanName').textContent = p.name;
  document.getElementById('summaryPlanPrice').textContent = '$' + p.price;
  document.getElementById('summaryTotal').textContent = '$' + p.price;
  document.getElementById('featureBots').textContent = p.bots;
  submitBtn.textContent = '${loggedIn ? 'Upgrade' : 'Continue to Payment'} \u2014 $' + p.price + '/mo';
  document.querySelectorAll('.plan-toggle-btn').forEach(b => {
    b.classList.remove('active','active-ent');
    if (b.dataset.plan === plan) b.classList.add(plan === 'enterprise' ? 'active-ent' : 'active');
  });
}
selectPlan(selectedPlan);

// Payment method selection
document.querySelectorAll('.pm-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.pm-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    opt.querySelector('input').checked = true;
  });
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.style.display = 'none';

  const isLoggedIn = ${loggedIn};
  const provider = document.querySelector('input[name="provider"]:checked');
  const providerVal = provider ? provider.value : '';

  if (!isLoggedIn) {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      showError('Password must be at least 8 characters.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account\u2026';

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, plan: selectedPlan, provider: providerVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Something went wrong.');
        submitBtn.disabled = false;
        selectPlan(selectedPlan);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showError('Network error. Please try again.');
      submitBtn.disabled = false;
      selectPlan(selectedPlan);
    }
  } else {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirecting\u2026';

    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, provider: providerVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Something went wrong.');
        submitBtn.disabled = false;
        selectPlan(selectedPlan);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      showError('Network error. Please try again.');
      submitBtn.disabled = false;
      selectPlan(selectedPlan);
    }
  }
});
</script>

</body>
</html>`;
}
