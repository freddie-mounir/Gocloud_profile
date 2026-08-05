(function () {
  'use strict';

  var TURNSTILE_SITE_KEY =
    window.GOCLOUD_TURNSTILE_SITE_KEY ||
    (document.querySelector('meta[name="gocloud-turnstile-site-key"]') || {}).content ||
    '';
  var TURNSTILE_ACTION = 'newsletter_subscribe';
  var REQUIRE_TURNSTILE = true;
  var turnstileScriptPromise = null;
  var securityConfigPromise = null;
  var turnstileModalState = null;
  var turnstilePendingReject = null;
  var TURNSTILE_COPY = {
    ar: {
      title: 'التحقق الأمني',
      description: 'يرجى إكمال التحقق الأمني للمتابعة في الاشتراك.',
      cancel: 'إلغاء',
      closeAria: 'إغلاق',
      cancelled: 'تم إلغاء التحقق الأمني.',
      loadingUnavailable: 'يتم تجهيز التحقق الأمني. يرجى المحاولة مرة أخرى.',
      popupUnavailable: 'تعذر فتح نافذة التحقق الأمني. يرجى تحديث الصفحة.',
      waiting: 'بانتظار إكمال التحقق...',
      expired: 'انتهت صلاحية التحقق. يرجى المحاولة مرة أخرى.',
      failed: 'فشل التحقق الأمني. يرجى المحاولة مرة أخرى.',
      startFailed: 'تعذر بدء التحقق الأمني.',
      complete: 'أكمل التحدي للمتابعة.',
      launchFailed: 'تعذر تشغيل التحقق الأمني. يرجى إعادة المحاولة.'
    },
    en: {
      title: 'Security Verification',
      description: 'Please complete verification to continue your subscription.',
      cancel: 'Cancel',
      closeAria: 'Close',
      cancelled: 'Security verification was cancelled.',
      loadingUnavailable: 'Security challenge is still loading. Please try again.',
      popupUnavailable: 'Security popup is unavailable. Please refresh and try again.',
      waiting: 'Waiting for verification...',
      expired: 'Verification expired. Please try again.',
      failed: 'Verification failed. Please try again.',
      startFailed: 'Unable to start security verification.',
      complete: 'Complete the challenge to continue.',
      launchFailed: 'Unable to launch verification. Please retry.'
    }
  };

  function getCurrentLanguage() {
    return document.documentElement.lang === 'ar' ? 'ar' : 'en';
  }

  function getTurnstileCopy() {
    return TURNSTILE_COPY[getCurrentLanguage()];
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setFeedback(feedbackEl, type, message) {
    if (!feedbackEl) {
      return;
    }

    feedbackEl.classList.remove('text-success', 'text-danger', 'text-light');

    if (type === 'success') {
      feedbackEl.classList.add('text-success');
    } else if (type === 'error') {
      feedbackEl.classList.add('text-danger');
    } else {
      feedbackEl.classList.add('text-light');
    }

    feedbackEl.textContent = message;
  }

  function loadTurnstileScript() {
    if (!TURNSTILE_SITE_KEY) {
      return Promise.resolve(false);
    }

    if (window.turnstile) {
      return Promise.resolve(true);
    }

    if (turnstileScriptPromise) {
      return turnstileScriptPromise;
    }

    turnstileScriptPromise = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = function () {
        resolve(Boolean(window.turnstile));
      };
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });

    return turnstileScriptPromise;
  }

  function loadRuntimeSecurityConfig() {
    if (securityConfigPromise) {
      return securityConfigPromise;
    }

    securityConfigPromise = fetch('/api/public-config', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.json().catch(function () {
          return null;
        });
      })
      .then(function (config) {
        if (!config) {
          return;
        }

        REQUIRE_TURNSTILE = Boolean(config.requireTurnstile);

        if (typeof config.turnstileAction === 'string' && config.turnstileAction.trim()) {
          TURNSTILE_ACTION = config.turnstileAction.trim();
        }

        if (!TURNSTILE_SITE_KEY && typeof config.turnstileSiteKey === 'string') {
          TURNSTILE_SITE_KEY = config.turnstileSiteKey.trim();
        }
      })
      .catch(function () {
        return null;
      });

    return securityConfigPromise;
  }

  function setTurnstileModalStatus(message, isError) {
    if (!turnstileModalState || !turnstileModalState.status) {
      return;
    }

    turnstileModalState.status.classList.remove('text-danger', 'text-muted');
    turnstileModalState.status.classList.add(isError ? 'text-danger' : 'text-muted');
    turnstileModalState.status.textContent = message || '';
  }

  function applyTurnstileModalCopy(copy) {
    if (!turnstileModalState) {
      return;
    }

    if (turnstileModalState.title) {
      turnstileModalState.title.textContent = copy.title;
    }
    if (turnstileModalState.description) {
      turnstileModalState.description.textContent = copy.description;
    }
    if (turnstileModalState.cancelBtn) {
      turnstileModalState.cancelBtn.textContent = copy.cancel;
    }
    if (turnstileModalState.closeBtn) {
      turnstileModalState.closeBtn.setAttribute('aria-label', copy.closeAria);
    }
  }

  function ensureTurnstileModal() {
    if (turnstileModalState) {
      return turnstileModalState;
    }

    var modalWrap = document.createElement('div');
    modalWrap.innerHTML =
      '<div class="modal fade" id="gcTurnstileModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content">' +
      '      <div class="modal-header">' +
      '        <h5 class="modal-title" data-turnstile-modal-title></h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
      '      </div>' +
      '      <div class="modal-body">' +
      '        <p class="mb-3" data-turnstile-modal-description></p>' +
      '        <div data-turnstile-modal-slot class="d-flex justify-content-center"></div>' +
      '        <p data-turnstile-modal-status class="small mt-3 mb-0 text-muted"></p>' +
      '      </div>' +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal" data-turnstile-modal-cancel></button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var modalEl = modalWrap.firstChild;
    document.body.appendChild(modalEl);

    var modalInstance = null;
    if (window.bootstrap && window.bootstrap.Modal) {
      modalInstance = new window.bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false
      });
    }

    turnstileModalState = {
      element: modalEl,
      instance: modalInstance,
      title: modalEl.querySelector('[data-turnstile-modal-title]'),
      description: modalEl.querySelector('[data-turnstile-modal-description]'),
      closeBtn: modalEl.querySelector('.btn-close'),
      cancelBtn: modalEl.querySelector('[data-turnstile-modal-cancel]'),
      slot: modalEl.querySelector('[data-turnstile-modal-slot]'),
      status: modalEl.querySelector('[data-turnstile-modal-status]'),
      widgetId: null,
      settled: false
    };

    applyTurnstileModalCopy(getTurnstileCopy());

    modalEl.addEventListener('hidden.bs.modal', function () {
      if (window.turnstile && turnstileModalState.widgetId !== null) {
        try {
          window.turnstile.remove(turnstileModalState.widgetId);
        } catch (err) {
          // noop
        }
      }

      turnstileModalState.widgetId = null;
      turnstileModalState.slot.innerHTML = '';
      setTurnstileModalStatus('', false);

      if (!turnstileModalState.settled && typeof turnstilePendingReject === 'function') {
        turnstilePendingReject(getTurnstileCopy().cancelled);
      }

      turnstileModalState.settled = false;
      turnstilePendingReject = null;
    });

    return turnstileModalState;
  }

  function requestTurnstileToken() {
    return loadTurnstileScript().then(function (loaded) {
      var copy = getTurnstileCopy();
      if (!loaded || !window.turnstile) {
        throw new Error(copy.loadingUnavailable);
      }

      var modal = ensureTurnstileModal();
      if (!modal.instance) {
        throw new Error(copy.popupUnavailable);
      }

      applyTurnstileModalCopy(copy);
      modal.settled = false;
      modal.slot.innerHTML = '';
      setTurnstileModalStatus(copy.waiting, false);

      return new Promise(function (resolve, reject) {
        turnstilePendingReject = reject;

        try {
          modal.widgetId = window.turnstile.render(modal.slot, {
            sitekey: TURNSTILE_SITE_KEY,
            action: TURNSTILE_ACTION,
            appearance: 'always',
            execution: 'execute',
            callback: function (token) {
              if (!token || modal.settled) {
                return;
              }
              modal.settled = true;
              resolve(token);
              modal.instance.hide();
            },
            'expired-callback': function () {
              setTurnstileModalStatus(copy.expired, true);
            },
            'error-callback': function () {
              setTurnstileModalStatus(copy.failed, true);
            }
          });
        } catch (err) {
          reject(new Error(copy.startFailed));
          return;
        }

        modal.instance.show();

        setTimeout(function () {
          if (!window.turnstile || modal.widgetId === null) {
            return;
          }
          try {
            window.turnstile.reset(modal.widgetId);
            window.turnstile.execute(modal.widgetId);
            setTurnstileModalStatus(copy.complete, false);
          } catch (err) {
            setTurnstileModalStatus(copy.launchFailed, true);
          }
        }, 120);
      });
    });
  }

  window.GoCloudRequestTurnstileToken = requestTurnstileToken;

  function buildMailtoFallback(email, source) {
    var subject = 'Newsletter Subscription - GoCloud';
    var bodyLines = [
      'Please add this email to GoCloud newsletter:',
      email,
      '',
      'Source: ' + source,
      'Page: ' + window.location.href
    ];

    return (
      'mailto:marketing@gocloudeg.com?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(bodyLines.join('\n'))
    );
  }

  function initNewsletterForms() {
    var forms = document.querySelectorAll('[data-newsletter-form]');
    if (!forms.length) {
      return;
    }

    loadRuntimeSecurityConfig().finally(function () {
      forms.forEach(function (form) {
        var parent = form.parentElement || form;
        var feedbackEl = parent.querySelector('[data-newsletter-feedback]');
        var submitBtn = form.querySelector('button[type="submit"]');
        var emailInput = form.querySelector('input[name="email"]');

        function submitNewsletter(emailValue, source, captchaToken) {
          setFeedback(feedbackEl, '', 'Submitting your request...');

          return fetch('/api/newsletter', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              email: emailValue,
              source: source,
              pageUrl: window.location.href,
              language: document.documentElement.lang || 'en',
              captchaToken: captchaToken
            })
          })
            .then(function (response) {
              if (!response.ok) {
                return response.json().catch(function () {
                  return {};
                }).then(function (payload) {
                  var message = payload && payload.error ? payload.error : 'Subscription failed';
                  throw new Error(message);
                });
              }
              return response.json();
            })
            .then(function (payload) {
              if (emailInput) {
                emailInput.value = '';
              }
              setFeedback(
                feedbackEl,
                'success',
                (payload && payload.message) ||
                  'Thank you for subscribing! Please check your inbox to confirm your email.'
              );
            })
            .catch(function (err) {
              if (err && err.message) {
                setFeedback(feedbackEl, 'error', err.message);
                return;
              }

              window.location.href = buildMailtoFallback(emailValue, source);
              setFeedback(feedbackEl, 'error', 'Subscription failed. Please try again later.');
            });
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault();

          var source = form.getAttribute('data-source') || 'website';
          var emailValue = emailInput ? emailInput.value.trim().toLowerCase() : '';

          if (!isValidEmail(emailValue)) {
            setFeedback(feedbackEl, 'error', 'Please enter a valid email address.');
            return;
          }

          if (submitBtn) {
            submitBtn.disabled = true;
          }

          if (REQUIRE_TURNSTILE && !TURNSTILE_SITE_KEY) {
            setFeedback(feedbackEl, 'error', 'Security check is not ready. Please try again shortly.');
            if (submitBtn) {
              submitBtn.disabled = false;
            }
            return;
          }

          var request;
          if (REQUIRE_TURNSTILE) {
            request = requestTurnstileToken().then(function (token) {
              return submitNewsletter(emailValue, source, token);
            });
          } else {
            request = submitNewsletter(emailValue, source, '');
          }

          request.finally(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
            }
          });
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNewsletterForms();
  });
})();
