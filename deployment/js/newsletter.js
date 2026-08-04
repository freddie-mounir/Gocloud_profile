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

  function attachTurnstileWidget(form) {
    if (!TURNSTILE_SITE_KEY) {
      return;
    }

    if (form.querySelector('.cf-turnstile')) {
      return;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'mt-2 cf-turnstile';
    wrapper.setAttribute('data-sitekey', TURNSTILE_SITE_KEY);
    wrapper.setAttribute('data-action', TURNSTILE_ACTION);
    wrapper.setAttribute('data-execution', 'execute');
    wrapper.setAttribute('data-appearance', 'always');
    form.appendChild(wrapper);

    if (!form.querySelector('[data-turnstile-verify-btn]')) {
      var verifyBtn = document.createElement('button');
      verifyBtn.type = 'button';
      verifyBtn.className = 'btn btn-sm btn-light mt-2';
      verifyBtn.setAttribute('data-turnstile-verify-btn', '1');
      verifyBtn.textContent = 'Verify security';
      verifyBtn.addEventListener('click', function () {
        var feedbackEl = (form.parentElement || form).querySelector('[data-newsletter-feedback]');
        form.setAttribute('data-turnstile-manual', '1');
        if (executeTurnstileChallenge(form)) {
          setFeedback(
            feedbackEl,
            'error',
            'Security challenge started. Complete verification, then click subscribe.'
          );
        } else {
          form.setAttribute('data-turnstile-manual', '0');
          setFeedback(feedbackEl, 'error', 'Security challenge is still loading. Please try again.');
        }
      });
      form.appendChild(verifyBtn);
    }
  }

  function executeTurnstileChallenge(form) {
    var widget = form.querySelector('.cf-turnstile');
    if (!widget || !window.turnstile) {
      return false;
    }

    try {
      window.turnstile.reset(widget);
      window.turnstile.execute(widget);
      return true;
    } catch (err) {
      return false;
    }
  }

  function getTurnstileToken(form) {
    if (!TURNSTILE_SITE_KEY) {
      return '';
    }

    var tokenInput = form.querySelector('input[name="cf-turnstile-response"]');
    if (!tokenInput) {
      return '';
    }

    return (tokenInput.value || '').trim();
  }

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
        if (REQUIRE_TURNSTILE) {
          loadTurnstileScript().then(function (loaded) {
            if (loaded) {
              attachTurnstileWidget(form);
            }
          });
        }

        var parent = form.parentElement || form;
        var feedbackEl = parent.querySelector('[data-newsletter-feedback]');
        var submitBtn = form.querySelector('button[type="submit"]');
        var emailInput = form.querySelector('input[name="email"]');

        form.addEventListener('submit', function (event) {
          event.preventDefault();

          var source = form.getAttribute('data-source') || 'website';
          var emailValue = emailInput ? emailInput.value.trim().toLowerCase() : '';

          if (!isValidEmail(emailValue)) {
            setFeedback(feedbackEl, 'error', 'Please enter a valid email address.');
            return;
          }

          var captchaToken = getTurnstileToken(form);
          if (REQUIRE_TURNSTILE && !TURNSTILE_SITE_KEY) {
            setFeedback(feedbackEl, 'error', 'Security check is not ready. Please try again shortly.');
            return;
          }
          if (REQUIRE_TURNSTILE && form.getAttribute('data-turnstile-manual') !== '1') {
            setFeedback(feedbackEl, 'error', 'Please click "Verify security" first.');
            return;
          }
          if (REQUIRE_TURNSTILE && form.getAttribute('data-turnstile-armed') !== '1') {
            if (executeTurnstileChallenge(form)) {
              form.setAttribute('data-turnstile-armed', '1');
              setFeedback(
                feedbackEl,
                'error',
                'Please complete the security verification challenge, then submit again.'
              );
            } else {
              setFeedback(feedbackEl, 'error', 'Please complete the security check.');
            }
            return;
          }
          if (REQUIRE_TURNSTILE && !captchaToken) {
            if (executeTurnstileChallenge(form)) {
              setFeedback(
                feedbackEl,
                'error',
                'Please complete the security verification challenge, then submit again.'
              );
            } else {
              setFeedback(feedbackEl, 'error', 'Please complete the security check.');
            }
            return;
          }

          if (submitBtn) {
            submitBtn.disabled = true;
          }
          setFeedback(feedbackEl, '', 'Submitting your request...');

          fetch('/api/newsletter', {
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
              form.setAttribute('data-turnstile-armed', '0');
              form.setAttribute('data-turnstile-manual', '0');
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
            })
            .finally(function () {
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
