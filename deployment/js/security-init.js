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
    var modalFooter = modal ? modal.querySelector('.modal-footer') : null;
    var dateInput = document.getElementById('demoDate');
    var statusEl = null;

    if (dateInput) {
      var today = new Date().toISOString().split('T')[0];
      dateInput.setAttribute('min', today);
    }

    if (!submitBtn || !form) {
      return;
    }

    if (modalFooter) {
      statusEl = document.createElement('p');
      statusEl.className = 'small mb-0 mt-3';
      statusEl.style.minHeight = '1.25rem';
      modalFooter.parentNode.insertBefore(statusEl, modalFooter);
    }

    function setStatus(message, isError) {
      if (!statusEl) {
        return;
      }

      statusEl.classList.remove('text-success', 'text-danger', 'text-muted');
      statusEl.classList.add(isError ? 'text-danger' : 'text-success');
      statusEl.textContent = message || '';
    }

    function setBusy(isBusy) {
      if (submitBtn) {
        submitBtn.disabled = isBusy;
      }
    }

    submitBtn.addEventListener('click', function () {
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        setStatus('Please complete all required fields.', true);
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
      var submitUrl = '/api/demo-request';
      var requestToken = window.GoCloudRequestTurnstileToken;

      if (typeof requestToken !== 'function') {
        setStatus('Security verification is not ready yet. Please try again shortly.', true);
        return;
      }

      setBusy(true);
      setStatus('Submitting your demo request...', false);

      requestToken()
        .then(function (captchaToken) {
          return fetch(submitUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              email: email,
              source: 'Book a Free Demo',
              pageUrl: window.location.href,
              language: document.documentElement.lang || 'en',
              crmType: 'opportunity',
              captchaToken: captchaToken,
              firstName: firstName,
              lastName: lastName,
              phone: phone,
              company: company,
              service: service,
              preferredDate: date,
              preferredTime: time,
              notes: notes
            })
          });
        })
        .then(function (response) {
          if (!response.ok) {
            return response.json().catch(function () {
              return {};
            }).then(function (payload) {
              var message = payload && payload.error ? payload.error : 'Demo request failed. Please try again.';
              throw new Error(message);
            });
          }

          return response.json();
        })
        .then(function (payload) {
          setStatus(
            (payload && payload.message) ||
              'Thanks. Your demo request was received and will be handled as a sales opportunity.',
            false
          );
          form.reset();
          form.classList.remove('was-validated');
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : 'Demo request failed. Please try again.', true);
        })
        .finally(function () {
          setBusy(false);
        });
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

  document.addEventListener('DOMContentLoaded', function () {
    initPreloader();
    initFooterYear();
    initDemoModal();
    initEliteVideoModal();
    initPortfolioHoverEffects();
    initWhatsAppButton();
  });
})();
