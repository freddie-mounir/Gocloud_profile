(function () {
  'use strict';

  function initAos() {
    if (typeof window.AOS === 'undefined') {
      return;
    }
    window.AOS.init({
      duration: 600,
      once: true
    });
  }

  function initGa() {
    window.addEventListener('load', function () {
      var analyticsScript = document.createElement('script');
      analyticsScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-60G03RQLPB';
      analyticsScript.async = true;
      document.head.appendChild(analyticsScript);

      analyticsScript.onload = function () {
        window.dataLayer = window.dataLayer || [];

        function gtag() {
          window.dataLayer.push(arguments);
        }

        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', 'G-60G03RQLPB');
      };
    });
  }

  function initBlogCategoryFilter() {
    var filterButtons = document.querySelectorAll('.filter-btn');
    if (!filterButtons.length) {
      return;
    }

    var noPosts = document.getElementById('noPosts');

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        filterButtons.forEach(function (other) {
          other.classList.remove('active');
        });
        button.classList.add('active');

        var category = button.getAttribute('data-filter');
        var items = document.querySelectorAll('.blog-item');
        var visible = 0;

        items.forEach(function (item) {
          var match = category === 'all' || item.getAttribute('data-category') === category;
          item.style.display = match ? '' : 'none';
          if (match) {
            visible += 1;
          }
        });

        if (noPosts) {
          noPosts.classList.toggle('d-none', visible > 0);
        }
      });
    });
  }

  function initCopyShareButton() {
    var copyButton = document.querySelector('.share-btn.copy[data-copy-url]');
    if (!copyButton || !navigator.clipboard) {
      return;
    }

    copyButton.addEventListener('click', function () {
      var copyUrl = copyButton.getAttribute('data-copy-url');
      navigator.clipboard
        .writeText(copyUrl)
        .then(function () {
          copyButton.innerHTML = '<i class="fas fa-check"></i>';
          setTimeout(function () {
            copyButton.innerHTML = '<i class="fas fa-link"></i>';
          }, 2000);
        })
        .catch(function () {
          copyButton.innerHTML = '<i class="fas fa-times"></i>';
          setTimeout(function () {
            copyButton.innerHTML = '<i class="fas fa-link"></i>';
          }, 2000);
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initAos();
    initBlogCategoryFilter();
    initCopyShareButton();
    initGa();
  });
})();
