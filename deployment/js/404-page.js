(function () {
  'use strict';

  function performSearch() {
    var input = document.getElementById('searchInput');
    if (!input) {
      return;
    }

    var query = input.value.trim();
    if (query) {
      window.location.href = '/?search=' + encodeURIComponent(query);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var searchInput = document.getElementById('searchInput');
    var searchBtn = document.getElementById('searchBtn');
    var goBackLink = document.getElementById('goBackLink');

    if (searchInput) {
      searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          performSearch();
        }
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', performSearch);
    }

    if (goBackLink) {
      goBackLink.addEventListener('click', function (event) {
        event.preventDefault();
        window.history.back();
      });
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'exception', {
        description: '404 Error - ' + window.location.pathname,
        fatal: false
      });
    }
  });
})();
