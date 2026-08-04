(function () {
  'use strict';

  var BLOG_COPY = {
    ar: {
      title: 'مدونة GoCloud — مقالات في التأمين الطبي وتطبيقات أودو',
      breadcrumbCurrent: 'المدونة',
      heroTitle: 'مدونة GoCloud',
      heroText: 'مقالات متخصصة في التأمين الطبي وتطبيقات Odoo ERP — نصائح عملية وحلول لتحسين أعمالك',
      filters: {
        all: 'الكل',
        insurance: 'التأمين الطبي',
        odoo: 'تطبيقات أودو'
      },
      categoryLabels: {
        insurance: 'التأمين الطبي',
        odoo: 'تطبيقات أودو'
      },
      readMore: 'اقرأ المزيد',
      noPosts: 'لا توجد مقالات في هذا التصنيف حالياً',
      newsletterTitle: 'اشترك في نشرات GoCloud',
      newsletterText: 'استقبل أحدث المقالات والرؤى العملية حول Odoo والتأمين الطبي مباشرة في بريدك.',
      newsletterLabel: 'البريد الإلكتروني',
      newsletterButton: 'اشترك الآن',
      newsletterInvalidEmail: 'برجاء إدخال بريد إلكتروني صحيح.',
      newsletterLoading: 'جارٍ الاشتراك...',
      newsletterSuccess: 'شكراً لاشتراكك! يُرجى التحقق من بريدك لتأكيد البريد الإلكتروني.',
      newsletterFallbackSuccess: 'فتحنا بريدك لإرسال طلب الاشتراك. يرجى تأكيد الإرسال من تطبيق البريد.'
    },
    en: {
      title: 'GoCloud Blog — Medical Insurance and Odoo Insights',
      breadcrumbCurrent: 'Blog',
      heroTitle: 'GoCloud Blog',
      heroText: 'Specialized articles in medical insurance and Odoo ERP applications — practical tips and solutions to improve your business.',
      filters: {
        all: 'All',
        insurance: 'Medical Insurance',
        odoo: 'Odoo Applications'
      },
      categoryLabels: {
        insurance: 'Medical Insurance',
        odoo: 'Odoo Applications'
      },
      readMore: 'Read More',
      noPosts: 'No posts found in this category right now.',
      newsletterTitle: 'Subscribe to GoCloud Updates',
      newsletterText: 'Get the latest articles and practical insights on Odoo and medical insurance directly in your inbox.',
      newsletterLabel: 'Email address',
      newsletterButton: 'Subscribe Now',
      newsletterInvalidEmail: 'Please enter a valid email address.',
      newsletterLoading: 'Subscribing...',
      newsletterSuccess: 'Thank you for subscribing! Please check your inbox to confirm your email.',
      newsletterFallbackSuccess: 'Your mail app is open to send the subscription request. Please confirm sending from your mail app.'
    }
  };

  var TURNSTILE_SITE_KEY =
    window.GOCLOUD_TURNSTILE_SITE_KEY ||
    (document.querySelector('meta[name="gocloud-turnstile-site-key"]') || {}).content ||
    '';
  var REQUIRE_TURNSTILE = true;
  var TURNSTILE_ACTION = 'newsletter_subscribe';
  var runtimeSecurityConfigPromise = null;
  var turnstileScriptPromise = null;

  function getCurrentLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'ar';
  }

  function getCopy() {
    return BLOG_COPY[getCurrentLanguage()];
  }

  function parseBlogRoute(pathname) {
    if (pathname.indexOf('/blog/en/') === 0) {
      return {
        locale: 'en',
        relative: pathname.replace('/blog/en/', '')
      };
    }

    if (pathname.indexOf('/blog/') === 0) {
      return {
        locale: 'ar',
        relative: pathname.replace('/blog/', '')
      };
    }

    return null;
  }

  function getBlogCounterpartUrl(targetLanguage) {
    var route = parseBlogRoute(window.location.pathname);
    if (!route) {
      return null;
    }

    var relative = route.relative || 'index.html';
    var cleanRelative = relative.replace(/^\//, '');

    if (targetLanguage === 'en') {
      return '/blog/en/' + cleanRelative + window.location.search + window.location.hash;
    }

    return '/blog/' + cleanRelative + window.location.search + window.location.hash;
  }

  function ensureBlogRouteLanguage(targetLanguage) {
    var route = parseBlogRoute(window.location.pathname);
    if (!route) {
      return false;
    }

    if (route.locale === targetLanguage) {
      return false;
    }

    var counterpart = getBlogCounterpartUrl(targetLanguage);
    if (!counterpart) {
      return false;
    }

    window.location.href = counterpart;
    return true;
  }

  function applyBlogIndexLanguage() {
    var blogGrid = document.getElementById('blogGrid');
    if (!blogGrid) {
      return;
    }

    var copy = getCopy();
    document.title = copy.title;

    var breadcrumbCurrent = document.querySelector('[data-blog-breadcrumb-current]');
    var heroTitle = document.querySelector('[data-blog-hero-title]');
    var heroText = document.querySelector('[data-blog-hero-text]');
    var noPostsText = document.querySelector('[data-blog-no-posts]');
    var newsletterTitle = document.querySelector('[data-blog-newsletter-title]');
    var newsletterText = document.querySelector('[data-blog-newsletter-text]');
    var newsletterLabel = document.querySelector('[data-blog-newsletter-label]');
    var newsletterButton = document.querySelector('[data-blog-newsletter-button]');

    if (breadcrumbCurrent) {
      breadcrumbCurrent.textContent = copy.breadcrumbCurrent;
    }
    if (heroTitle) {
      heroTitle.textContent = copy.heroTitle;
    }
    if (heroText) {
      heroText.textContent = copy.heroText;
    }
    if (noPostsText) {
      noPostsText.textContent = copy.noPosts;
    }
    if (newsletterTitle) {
      newsletterTitle.textContent = copy.newsletterTitle;
    }
    if (newsletterText) {
      newsletterText.textContent = copy.newsletterText;
    }
    if (newsletterLabel) {
      newsletterLabel.textContent = copy.newsletterLabel;
    }
    if (newsletterButton) {
      newsletterButton.textContent = copy.newsletterButton;
    }

    document.querySelectorAll('.filter-btn[data-filter]').forEach(function (button) {
      var filter = button.getAttribute('data-filter');
      if (copy.filters[filter]) {
        button.textContent = copy.filters[filter];
      }
    });

    document.querySelectorAll('.blog-item').forEach(function (item) {
      var category = item.getAttribute('data-category');
      var catNode = item.querySelector('.blog-card-cat');
      if (catNode && copy.categoryLabels[category]) {
        catNode.textContent = copy.categoryLabels[category];
      }
    });

    document.querySelectorAll('[data-blog-read-label]').forEach(function (node) {
      node.textContent = copy.readMore;
    });
  }

  function initAos() {
    if (typeof window.AOS === 'undefined') {
      return;
    }
    window.AOS.init({
      duration: 600,
      once: true
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

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setFeedback(feedbackEl, type, message) {
    if (!feedbackEl) {
      return;
    }

    feedbackEl.classList.remove('success', 'error');
    if (type) {
      feedbackEl.classList.add(type);
    }
    feedbackEl.textContent = message;
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

  function loadRuntimeSecurityConfig() {
    if (runtimeSecurityConfigPromise) {
      return runtimeSecurityConfigPromise;
    }

    runtimeSecurityConfigPromise = fetch('/api/public-config', {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      cache: 'no-store'
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.json();
      })
      .then(function (config) {
        if (config && typeof config.requireTurnstile === 'boolean') {
          REQUIRE_TURNSTILE = config.requireTurnstile;
        }

        if (!TURNSTILE_SITE_KEY && config && typeof config.turnstileSiteKey === 'string') {
          TURNSTILE_SITE_KEY = config.turnstileSiteKey.trim();
        }

        if (config && typeof config.turnstileAction === 'string' && config.turnstileAction.trim()) {
          TURNSTILE_ACTION = config.turnstileAction.trim();
        }

        return config;
      })
      .catch(function () {
        return null;
      });

    return runtimeSecurityConfigPromise;
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

  function initNewsletterForms() {
    var forms = document.querySelectorAll('[data-newsletter-form]');
    if (!forms.length) {
      return;
    }

    forms.forEach(function (form) {
      loadRuntimeSecurityConfig().then(function () {
        return loadTurnstileScript();
      }).then(function (loaded) {
        if (loaded) {
          attachTurnstileWidget(form);
        }
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();

        var copy = getCopy();

        var emailInput = form.querySelector('input[name="email"]');
        var submitBtn = form.querySelector('button[type="submit"]');
        var feedbackEl = form.parentElement.querySelector('[data-newsletter-feedback]');
        var source = form.getAttribute('data-source') || 'blog';
        var emailValue = emailInput ? emailInput.value.trim().toLowerCase() : '';

        if (!isValidEmail(emailValue)) {
          setFeedback(feedbackEl, 'error', copy.newsletterInvalidEmail);
          return;
        }

        var captchaToken = getTurnstileToken(form);
        if (REQUIRE_TURNSTILE && !TURNSTILE_SITE_KEY) {
          setFeedback(feedbackEl, 'error', 'Security configuration is not ready. Please try again shortly.');
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
        setFeedback(feedbackEl, '', copy.newsletterLoading);

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
            language: document.documentElement.lang || 'ar',
            captchaToken: captchaToken
          })
        })
          .then(function (response) {
            if (!response.ok) {
              return response
                .json()
                .catch(function () {
                  return {};
                })
                .then(function (payload) {
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
            setFeedback(feedbackEl, 'success', (payload && payload.message) || copy.newsletterSuccess);
          })
          .catch(function (err) {
            if (err && err.message) {
              setFeedback(feedbackEl, 'error', err.message);
              return;
            }

            window.location.href = buildMailtoFallback(emailValue, source);
            setFeedback(feedbackEl, 'error', copy.newsletterFallbackSuccess);
          })
          .finally(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
            }
          });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (ensureBlogRouteLanguage(getCurrentLanguage())) {
      return;
    }

    applyBlogIndexLanguage();
    initAos();
    initBlogCategoryFilter();
    initCopyShareButton();
    initNewsletterForms();

    window.addEventListener('gocloud:language-change', function (event) {
      var language = event && event.detail ? event.detail.language : null;
      if (language === 'ar' || language === 'en') {
        if (ensureBlogRouteLanguage(language)) {
          return;
        }
      }
      applyBlogIndexLanguage();
    });
  });
})();
