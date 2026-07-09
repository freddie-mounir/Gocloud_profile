(function () {
  'use strict';

  function checkConnection() {
    var statusEl = document.getElementById('connection-status');
    if (!statusEl) {
      return;
    }

    statusEl.textContent = 'Checking connection...';
    statusEl.className = 'connection-status checking';

    fetch('/', { method: 'HEAD', cache: 'no-cache' })
      .then(function () {
        statusEl.textContent = 'Connection restored. Redirecting...';
        statusEl.className = 'connection-status online';
        setTimeout(function () {
          window.location.href = '/';
        }, 1000);
      })
      .catch(function () {
        statusEl.textContent = 'Still offline. Please check your connection.';
        statusEl.className = 'connection-status offline';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var retryBtn = document.getElementById('offlineRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', checkConnection);
    }

    setInterval(function () {
      if (navigator.onLine) {
        checkConnection();
      }
    }, 5000);

    window.addEventListener('online', checkConnection);
  });
})();
