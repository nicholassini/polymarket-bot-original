/**
 * Marketing landing page — served at `/`.
 * Light-mode, ClickFunnel-style persuasive design.
 */
export function getLandingHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PolyMarket Bot — Your 24/7 Automated Prediction Market Edge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{
  --white:#ffffff;--bg:#f8f9fc;--surface:#ffffff;--surface2:#f1f3f9;
  --border:#e5e7ed;--text:#1a1d26;--body:#4a5068;--muted:#7c8299;
  --accent:#4f46e5;--accent-light:#6366f1;--accent-bg:rgba(79,70,229,.06);
  --green:#059669;--green-bg:rgba(5,150,105,.08);
  --orange:#ea580c;--orange-bg:rgba(234,88,12,.08);
  --red:#dc2626;--red-bg:rgba(220,38,38,.06);
  --gold:#d97706;--gold-bg:rgba(217,119,6,.08);
  --radius:16px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--white);color:var(--text);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}

/* ═══ NAV ═══ */
.nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;padding:16px 48px;max-width:1200px;margin:0 auto}
.logo{font-size:22px;font-weight:900;letter-spacing:-.5px;color:var(--text)}
.logo span{color:var(--accent)}
.nav-right{display:flex;align-items:center;gap:24px}
.nav-right a{text-decoration:none;font-size:14px;font-weight:600;transition:all .2s}
.nav-link{color:var(--muted)}
.nav-link:hover{color:var(--text)}
.nav-cta{background:var(--accent);color:#fff;padding:10px 24px;border-radius:10px}
.nav-cta:hover{background:var(--accent-light);transform:translateY(-1px)}
@media(max-width:640px){.nav-inner{padding:14px 20px}.nav-right{gap:12px}}

/* ═══ HERO ═══ */
.hero{position:relative;text-align:center;padding:100px 24px 80px;overflow:hidden}
.hero::before{content:'';position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:900px;height:900px;background:radial-gradient(circle,rgba(79,70,229,.08) 0%,transparent 70%);pointer-events:none;z-index:0}
.hero>*{position:relative;z-index:1}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:var(--accent-bg);border:1px solid rgba(79,70,229,.15);color:var(--accent);font-size:13px;font-weight:700;padding:8px 18px;border-radius:50px;margin-bottom:28px;letter-spacing:.3px}
.hero-badge .pulse{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.hero h1{font-size:60px;font-weight:900;line-height:1.08;letter-spacing:-2px;margin-bottom:24px;max-width:780px;margin-left:auto;margin-right:auto}
.hero h1 .hl{background:linear-gradient(135deg,var(--accent),#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{font-size:20px;color:var(--body);line-height:1.7;max-width:560px;margin:0 auto 40px}
.hero-cta-row{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-bottom:20px}
.cta-btn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font-weight:700;padding:18px 40px;border-radius:14px;font-size:17px;transition:all .25s;border:none;cursor:pointer}
.cta-primary{background:var(--accent);color:#fff;box-shadow:0 4px 24px rgba(79,70,229,.35)}
.cta-primary:hover{background:var(--accent-light);transform:translateY(-2px);box-shadow:0 8px 32px rgba(79,70,229,.4)}
.cta-secondary{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
.cta-secondary:hover{border-color:var(--accent);color:var(--accent)}
.hero-note{font-size:13px;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
.hero-note span{display:inline-flex;align-items:center;gap:4px}
.hero-note .check{color:var(--green);font-weight:700}
@media(max-width:768px){.hero h1{font-size:36px;letter-spacing:-1px}.hero{padding:70px 20px 50px}}

/* ═══ SOCIAL PROOF BAR ═══ */
.proof-bar{background:var(--bg);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:32px 24px}
.proof-inner{display:flex;justify-content:center;gap:56px;flex-wrap:wrap;max-width:900px;margin:0 auto}
.proof-item{text-align:center}
.proof-item .num{font-size:36px;font-weight:900;color:var(--text)}
.proof-item .lbl{font-size:13px;color:var(--muted);margin-top:2px;font-weight:500}

/* ═══ PROBLEM / AGITATE ═══ */
.problem{max-width:800px;margin:0 auto;padding:80px 24px;text-align:center}
.section-label{display:inline-block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);margin-bottom:16px;padding:6px 14px;background:var(--accent-bg);border-radius:8px}
.problem h2{font-size:38px;font-weight:900;line-height:1.15;letter-spacing:-1px;margin-bottom:20px}
.problem p{font-size:18px;color:var(--body);line-height:1.8;max-width:640px;margin:0 auto}
.pain-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:640px;margin:36px auto 0;text-align:left}
.pain-item{display:flex;gap:12px;align-items:flex-start;padding:16px 20px;background:var(--red-bg);border-radius:12px;border:1px solid rgba(220,38,38,.1)}
.pain-item .x{color:var(--red);font-weight:800;font-size:16px;flex-shrink:0;margin-top:1px}
.pain-item p{font-size:14px;color:var(--body);line-height:1.5;margin:0}
@media(max-width:640px){.pain-grid{grid-template-columns:1fr}}

/* ═══ HOW IT WORKS ═══ */
.how-works{background:var(--bg);padding:80px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.how-inner{max-width:960px;margin:0 auto;text-align:center}
.how-inner h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:56px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}
.step{position:relative;text-align:center;padding:0 12px}
.step-num{width:56px;height:56px;border-radius:50%;background:var(--accent);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 4px 16px rgba(79,70,229,.3)}
.step h3{font-size:18px;font-weight:800;margin-bottom:8px}
.step p{font-size:14px;color:var(--body);line-height:1.6}
@media(max-width:768px){.steps{grid-template-columns:1fr;max-width:400px;margin:0 auto}}

/* ═══ FEATURES ═══ */
.features{max-width:1100px;margin:0 auto;padding:80px 24px}
.features-head{text-align:center;margin-bottom:56px}
.features-head h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.features-head p{font-size:17px;color:var(--body)}
.f-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.f-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px;transition:all .3s}
.f-card:hover{border-color:var(--accent);box-shadow:0 8px 32px rgba(79,70,229,.08);transform:translateY(-4px)}
.f-icon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:18px}
.f-icon-purple{background:var(--accent-bg)}
.f-icon-green{background:var(--green-bg)}
.f-icon-orange{background:var(--orange-bg)}
.f-icon-gold{background:var(--gold-bg)}
.f-card h3{font-size:17px;font-weight:800;margin-bottom:8px}
.f-card p{font-size:14px;color:var(--body);line-height:1.7}
@media(max-width:768px){.f-grid{grid-template-columns:1fr}}

/* ═══ STRATEGIES ═══ */
.strategies{background:var(--bg);padding:80px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.strat-inner{max-width:1100px;margin:0 auto}
.strat-head{text-align:center;margin-bottom:56px}
.strat-head h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.strat-head p{font-size:17px;color:var(--body)}
.strat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.s-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 24px;text-align:center;transition:all .3s}
.s-card:hover{border-color:var(--accent);box-shadow:0 4px 20px rgba(79,70,229,.06);transform:translateY(-3px)}
.s-emoji{font-size:32px;margin-bottom:12px}
.s-card h4{font-size:15px;font-weight:800;margin-bottom:6px}
.s-tag{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;padding:4px 12px;border-radius:20px;margin-bottom:10px}
.tag-low{background:var(--green-bg);color:var(--green)}
.tag-med{background:var(--gold-bg);color:var(--gold)}
.tag-high{background:var(--orange-bg);color:var(--orange)}
.tag-custom{background:var(--accent-bg);color:var(--accent)}
.s-card p{font-size:13px;color:var(--muted);line-height:1.5}
@media(max-width:960px){.strat-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:480px){.strat-grid{grid-template-columns:1fr}}

/* ═══ TESTIMONIALS ═══ */
.testimonials{max-width:1000px;margin:0 auto;padding:80px 24px}
.testimonials-head{text-align:center;margin-bottom:56px}
.testimonials-head h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.testimonials-head p{font-size:17px;color:var(--body)}
.t-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.t-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;position:relative}
.t-stars{color:var(--gold);font-size:14px;letter-spacing:2px;margin-bottom:14px}
.t-card blockquote{font-size:14px;color:var(--body);line-height:1.7;font-style:italic;margin-bottom:18px}
.t-author{display:flex;align-items:center;gap:12px}
.t-avatar{width:40px;height:40px;border-radius:50%;background:var(--accent-bg);display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:800;font-size:15px}
.t-meta .t-name{font-size:14px;font-weight:700}
.t-meta .t-role{font-size:12px;color:var(--muted)}
@media(max-width:768px){.t-grid{grid-template-columns:1fr}}

/* ═══ PRICING ═══ */
.pricing{padding:80px 24px;text-align:center}
.pricing-head{margin-bottom:56px}
.pricing-head h2{font-size:42px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.pricing-head p{font-size:17px;color:var(--body)}
.price-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;max-width:1100px;margin:0 auto;align-items:start}
@media(max-width:960px){.price-row{grid-template-columns:1fr;max-width:440px}}
.price-card{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:40px 36px;text-align:center;position:relative;transition:all .3s}
.price-card:hover{box-shadow:0 12px 40px rgba(0,0,0,.06)}
.price-card.featured{border:2px solid var(--accent);box-shadow:0 20px 60px rgba(79,70,229,.12)}
.price-popular{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:12px;font-weight:800;padding:6px 24px;border-radius:50px;letter-spacing:.5px}
.price-name{font-size:20px;font-weight:800;margin-top:12px;margin-bottom:4px}
.price-desc{font-size:14px;color:var(--muted);margin-bottom:24px}
.price-amount{font-size:56px;font-weight:900;line-height:1;letter-spacing:-3px}
.price-amount sup{font-size:24px;font-weight:700;vertical-align:top;margin-top:6px;display:inline-block}
.price-amount .cents{font-size:24px;font-weight:700;vertical-align:top;margin-top:6px;display:inline-block}
.price-free-tag{font-size:56px;font-weight:900;line-height:1;color:var(--green)}
.price-period{font-size:15px;color:var(--muted);margin:8px 0 28px}
.price-list{text-align:left;list-style:none;margin-bottom:32px}
.price-list li{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:14px;color:var(--text);border-bottom:1px solid var(--border)}
.price-list li:last-child{border-bottom:none}
.price-list .checkmark{color:var(--green);font-weight:800;font-size:16px;flex-shrink:0}
.price-list .xmark{color:var(--muted);font-weight:800;font-size:16px;flex-shrink:0}
.price-list .disabled{color:var(--muted)}
.price-btn{display:block;width:100%;text-decoration:none;font-size:16px;font-weight:800;padding:16px;border-radius:14px;transition:all .25s}
.price-btn-primary{background:var(--accent);color:#fff;box-shadow:0 4px 20px rgba(79,70,229,.3)}
.price-btn-primary:hover{background:var(--accent-light);transform:translateY(-2px);box-shadow:0 8px 32px rgba(79,70,229,.4)}
.price-btn-outline{background:var(--surface);color:var(--text);border:2px solid var(--border)}
.price-btn-outline:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}
.price-guarantee{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;font-size:13px;color:var(--muted)}
.price-guarantee .shield{font-size:16px}
.price-vs{font-size:13px;color:var(--muted);margin-top:12px}

/* ═══ FAQ ═══ */
.faq{background:var(--bg);padding:80px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.faq-inner{max-width:720px;margin:0 auto}
.faq-head{text-align:center;margin-bottom:48px}
.faq-head h2{font-size:36px;font-weight:900;letter-spacing:-1px}
.faq-item{border-bottom:1px solid var(--border);padding:20px 0}
.faq-item:first-child{border-top:1px solid var(--border)}
.faq-q{display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:16px}
.faq-q h4{font-size:16px;font-weight:700}
.faq-q .arrow{font-size:18px;color:var(--muted);transition:transform .3s;flex-shrink:0}
.faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease;padding-right:32px}
.faq-a p{font-size:14px;color:var(--body);line-height:1.7;padding:12px 0}
.faq-item.open .faq-a{max-height:300px}
.faq-item.open .arrow{transform:rotate(180deg)}

/* ═══ FINAL CTA ═══ */
.final-cta{text-align:center;padding:100px 24px;position:relative;overflow:hidden}
.final-cta::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,var(--accent) 0%,#7c3aed 100%);z-index:0}
.final-cta>*{position:relative;z-index:1}
.final-cta h2{font-size:42px;font-weight:900;color:#fff;letter-spacing:-1px;margin-bottom:16px}
.final-cta p{font-size:18px;color:rgba(255,255,255,.8);margin-bottom:40px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.7}
.final-cta .cta-btn{background:#fff;color:var(--accent);font-size:18px;padding:20px 52px;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.final-cta .cta-btn:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.3)}
.final-note{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:24px;flex-wrap:wrap}
.final-note span{font-size:13px;color:rgba(255,255,255,.7);display:inline-flex;align-items:center;gap:4px}

/* ═══ FOOTER ═══ */
footer{padding:40px 24px;text-align:center;border-top:1px solid var(--border)}
.footer-inner{max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.footer-left{font-size:13px;color:var(--muted)}
.footer-links a{text-decoration:none;font-size:13px;color:var(--muted);margin-left:24px;transition:color .2s}
.footer-links a:hover{color:var(--text)}
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav">
  <div class="nav-inner">
    <div class="logo">Poly<span>Market</span> Bot</div>
    <div class="nav-right">
      <a href="#how" class="nav-link">How It Works</a>
      <a href="#strategies" class="nav-link">Strategies</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <a href="/login" class="nav-link">Sign In</a>
      <a href="/checkout" class="nav-cta">Get Started</a>
    </div>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-badge"><span class="pulse"></span> Trading live on Polymarket right now</div>
  <h1>Stop Watching Markets.<br>Start <span class="hl">Profiting</span> From Them.</h1>
  <p class="hero-sub">8 proven trading strategies working for you around the clock. Set up in 2 minutes. No coding required.</p>
  <div class="hero-cta-row">
    <a href="/checkout?plan=pro" class="cta-btn cta-primary">Go Pro \u2014 $99/mo \u2192</a>
    <a href="/login" class="cta-btn cta-secondary" onclick="localStorage.setItem('authTab','signup')">Start Free \u2192</a>
  </div>
  <div class="hero-note">
    <span><span class="check">\u2713</span> Free plan available</span>
    <span><span class="check">\u2713</span> No credit card required</span>
    <span><span class="check">\u2713</span> Paper trade free forever</span>
  </div>
</section>

<!-- SOCIAL PROOF BAR -->
<div class="proof-bar">
  <div class="proof-inner">
    <div class="proof-item"><div class="num">8</div><div class="lbl">Trading Strategies</div></div>
    <div class="proof-item"><div class="num">24/7</div><div class="lbl">Fully Automated</div></div>
    <div class="proof-item"><div class="num">&lt;1s</div><div class="lbl">Execution Speed</div></div>
    <div class="proof-item"><div class="num">\u221E</div><div class="lbl">Unlimited Wallets</div></div>
  </div>
</div>

<!-- PROBLEM -->
<section class="problem">
  <div class="section-label">The Problem</div>
  <h2>Manual Trading Is Killing Your Returns</h2>
  <p>You know there\u2019s money in prediction markets. But between the time, the stress, and the missed opportunities\u2026 most traders leave profits on the table.</p>
  <div class="pain-grid">
    <div class="pain-item"><span class="x">\u2717</span><p>Missing trades while you sleep, eat, or work</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>Emotional decisions wiping out your gains</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>Hours spent scanning markets for opportunities</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>No risk controls when things move fast</p></div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="how-works" id="how">
  <div class="how-inner">
    <div class="section-label">How It Works</div>
    <h2>Up and Running in 3 Simple Steps</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Pick Your Strategy</h3>
        <p>Choose from 8 battle-tested strategies \u2014 from low-risk arbitrage to AI-powered forecasting. Mix and match across multiple wallets.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Set Your Limits</h3>
        <p>Define your risk tolerance, capital allocation, and stop-loss rules. The dashboard makes it dead simple with one-click controls.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Let It Run 24/7</h3>
        <p>The bot trades around the clock while you watch from the real-time dashboard. Paper trade first, go live when you\u2019re confident.</p>
      </div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="features">
  <div class="features-head">
    <div class="section-label">Features</div>
    <h2>Built for Serious Traders</h2>
    <p>Professional-grade tools. Zero infrastructure to manage.</p>
  </div>
  <div class="f-grid">
    <div class="f-card">
      <div class="f-icon f-icon-purple">\ud83d\udcca</div>
      <h3>Real-Time Dashboard</h3>
      <p>Live P&L, open positions, and every trade streamed instantly. One screen to rule them all.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-green">\ud83d\udee1\ufe0f</div>
      <h3>Bulletproof Risk Controls</h3>
      <p>Stop losses, max drawdown limits, position caps, and a global kill switch. Sleep easy.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-orange">\ud83d\udc0b</div>
      <h3>Whale Intelligence</h3>
      <p>Automatically track the biggest wallets, score them by performance, and optionally mirror their moves.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-gold">\u26a1</div>
      <h3>Paper &amp; Live Modes</h3>
      <p>Test any strategy risk-free with paper trading. One toggle to go live when you\u2019re ready.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-purple">\ud83d\udd27</div>
      <h3>Fully Configurable</h3>
      <p>Tune every parameter from the dashboard \u2014 spreads, thresholds, capital allocation, all of it.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-green">\ud83d\udd12</div>
      <h3>Your Keys, Your Funds</h3>
      <p>Self-custody only. We never touch your Polymarket account or hold your keys.</p>
    </div>
  </div>
</section>

<!-- STRATEGIES -->
<section class="strategies" id="strategies">
  <div class="strat-inner">
    <div class="strat-head">
      <div class="section-label">Strategies</div>
      <h2>8 Ways to Win</h2>
      <p>From low-risk arbitrage to high-alpha AI \u2014 pick what fits your style.</p>
    </div>
    <div class="strat-grid">
      <div class="s-card">
        <div class="s-emoji">\ud83d\udd00</div>
        <h4>Cross-Market Arbitrage</h4>
        <span class="s-tag tag-low">Low-Med Risk</span>
        <p>Spots pricing gaps between related markets for near-risk-free profit.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83c\udfaf</div>
        <h4>Mispricing Detector</h4>
        <span class="s-tag tag-low">Low Risk</span>
        <p>Catches probability errors where outcomes don\u2019t sum to 100%.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83d\udcc8</div>
        <h4>High-Prob Convergence</h4>
        <span class="s-tag tag-low">Low-Med Risk</span>
        <p>7 cascading filters to enter high-probability trades at the right moment.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83e\udde0</div>
        <h4>AI Research Forecast</h4>
        <span class="s-tag tag-med">Med-High Risk</span>
        <p>AI estimates true probability from web research, trades the divergence.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\u2696\ufe0f</div>
        <h4>Market Making</h4>
        <span class="s-tag tag-med">Medium Risk</span>
        <p>Places bid/ask around fair value to capture spread on every fill.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83d\ude80</div>
        <h4>Momentum</h4>
        <span class="s-tag tag-high">High Risk</span>
        <p>Rides big event-driven moves with trailing stops and momentum scoring.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83d\udc0b</div>
        <h4>Whale Copy Trading</h4>
        <span class="s-tag tag-med">Medium Risk</span>
        <p>Mirrors top-performing whale wallets with full risk management.</p>
      </div>
      <div class="s-card">
        <div class="s-emoji">\ud83d\udee0\ufe0f</div>
        <h4>Custom Strategy</h4>
        <span class="s-tag tag-custom">You Decide</span>
        <p>Blank framework \u2014 implement your own logic with full platform hooks.</p>
      </div>
    </div>
  </div>
</section>

<!-- TESTIMONIALS -->
<section class="testimonials">
  <div class="testimonials-head">
    <div class="section-label">What Traders Say</div>
    <h2>Trusted by Traders Who Take It Seriously</h2>
    <p>Real results from real users.</p>
  </div>
  <div class="t-grid">
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cI was spending 3 hours a day watching markets. Now I check the dashboard for 5 minutes. My returns are actually better because the bot doesn\u2019t panic sell.\u201d</blockquote>
      <div class="t-author">
        <div class="t-avatar">M</div>
        <div class="t-meta"><div class="t-name">Marcus R.</div><div class="t-role">Full-time trader</div></div>
      </div>
    </div>
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cThe arbitrage strategies alone paid for a year of subscription in the first month. The whale tracking is like having insider intel on autopilot.\u201d</blockquote>
      <div class="t-author">
        <div class="t-avatar">S</div>
        <div class="t-meta"><div class="t-name">Sarah K.</div><div class="t-role">Crypto investor</div></div>
      </div>
    </div>
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cBeing able to paper trade first gave me the confidence to go live. The risk controls are seriously impressive \u2014 better than platforms charging 10x more.\u201d</blockquote>
      <div class="t-author">
        <div class="t-avatar">J</div>
        <div class="t-meta"><div class="t-name">James T.</div><div class="t-role">Part-time trader</div></div>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing" id="pricing">
  <div class="pricing-head">
    <div class="section-label">Pricing</div>
    <h2>Start Free. Upgrade When You\u2019re Ready.</h2>
    <p>No credit card required to start. Upgrade anytime to unlock live trading.</p>
  </div>
  <div class="price-row">
    <!-- FREE -->
    <div class="price-card">
      <div class="price-name">Free</div>
      <div class="price-desc">Perfect for learning &amp; testing</div>
      <div class="price-free-tag">$0</div>
      <div class="price-period">free forever</div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 trading strategies</li>
        <li><span class="checkmark">\u2713</span> Up to <strong>5 paper bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time dashboard</li>
        <li><span class="checkmark">\u2713</span> Full risk management</li>
        <li><span class="checkmark">\u2713</span> Whale tracking</li>
        <li><span class="xmark">\u2717</span> <span class="disabled">Live trading with real funds</span></li>
        <li><span class="xmark">\u2717</span> <span class="disabled">Priority support</span></li>
      </ul>
      <a href="/login" class="price-btn price-btn-outline" onclick="localStorage.setItem('authTab','signup')">Start Free \u2192</a>
      <div class="price-vs">No credit card required</div>
    </div>
    <!-- PRO -->
    <div class="price-card featured">
      <div class="price-popular">MOST POPULAR</div>
      <div class="price-name">Pro Trader</div>
      <div class="price-desc">Full access \u2014 trade with real money</div>
      <div class="price-amount"><sup>$</sup>99<span class="cents"></span></div>
      <div class="price-period">per month \u2022 cancel anytime</div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 trading strategies</li>
        <li><span class="checkmark">\u2713</span> Up to <strong>10 bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time dashboard &amp; analytics</li>
        <li><span class="checkmark">\u2713</span> Full risk management suite</li>
        <li><span class="checkmark">\u2713</span> Whale tracking &amp; copy trading</li>
        <li><span class="checkmark">\u2713</span> <strong>Live trading with real funds</strong></li>
        <li><span class="checkmark">\u2713</span> <strong>Priority support</strong></li>
      </ul>
      <a href="/checkout?plan=pro" class="price-btn price-btn-primary">Get Started Now \u2192</a>
      <div class="price-guarantee"><span class="shield">\ud83d\udee1\ufe0f</span> 30-day money-back guarantee</div>
    </div>
    <!-- ENTERPRISE -->
    <div class="price-card">
      <div class="price-name">Enterprise</div>
      <div class="price-desc">Unlimited bots \u2014 maximum power</div>
      <div class="price-amount"><sup>$</sup>199<span class="cents"></span></div>
      <div class="price-period">per month \u2022 cancel anytime</div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 trading strategies</li>
        <li><span class="checkmark">\u2713</span> <strong>Unlimited bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time dashboard &amp; analytics</li>
        <li><span class="checkmark">\u2713</span> Full risk management suite</li>
        <li><span class="checkmark">\u2713</span> Whale tracking &amp; copy trading</li>
        <li><span class="checkmark">\u2713</span> <strong>Live trading with real funds</strong></li>
        <li><span class="checkmark">\u2713</span> <strong>Priority support</strong></li>
      </ul>
      <a href="/checkout?plan=enterprise" class="price-btn price-btn-primary" style="background:var(--purple)">Go Unlimited \u2192</a>
      <div class="price-guarantee"><span class="shield">\ud83d\udee1\ufe0f</span> 30-day money-back guarantee</div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq">
  <div class="faq-inner">
    <div class="faq-head">
      <div class="section-label">FAQ</div>
      <h2>Got Questions?</h2>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Do I need coding experience?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>Not at all. Everything is controlled from a visual dashboard. Pick a strategy, set your parameters with sliders and inputs, and hit start. If you want to build a custom strategy, you can \u2014 but it\u2019s completely optional.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Is my money safe? Do you hold my keys?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>We never custody your funds or hold your private keys. You connect your own Polymarket API key. The bot places trades on your behalf, but your funds stay in your wallet at all times.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Can I try it without risking real money?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>Yes! Every strategy can run in paper trading mode with simulated funds. Test to your heart\u2019s content, then switch to live trading with one click when you\u2019re confident.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>What if I\u2019m not happy? Can I get a refund?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>Absolutely. We offer a full 30-day money-back guarantee. If PolyMarket Bot isn\u2019t for you, email us and we\u2019ll refund every penny, no questions asked.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>How many strategies can I run at once?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>It depends on your plan. Free users can run up to 5 paper bots. Pro ($99/mo) supports up to 10 bots with live trading. Enterprise ($199/mo) gives you unlimited bots. Each bot runs its own strategy with independent capital and risk settings.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Can I cancel anytime?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>Yes, cancel anytime from your billing dashboard. No contracts, no commitments, no cancellation fees. Your access continues until the end of your current billing period.</p></div>
    </div>
  </div>
</section>

<!-- FINAL CTA -->
<section class="final-cta">
  <h2>Your Market Edge Starts Now</h2>
  <p>Start paper trading for free today, or upgrade to Pro or Enterprise and trade with real money. The bot works while you don\u2019t.</p>
  <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
    <a href="/checkout?plan=pro" class="cta-btn" style="background:#fff;color:var(--accent);font-size:18px;padding:20px 44px;box-shadow:0 8px 32px rgba(0,0,0,.2)">Go Pro \u2014 $99/mo \u2192</a>
    <a href="/login" class="cta-btn" style="background:transparent;color:#fff;font-size:18px;padding:20px 44px;border:2px solid rgba(255,255,255,.3)" onclick="localStorage.setItem('authTab','signup')">Start Free \u2192</a>
  </div>
  <div class="final-note">
    <span>\u2713 Free forever plan</span>
    <span>\u2713 No credit card needed</span>
    <span>\u2713 Upgrade anytime</span>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-inner">
    <div class="footer-left">&copy; 2026 PolyMarket Bot. All rights reserved.</div>
    <div class="footer-links">
      <a href="/login">Sign In</a>
      <a href="/checkout">Get Started</a>
    </div>
  </div>
</footer>

</body>
</html>`;
}
