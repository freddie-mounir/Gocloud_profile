(function () {
  'use strict';

  function initPreloader() {
    var timeoutId = setTimeout(function () {
      var preloader = document.getElementById('ctn-preloader');
      if (!preloader) {
        return;
      }
      preloader.classList.add('loaded');
      preloader.style.opacity = '0';
      setTimeout(function () {
        preloader.style.display = 'none';
      }, 400);
    }, 3000);

    window.addEventListener('load', function () {
      clearTimeout(timeoutId);
    });
  }

  function initFooterYear() {
    var yearEl = document.getElementById('gcCurrentYear');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  function initDemoModal() {
    var submitBtn = document.getElementById('demoSubmitBtn');
    var form = document.getElementById('demoBookingForm');
    var modal = document.getElementById('demoModal');
    var dateInput = document.getElementById('demoDate');

    if (dateInput) {
      var today = new Date().toISOString().split('T')[0];
      dateInput.setAttribute('min', today);
    }

    if (!submitBtn || !form) {
      return;
    }

    submitBtn.addEventListener('click', function () {
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
      }

      var firstName = document.getElementById('demoFirstName').value.trim();
      var lastName = document.getElementById('demoLastName').value.trim();
      var email = document.getElementById('demoEmail').value.trim();
      var phone = document.getElementById('demoPhone').value.trim();
      var company = document.getElementById('demoCompany').value.trim();
      var service = document.getElementById('demoService').value;
      var date = document.getElementById('demoDate').value;
      var time = document.getElementById('demoTime').value;
      var notes = document.getElementById('demoNotes').value.trim();

      var subject = 'Demo Request from ' + firstName + ' ' + lastName;
      var body =
        'Name: ' +
        firstName +
        ' ' +
        lastName +
        '\n' +
        'Email: ' +
        email +
        '\n' +
        'Mobile: ' +
        phone +
        '\n' +
        (company ? 'Company: ' + company + '\n' : '') +
        (service ? 'Service Interest: ' + service + '\n' : '') +
        'Preferred Date: ' +
        date +
        '\n' +
        'Preferred Time: ' +
        time +
        '\n' +
        (notes ? 'Notes: ' + notes + '\n' : '');

      window.location.href =
        'mailto:marketing@gocloudeg.com' +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(body);

      var bsModal = window.bootstrap ? window.bootstrap.Modal.getInstance(modal) : null;
      if (bsModal) {
        bsModal.hide();
      }

      form.reset();
      form.classList.remove('was-validated');
    });
  }

  function initEliteVideoModal() {
    var videoModal = document.getElementById('demo-video');
    var videoPlayer = document.getElementById('eliteVideoPlayer');

    if (!videoModal || !videoPlayer) {
      return;
    }

    videoModal.addEventListener('hidden.bs.modal', function () {
      var videoSrc = videoPlayer.src;
      videoPlayer.src = '';
      videoPlayer.src = videoSrc;
    });
  }

  function initPortfolioHoverEffects() {
    var cards = document.querySelectorAll('.image-anime');
    if (!cards.length) {
      return;
    }

    cards.forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        card.style.transform = 'skew(3deg, 3deg)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = 'scale(1)';
      });
    });
  }

  function initWhatsAppButton() {
    if (document.querySelector('.whatsapp-float')) {
      return;
    }

    var whatsappFloat = document.createElement('div');
    whatsappFloat.className = 'whatsapp-float';

    var myFloat = document.createElement('div');
    myFloat.className = 'my-float';

    var icon = document.createElement('i');
    icon.className = 'fa-brands fa-whatsapp';

    myFloat.appendChild(icon);
    whatsappFloat.appendChild(myFloat);
    document.body.appendChild(whatsappFloat);

    whatsappFloat.addEventListener('click', function () {
      window.location.href = 'https://wa.me/+201017383815?text=Hello from Gocloud';
    });
  }

  function initAnalytics() {
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

  document.addEventListener('DOMContentLoaded', function () {
    initPreloader();
    initFooterYear();
    initDemoModal();
    initEliteVideoModal();
    initPortfolioHoverEffects();
    initWhatsAppButton();
    initAnalytics();
  });
})();
