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
<title>PolyMarket Bot — Build & Deploy Custom Polymarket Trading Bots</title>
<meta name="description" content="Build, test, and deploy your own custom Polymarket trading bots. 8 built-in strategies, visual bot builder, paper trading, and live execution. No coding required. Free plan available.">
<link rel="canonical" href="https://polytradingbot.xyz/">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="PolyMarket Bot">
<meta property="og:title" content="PolyMarket Bot — Build & Deploy Custom Polymarket Trading Bots">
<meta property="og:description" content="Create your own custom trading bots for Polymarket. 8 built-in strategies, visual bot configurator, paper trading, and 24/7 live execution. Start free.">
<meta property="og:url" content="https://polytradingbot.xyz/">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="PolyMarket Bot — Build & Deploy Custom Polymarket Trading Bots">
<meta name="twitter:description" content="Create your own custom trading bots for Polymarket. 8 built-in strategies, visual bot configurator, paper trading, and 24/7 live execution.">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "PolyMarket Bot",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "url": "https://polytradingbot.xyz/",
  "description": "Build, test, and deploy custom Polymarket trading bots. 8 built-in strategies, visual bot builder, paper trading, and 24/7 live execution.",
  "offers": [
    { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Pro", "price": "69", "priceCurrency": "USD", "billingIncrement": "P1M" },
    { "@type": "Offer", "name": "Enterprise", "price": "199", "priceCurrency": "USD", "billingIncrement": "P1M" }
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "How does PolyMarket Bot work?", "acceptedAnswer": { "@type": "Answer", "text": "Choose from 8 built-in strategies or build your own custom bot. Configure your parameters, test with paper trading, and deploy 24/7 with one click." } },
    { "@type": "Question", "name": "Do I need coding experience?", "acceptedAnswer": { "@type": "Answer", "text": "Not at all. Build and deploy custom bots entirely from a visual dashboard. No code required." } },
    { "@type": "Question", "name": "Is my money safe?", "acceptedAnswer": { "@type": "Answer", "text": "We never custody your funds or hold your private keys. Your funds stay in your wallet at all times." } },
    { "@type": "Question", "name": "Can I try it without risking real money?", "acceptedAnswer": { "@type": "Answer", "text": "Yes! Every strategy can run in paper trading mode with simulated funds." } },
    { "@type": "Question", "name": "What if I'm not happy?", "acceptedAnswer": { "@type": "Answer", "text": "We offer a full 30-day money-back guarantee, no questions asked." } },
    { "@type": "Question", "name": "How many strategies can I run at once?", "acceptedAnswer": { "@type": "Answer", "text": "Free users can run up to 5 paper bots. Pro supports up to 10 bots with live trading. Enterprise gives you unlimited bots." } },
    { "@type": "Question", "name": "Can I cancel anytime?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, cancel anytime from your billing dashboard. No contracts, no commitments, no cancellation fees." } }
  ]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="dns-prefetch" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"></noscript>
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

/* ═══ FLASH SALE BANNER ═══ */
.flash-banner{background:linear-gradient(135deg,#dc2626 0%,#ea580c 50%,#dc2626 100%);background-size:200% 200%;animation:flashGrad 3s ease infinite;color:#fff;text-align:center;padding:14px 24px;font-size:15px;font-weight:700;letter-spacing:.3px;position:relative;overflow:hidden}
.flash-banner::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);animation:flashShine 2.5s ease-in-out infinite}
@keyframes flashGrad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes flashShine{0%{left:-100%}100%{left:200%}}
.flash-banner .flash-old{text-decoration:line-through;opacity:.75;margin:0 4px}
.flash-banner .flash-pct{background:rgba(0,0,0,.25);padding:3px 10px;border-radius:6px;font-weight:900;margin:0 6px}
.sale-badge{position:absolute;top:-14px;right:-8px;background:linear-gradient(135deg,#dc2626,#ea580c);color:#fff;font-size:11px;font-weight:900;padding:6px 14px;border-radius:8px;transform:rotate(4deg);box-shadow:0 2px 12px rgba(220,38,38,.4);z-index:2;letter-spacing:.5px}
.price-original{text-decoration:line-through;color:var(--muted);font-size:24px;font-weight:600;margin-bottom:-4px}
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

/* ═══ BOT BUILDER SHOWCASE ═══ */
.builder{max-width:1100px;margin:0 auto;padding:80px 24px}
.builder-head{text-align:center;margin-bottom:56px}
.builder-head h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.builder-head p{font-size:17px;color:var(--body)}
.builder-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.builder-info h3{font-size:28px;font-weight:900;letter-spacing:-.5px;margin-bottom:16px;line-height:1.2}
.builder-info p{font-size:16px;color:var(--body);line-height:1.7;margin-bottom:24px}
.builder-checklist{list-style:none;padding:0;margin:0 0 32px}
.builder-checklist li{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:15px;color:var(--text);font-weight:500}
.builder-checklist .bcheck{color:var(--accent);font-weight:800;font-size:18px}
.builder-preview{background:#0f1117;border-radius:16px;padding:0;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.15);border:1px solid rgba(255,255,255,.08)}
.bp-titlebar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06)}
.bp-dot{width:10px;height:10px;border-radius:50%}
.bp-dot-r{background:#ff5f57}.bp-dot-y{background:#febc2e}.bp-dot-g{background:#28c840}
.bp-title{font-size:12px;color:rgba(255,255,255,.4);margin-left:8px;font-weight:500}
.bp-code{padding:20px 24px;font-family:'SF Mono','Fira Code',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;white-space:pre;overflow-x:auto}
.bp-code .cm{color:#6b7280}.bp-code .kw{color:#8b5cf6}.bp-code .str{color:#34d399}.bp-code .num{color:#f59e0b}.bp-code .fn{color:#60a5fa}.bp-code .prop{color:#f472b6}
@media(max-width:768px){.builder-grid{grid-template-columns:1fr}.bp-code{font-size:11px}}

/* ═══ USE CASES ═══ */
.use-cases{background:var(--bg);padding:80px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.uc-inner{max-width:1100px;margin:0 auto}
.uc-head{text-align:center;margin-bottom:56px}
.uc-head h2{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:12px}
.uc-head p{font-size:17px;color:var(--body)}
.uc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.uc-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px;text-align:center;transition:all .3s}
.uc-card:hover{border-color:var(--accent);box-shadow:0 8px 32px rgba(79,70,229,.08);transform:translateY(-4px)}
.uc-icon{font-size:40px;margin-bottom:16px}
.uc-card h3{font-size:17px;font-weight:800;margin-bottom:8px}
.uc-card p{font-size:14px;color:var(--body);line-height:1.7}
@media(max-width:768px){.uc-grid{grid-template-columns:1fr}}
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

<!-- FLASH SALE BANNER -->
<div class="flash-banner">
  \u26A1 FLASH SALE \u2014 Pro Plan: <span class="flash-old">$99/mo</span> \u2192 <strong>$69/mo</strong> <span class="flash-pct">30% OFF</span> \u2014 Limited Time Only!
</div>

<!-- NAV -->
<header>
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
</header>

<main>

<!-- HERO -->
<section class="hero">
  <div class="hero-badge"><span class="pulse"></span> Custom bots trading live on Polymarket right now</div>
  <h1>Build & Deploy Your Own<br><span class="hl">Custom Polymarket Bots</span></h1>
  <p class="hero-sub">Design custom trading bots that run 24/7 on Polymarket. Start with 8 proven strategies or build your own from scratch. No coding required.</p>
  <div class="hero-cta-row">
    <a href="/checkout?plan=pro" class="cta-btn cta-primary">Build Your First Bot \u2192</a>
    <a href="/login" class="cta-btn cta-secondary" onclick="localStorage.setItem('authTab','signup')">Start Free \u2014 No Code Needed \u2192</a>
  </div>
  <div class="hero-note">
    <span><span class="check">\u2713</span> Free plan \u2014 build & test bots free forever</span>
    <span><span class="check">\u2713</span> No credit card required</span>
    <span><span class="check">\u2713</span> Deploy custom bots in minutes</span>
  </div>
</section>

<!-- SOCIAL PROOF BAR -->
<div class="proof-bar">
  <div class="proof-inner">
    <div class="proof-item"><div class="num">8+</div><div class="lbl">Built-In Bot Templates</div></div>
    <div class="proof-item"><div class="num">\u221E</div><div class="lbl">Custom Bot Configs</div></div>
    <div class="proof-item"><div class="num">24/7</div><div class="lbl">Automated Execution</div></div>
    <div class="proof-item"><div class="num">&lt;2min</div><div class="lbl">Bot Deploy Time</div></div>
  </div>
</div>

<!-- PROBLEM -->
<section class="problem">
  <div class="section-label">The Problem</div>
  <h2>You Have a Trading Edge.<br>You Just Can\u2019t Deploy It.</h2>
  <p>You see opportunities in prediction markets that others miss. But building a trading bot from scratch takes weeks of coding, infrastructure, and testing. So your edge stays in your head while the market moves without you.</p>
  <div class="pain-grid">
    <div class="pain-item"><span class="x">\u2717</span><p>Building a custom bot from scratch takes weeks of development</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>No easy way to test your strategy before risking real money</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>Managing servers, APIs, and infrastructure is a full-time job</p></div>
    <div class="pain-item"><span class="x">\u2717</span><p>One bug in your code can wipe out your entire bankroll</p></div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="how-works" id="how">
  <div class="how-inner">
    <div class="section-label">How It Works</div>
    <h2>Build a Custom Bot in 3 Steps</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Choose or Create a Strategy</h3>
        <p>Start with one of 8 battle-tested bot templates \u2014 or configure your own custom trading logic. Set entry rules, exit conditions, position sizing, and risk limits.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Test With Paper Trading</h3>
        <p>Deploy your custom bot in paper mode with simulated capital. Watch it trade live markets in real-time. Tune parameters until your bot performs exactly how you want.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Deploy & Let It Trade 24/7</h3>
        <p>Flip the switch to live trading. Your custom bot runs autonomously around the clock with built-in risk controls, stop losses, and a kill switch for peace of mind.</p>
      </div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="features">
  <div class="features-head">
    <div class="section-label">Features</div>
    <h2>Everything You Need to Build Custom Bots</h2>
    <p>Professional-grade bot building tools. Zero infrastructure to manage.</p>
  </div>
  <div class="f-grid">
    <div class="f-card">
      <div class="f-icon f-icon-purple">\ud83e\udde9</div>
      <h3>Custom Bot Builder</h3>
      <p>Mix and match strategy components to create your own unique trading bot. Configure every parameter from the dashboard \u2014 no coding required.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-green">\ud83d\udcca</div>
      <h3>Real-Time Bot Dashboard</h3>
      <p>Monitor all your custom bots from one screen. Live P&L, open positions, trade history, and performance analytics for every bot you\u2019ve deployed.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-orange">\ud83e\uddea</div>
      <h3>Paper Trading Sandbox</h3>
      <p>Test your custom bots with simulated funds before going live. Iterate fast, break nothing, and deploy only when you\u2019re confident.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-gold">\u26a1</div>
      <h3>One-Click Deploy</h3>
      <p>Your bots run 24/7 on our infrastructure. No servers to manage, no uptime to worry about. Just build, deploy, and profit.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-purple">\ud83d\udee1\ufe0f</div>
      <h3>Built-In Risk Controls</h3>
      <p>Every custom bot gets stop losses, max drawdown limits, position caps, and a global kill switch. Your bots trade smart, even when you\u2019re not watching.</p>
    </div>
    <div class="f-card">
      <div class="f-icon f-icon-green">\ud83d\udd12</div>
      <h3>Self-Custody \u2014 Your Keys, Your Funds</h3>
      <p>We never hold your funds or private keys. Your custom bots trade through your own Polymarket account. Full control, always.</p>
    </div>
  </div>
</section>

<!-- BOT BUILDER SHOWCASE -->
<section class="builder">
  <div class="builder-head">
    <div class="section-label">Custom Bot Builder</div>
    <h2>Your Strategy. Your Rules. Your Bot.</h2>
    <p>Configure every aspect of your trading bot from a visual dashboard \u2014 or use our strategy templates as a starting point.</p>
  </div>
  <div class="builder-grid">
    <div class="builder-info">
      <h3>Build bots that trade exactly how you want</h3>
      <p>Stop settling for one-size-fits-all trading tools. With PolyMarket Bot, you define the rules and the bot executes flawlessly, 24 hours a day.</p>
      <ul class="builder-checklist">
        <li><span class="bcheck">\u2713</span> Choose entry & exit conditions per market</li>
        <li><span class="bcheck">\u2713</span> Set custom position sizing & capital allocation</li>
        <li><span class="bcheck">\u2713</span> Configure risk limits, stop losses & drawdown caps</li>
        <li><span class="bcheck">\u2713</span> Run multiple custom bots simultaneously</li>
        <li><span class="bcheck">\u2713</span> Paper trade first, deploy live with one click</li>
        <li><span class="bcheck">\u2713</span> Monitor everything from a real-time dashboard</li>
      </ul>
      <a href="/checkout?plan=pro" class="cta-btn cta-primary" style="padding:14px 32px;font-size:15px">Start Building Your Bot \u2192</a>
    </div>
    <div class="builder-preview">
      <div class="bp-titlebar">
        <span class="bp-dot bp-dot-r"></span>
        <span class="bp-dot bp-dot-y"></span>
        <span class="bp-dot bp-dot-g"></span>
        <span class="bp-title">my-custom-bot.config</span>
      </div>
      <div class="bp-code"><span class="cm">// Your custom Polymarket trading bot</span>
<span class="kw">bot</span> <span class="fn">"Election Arbitrage Bot"</span> {
  <span class="prop">strategy</span>:    <span class="str">"cross_market_arbitrage"</span>
  <span class="prop">markets</span>:     <span class="str">"politics"</span>, <span class="str">"elections"</span>
  <span class="prop">capital</span>:     <span class="num">$5,000</span>
  <span class="prop">maxPerTrade</span>: <span class="num">$200</span>

  <span class="cm">// Risk controls</span>
  <span class="prop">stopLoss</span>:    <span class="num">5%</span>
  <span class="prop">maxDrawdown</span>: <span class="num">15%</span>
  <span class="prop">maxOpen</span>:     <span class="num">8</span> trades

  <span class="cm">// Auto-deploy 24/7</span>
  <span class="prop">mode</span>:        <span class="str">"paper"</span> <span class="cm">\u2192 "live"</span>
  <span class="prop">status</span>:      <span class="str" style="color:#34d399">\u2713 RUNNING</span>
}</div>
    </div>
  </div>
</section>

<!-- USE CASES -->
<section class="use-cases">
  <div class="uc-inner">
    <div class="uc-head">
      <div class="section-label">What Will You Build?</div>
      <h2>Custom Bots for Every Trading Style</h2>
      <p>Whether you\u2019re a quant, a news trader, or a whale watcher \u2014 build a bot that fits your edge.</p>
    </div>
    <div class="uc-grid">
      <div class="uc-card">
        <div class="uc-icon">\ud83c\udfaf</div>
        <h3>Arbitrage Bots</h3>
        <p>Build bots that spot pricing gaps between correlated markets and capture risk-free spreads automatically, 24/7.</p>
      </div>
      <div class="uc-card">
        <div class="uc-icon">\ud83e\udde0</div>
        <h3>AI-Powered Bots</h3>
        <p>Create bots that use AI research forecasting to estimate true probabilities and trade against market mispricing.</p>
      </div>
      <div class="uc-card">
        <div class="uc-icon">\ud83d\udc0b</div>
        <h3>Whale Copy Bots</h3>
        <p>Deploy bots that track the highest-performing wallets on Polymarket and automatically mirror their trades.</p>
      </div>
      <div class="uc-card">
        <div class="uc-icon">\ud83d\ude80</div>
        <h3>Momentum Bots</h3>
        <p>Build custom bots that ride big event-driven market moves with trailing stops and momentum scoring.</p>
      </div>
      <div class="uc-card">
        <div class="uc-icon">\u2696\ufe0f</div>
        <h3>Market Making Bots</h3>
        <p>Create bots that provide liquidity by quoting both sides of a market and capturing the bid-ask spread.</p>
      </div>
      <div class="uc-card">
        <div class="uc-icon">\ud83d\udee0\ufe0f</div>
        <h3>Fully Custom Bots</h3>
        <p>Start from a blank framework and implement your own proprietary logic. Full platform hooks, your rules, your edge.</p>
      </div>
    </div>
  </div>
</section>

<!-- STRATEGIES -->
<section class="strategies" id="strategies">
  <div class="strat-inner">
    <div class="strat-head">
      <div class="section-label">Bot Templates</div>
      <h2>8 Pre-Built Bot Templates to Start From</h2>
      <p>Don’t want to start from scratch? Use one of our proven bot templates and customize it to your style.</p>
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
        <span class="s-tag tag-custom">Build Your Own</span>
        <p>Start from a blank framework \u2014 implement your own custom bot logic with full platform hooks and risk controls.</p>
      </div>
    </div>
  </div>
</section>

<!-- TESTIMONIALS -->
<section class="testimonials">
  <div class="testimonials-head">
    <div class="section-label">What Bot Builders Say</div>
    <h2>Traders Who Built Their Own Custom Bots</h2>
    <p>Real results from traders who deployed custom bots on Polymarket.</p>
  </div>
  <div class="t-grid">
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cI built a custom arbitrage bot in 10 minutes and it was paper trading within the hour. Going live was literally one toggle. This is what I\u2019ve been looking for.\u201d</blockquote>
      <div class="t-author">
        <div class="t-avatar">M</div>
        <div class="t-meta"><div class="t-name">Marcus R.</div><div class="t-role">Full-time trader</div></div>
      </div>
    </div>
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cI\u2019m running 4 custom bots now \u2014 each with different strategies and capital allocations. The dashboard lets me monitor all of them. My whale copy bot alone paid for a year of Pro.\u201d</blockquote>
      <div class="t-author">
        <div class="t-avatar">S</div>
        <div class="t-meta"><div class="t-name">Sarah K.</div><div class="t-role">Crypto investor</div></div>
      </div>
    </div>
    <div class="t-card">
      <div class="t-stars">\u2605\u2605\u2605\u2605\u2605</div>
      <blockquote>\u201cBeing able to paper trade my custom bot first gave me real confidence. I tweaked the parameters for a week, then deployed live. The risk controls are seriously impressive for a bot platform.\u201d</blockquote>
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
    <h2>Build Custom Bots Free. Deploy Live When Ready.</h2>
    <p>No credit card required. Build and paper trade custom bots for free. Upgrade to deploy with real money.</p>
  </div>
  <div class="price-row">
    <!-- FREE -->
    <div class="price-card">
      <div class="price-name">Free</div>
      <div class="price-desc">Build & test custom bots free</div>
      <div class="price-free-tag">$0</div>
      <div class="price-period">free forever</div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 bot templates</li>
        <li><span class="checkmark">\u2713</span> Build <strong>custom bots</strong></li>
        <li><span class="checkmark">\u2713</span> Up to <strong>5 paper bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time bot dashboard</li>
        <li><span class="checkmark">\u2713</span> Full risk management</li>
        <li><span class="checkmark">\u2713</span> Whale tracking</li>
        <li><span class="xmark">\u2717</span> <span class="disabled">Deploy bots with real funds</span></li>
        <li><span class="xmark">\u2717</span> <span class="disabled">Priority support</span></li>
      </ul>
      <a href="/login" class="price-btn price-btn-outline" onclick="localStorage.setItem('authTab','signup')">Build Your First Bot \u2192</a>
      <div class="price-vs">No credit card required</div>
    </div>
    <!-- PRO -->
    <div class="price-card featured">
      <div class="sale-badge">\uD83D\uDD25 30% OFF</div>
      <div class="price-popular">FLASH SALE</div>
      <div class="price-name">Pro Trader</div>
      <div class="price-desc">Deploy custom bots with real money</div>
      <div class="price-original">$99</div>
      <div class="price-amount"><sup>$</sup>69<span class="cents"></span></div>
      <div class="price-period">per month \u2022 cancel anytime \u2022 <strong style=\"color:var(--red)\">save $30/mo</strong></div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 bot templates</li>
        <li><span class="checkmark">\u2713</span> <strong>Build unlimited custom bots</strong></li>
        <li><span class="checkmark">\u2713</span> Up to <strong>10 live bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time bot dashboard &amp; analytics</li>
        <li><span class="checkmark">\u2713</span> Full risk management suite</li>
        <li><span class="checkmark">\u2713</span> Whale tracking &amp; copy trading</li>
        <li><span class="checkmark">\u2713</span> <strong>Deploy bots with real funds</strong></li>
        <li><span class="checkmark">\u2713</span> <strong>Priority support</strong></li>
      </ul>
      <a href="/checkout?plan=pro" class="price-btn price-btn-primary">Build & Deploy Now \u2192</a>
      <div class="price-guarantee"><span class="shield">\ud83d\udee1\ufe0f</span> 30-day money-back guarantee</div>
    </div>
    <!-- ENTERPRISE -->
    <div class="price-card">
      <div class="price-name">Enterprise</div>
      <div class="price-desc">Unlimited custom bots — maximum power</div>
      <div class="price-amount"><sup>$</sup>199<span class="cents"></span></div>
      <div class="price-period">per month \u2022 cancel anytime</div>
      <ul class="price-list">
        <li><span class="checkmark">\u2713</span> All 8 bot templates</li>
        <li><span class="checkmark">\u2713</span> <strong>Build unlimited custom bots</strong></li>
        <li><span class="checkmark">\u2713</span> <strong>Unlimited live bots</strong></li>
        <li><span class="checkmark">\u2713</span> Real-time bot dashboard &amp; analytics</li>
        <li><span class="checkmark">\u2713</span> Full risk management suite</li>
        <li><span class="checkmark">\u2713</span> Whale tracking &amp; copy trading</li>
        <li><span class="checkmark">\u2713</span> <strong>Deploy bots with real funds</strong></li>
        <li><span class="checkmark">\u2713</span> <strong>Priority support</strong></li>
      </ul>
      <a href="/checkout?plan=enterprise" class="price-btn price-btn-primary" style="background:#7c3aed">Go Unlimited \u2192</a>
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
      <div class="faq-a"><p>Not at all. Build and deploy custom trading bots entirely from a visual dashboard — no code required. Choose a strategy, configure your parameters with sliders and inputs, and deploy your bot in minutes. If you want to build a fully custom strategy from scratch, you can — but it’s completely optional.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Is my money safe? Do you hold my keys?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>We never custody your funds or hold your private keys. Your custom bots trade through your own Polymarket API key. Your funds stay in your wallet at all times — we just execute the trades your bot generates.</p></div>
    </div>
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <h4>Can I try it without risking real money?</h4>
        <span class="arrow">\u25bc</span>
      </div>
      <div class="faq-a"><p>Yes! Build and test your custom bots with paper trading — completely free, forever. Every strategy and custom bot configuration can run in paper mode with simulated funds. When you’re confident your bot performs well, switch to live trading with one click.</p></div>
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
      <div class="faq-a"><p>It depends on your plan. Free users can build and paper trade up to 5 custom bots. Pro ($69/mo) supports up to 10 live bots with custom configurations. Enterprise ($199/mo) gives you unlimited custom bots. Each bot runs independently with its own strategy, capital allocation, and risk settings.</p></div>
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
  <h2>Build Your Custom Bot Today</h2>
  <p>Design a custom Polymarket trading bot, test it with paper trading, and deploy it live — all from one dashboard. Your bot, your rules, your edge.</p>
  <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
    <a href="/checkout?plan=pro" class="cta-btn" style="background:#fff;color:var(--accent);font-size:18px;padding:20px 44px;box-shadow:0 8px 32px rgba(0,0,0,.2)">Build & Deploy Your Bot \u2192</a>
    <a href="/login" class="cta-btn" style="background:transparent;color:#fff;font-size:18px;padding:20px 44px;border:2px solid rgba(255,255,255,.3)" onclick="localStorage.setItem('authTab','signup')">Start Building Free \u2192</a>
  </div>
  <div class="final-note">
    <span>\u2713 Build custom bots free forever</span>
    <span>\u2713 No credit card needed</span>
    <span>\u2713 Deploy live anytime</span>
  </div>
</section>
</main>

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
