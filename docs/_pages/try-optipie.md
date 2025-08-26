---
layout: single
title: "Try OptiPie Free"
permalink: /try-optipie/
description: "Easily optimize TradingView strategies. Store reports & analyze results with a simple UI. Real-time Report Monitoring & Instant Analysis!"
classes: wide
---

# Easily optimize TradingView strategies — **Free**

<p class="page__lead">
  Store optimization reports and analyze results with a simple UI.<br>
  <strong>Real-time Report Monitoring &amp; Instant Analysis!</strong>
</p>

<p>
  <a id="cta-install"
     class="btn btn--primary btn--large"
     href="https://chromewebstore.google.com/detail/optipie-tradingview-optim/fdndgpohalkoklpaopahkblpomlhmifm"
     onclick="return gtag_report_conversion(this.href)">
    Try OptiPie Free
  </a>
</p>

{% include feature_row
  features="
  [
    { 'title':'Optimize in minutes', 'excerpt':'Skip the busywork. Let OptiPie do the runs for you.' },
    { 'title':'Store reports', 'excerpt':'Save and revisit optimization results whenever you need.' },
    { 'title':'Simple analysis', 'excerpt':'Clean UI to review results and decide faster.' }
  ]"
%}

<p class="text-center" style="margin-top:1rem;">
  Need more power later? <a href="/plus/">Try OptiPie Plus</a>.
</p>

<!-- Optional visual (keeps MM look). Put your GIF/shot in assets and uncomment. -->
{%
  comment
%}
{% include figure image_path="/assets/images/optipie-demo.gif"
   alt="OptiPie demo"
   caption=" "
   width="900" %}
{%
  endcomment
%}
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
