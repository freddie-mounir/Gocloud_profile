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
      newsletterSuccess: 'تم الاشتراك بنجاح. شكراً لك!',
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
      newsletterSuccess: 'Subscription successful. Thank you!',
      newsletterFallbackSuccess: 'Your mail app is open to send the subscription request. Please confirm sending from your mail app.'
    }
  };

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

  function initNewsletterForms() {
    var forms = document.querySelectorAll('[data-newsletter-form]');
    if (!forms.length) {
      return;
    }

    forms.forEach(function (form) {
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
            language: document.documentElement.lang || 'ar'
          })
        })
          .then(function (response) {
            if (!response.ok) {
              throw new Error('Subscription failed');
            }
            return response.json();
          })
          .then(function () {
            if (emailInput) {
              emailInput.value = '';
            }
            setFeedback(feedbackEl, 'success', copy.newsletterSuccess);
          })
          .catch(function () {
            window.location.href = buildMailtoFallback(emailValue, source);
            setFeedback(feedbackEl, 'success', copy.newsletterFallbackSuccess);
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
