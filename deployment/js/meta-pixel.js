(function () {
  'use strict';

  // Fill this when available, or override via <meta name="gocloud-meta-pixel-id" content="...">.
  var DEFAULT_PIXEL_ID = '542314300011689';

  function getPixelId() {
    var metaTag = document.querySelector('meta[name="gocloud-meta-pixel-id"]');
    var metaValue = metaTag ? (metaTag.getAttribute('content') || '').trim() : '';
    var pixelId = metaValue || DEFAULT_PIXEL_ID;

    if (!/^\d+$/.test(pixelId)) {
      return '';
    }

    return pixelId;
  }

  function initMetaPixel() {
    if (window.__gcMetaPixelInitialized) {
      return;
    }

    var pixelId = getPixelId();

    if (!pixelId) {
      return;
    }

    window.__gcMetaPixelInitialized = true;

    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) {
        return;
      }
      n = f.fbq = function () {
        if (n.callMethod) {
          n.callMethod.apply(n, arguments);
        } else {
          n.queue.push(arguments);
        }
      };
      if (!f._fbq) {
        f._fbq = n;
      }
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMetaPixel);
  } else {
    initMetaPixel();
  }
})();
