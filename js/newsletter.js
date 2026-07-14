(function () {
  'use strict';

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
            language: document.documentElement.lang || 'en'
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
            setFeedback(feedbackEl, 'success', 'Subscribed successfully. Thank you.');
          })
          .catch(function () {
            window.location.href = buildMailtoFallback(emailValue, source);
            setFeedback(
              feedbackEl,
              'success',
              'Your email app was opened to confirm subscription. Please send the message.'
            );
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
    initNewsletterForms();
  });
})();
