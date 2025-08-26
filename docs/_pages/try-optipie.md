---
layout: single
title: "Try OptiPie Free"
permalink: /try-optipie/
description: "Easily optimize TradingView strategies. Store reports & analyze results with a simple UI. Real-time Report Monitoring & Instant Analysis!"
classes: wide
---

<style>
/* light, page-scoped polish */
.try-wrap{max-width:980px;margin:0 auto;padding:24px 16px;text-align:center}
.try-logo{height:32px;opacity:.9;margin:0 auto 12px;display:block}
.try-h1{font-size:2.2rem;line-height:1.2;margin:.25rem 0 .5rem}
.try-lead{font-size:1.05rem;color:#555;margin:0 0 .75rem}
.try-feature{font-weight:700;margin:0 0 1.1rem}
.btn--cta{display:inline-block;background:#e11d48;color:#fff;border-radius:12px;
  padding:14px 22px;font-weight:700;text-decoration:none}
.btn--cta:hover{background:#be123c}
.try-fig{margin:22px auto 8px;max-width:920px}
.try-fig img,.try-fig video{width:100%;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.try-ticks{margin:10px auto 0;max-width:720px;text-align:left}
.try-ticks li{list-style:none;margin:.45rem 0;font-size:1.02rem}
@media (min-width:1024px){ .try-h1{font-size:2.6rem} }
</style>

<div class="try-wrap">
  <!-- Logo -->
  <img class="try-logo" src="{{ '/assets/images/optipie_app_logo.png' | relative_url }}" alt="OptiPie">

  <!-- Hero -->
  <h1 class="try-h1">Easily optimize TradingView strategies — <span style="color:#1a73e8;">Free</span></h1>
  <p class="try-lead">Store optimization reports and analyze results with a simple UI.</p>
  <p class="try-feature">Real-time Report Monitoring &amp; Instant Analysis!</p>

  <!-- CTA -->
  <p>
    <a id="cta-install"
       class="btn--cta"
       href="https://chromewebstore.google.com/detail/optipie-tradingview-optim/fdndgpohalkoklpaopahkblpomlhmifm"
       onclick="return gtag_report_conversion(this.href)">
      Try OptiPie Free
    </a>
  </p>

  <!-- GIF / Video -->
  <div class="try-fig">
    {%
      include figure
      image_path="/assets/images/demo.gif"
      alt="OptiPie demo"
      caption=""
      width="920"
    %}
  </div>

  <!-- Tiny ticks (no bulky rows) -->
  <ul class="try-ticks">
    <li>✅ Optimize strategies in minutes.</li>
    <li>✅ Store and revisit optimization reports.</li>
    <li>✅ Analyze results with a simple UI.</li>
  </ul>

  <p style="color:#666;margin:18px 0 0;">Need more power later? <a href="/plus/">Try OptiPie Plus</a>.</p>
</div>

<script>
function gtag_report_conversion(url) {
  var callback = function () {
    if (typeof(url) != 'undefined') {
      window.location = url;
    }
  };
  gtag('event', 'conversion', {
      'send_to': 'AW-17495457166/quONCOjEso4bEI77vZZB',
      'value': 0.0,
      'currency': 'TRY',
      'event_callback': callback
  });
  return false;
}
</script>
