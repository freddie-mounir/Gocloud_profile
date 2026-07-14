(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-60G03RQLPB';

  function initAnalytics() {
    if (window.__gcAnalyticsInitialized) {
      return;
    }
    window.__gcAnalyticsInitialized = true;

    window.dataLayer = window.dataLayer || [];

    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    // Egypt/Africa/Middle East-first defaults: analytics enabled, ads features disabled.
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500
    });

    window.gtag('set', 'allow_google_signals', false);
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      transport_type: 'beacon',
      send_page_view: true
    });

    var script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    script.async = true;
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics);
  } else {
    initAnalytics();
  }
})();
