document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-faq-page]');
  if (!root) {
    return;
  }

  const ui = {
    ar: {
      badge: 'الأسئلة الشائعة',
      title: 'إجابات واضحة قبل أن تبدأ مشروعك',
      subtitle:
        'صفحة FAQ مصممة لتختصر وقت القرار وتمنح الزائر إجابات دقيقة حول أودو، الشريك المناسب، وخدمات GoCloud Elite المتقدمة.',
      searchLabel: 'ابحث داخل الأسئلة',
      searchPlaceholder: 'اكتب كلمة مثل: التراخيص، الشريك، الاستضافة...',
      categoryHelper: 'اختر القسم المناسب أو ابحث مباشرة داخل الأسئلة.',
      noResults: 'لم يتم العثور على نتائج مطابقة. جرّب كلمة بحث أخرى أو انتقل إلى القسم الآخر.',
      loading: 'جاري تحميل الأسئلة الشائعة...',
      error: 'تعذر تحميل الأسئلة الشائعة حالياً. يمكنك التواصل معنا مباشرة وسنساعدك سريعاً.',
      odooCardTitle: 'أسئلة أودو الشائعة',
      odooCardText: 'إجابات حول Community وEnterprise والتسعير ودور الشريك.',
      eliteCardTitle: 'أسئلة GoCloud Elite',
      eliteCardText: 'إجابات حول الاستضافة المتقدمة والبيئات المعزولة واستلام المشاريع المتعثرة.',
      consultationTitle: 'هل تحتاج إجابة مرتبطة بحالتك الفعلية؟',
      consultationText:
        'إذا كانت لديك متطلبات خاصة أو مشروع قائم يحتاج مراجعة، يمكن لفريق GoCloud تقديم توصية عملية مبنية على واقع أعمالك.',
      consultationPrimary: 'احجز استشارة',
      consultationSecondary: 'تواصل عبر واتساب',
      newsletterTag: 'نشرة FAQ من GoCloud',
      newsletterTitle: 'اشترك لتصلك آخر التحديثات العملية',
      newsletterText:
        'تابع أحدث أسئلة Odoo وخدمات GoCloud Elite والنصائح المختصرة التي تساعدك على اتخاذ قرارات أسرع.',
      newsletterLabel: 'البريد الإلكتروني',
      newsletterButton: 'اشترك الآن'
    },
    en: {
      badge: 'Frequently Asked Questions',
      title: 'Clear Answers Before You Start Your Project',
      subtitle:
        'This FAQ page is designed to shorten decision time and give visitors precise answers about Odoo, the right partner model, and advanced GoCloud Elite services.',
      searchLabel: 'Search the FAQ',
      searchPlaceholder: 'Type a keyword like: licensing, partner, hosting...',
      categoryHelper: 'Choose the relevant category or search directly inside the questions.',
      noResults: 'No matching results were found. Try another keyword or switch to the other category.',
      loading: 'Loading frequently asked questions...',
      error: 'The FAQ could not be loaded right now. Contact us directly and we will help you quickly.',
      odooCardTitle: 'Odoo FAQ',
      odooCardText: 'Answers about Community vs Enterprise, pricing, and the partner role.',
      eliteCardTitle: 'GoCloud Elite FAQ',
      eliteCardText: 'Answers about advanced hosting, isolated environments, and rescue takeovers.',
      consultationTitle: 'Need an answer tailored to your real case?',
      consultationText:
        'If you have special requirements or an existing project that needs review, GoCloud can provide a practical recommendation based on your actual operations.',
      consultationPrimary: 'Book a Consultation',
      consultationSecondary: 'Chat on WhatsApp',
      newsletterTag: 'GoCloud FAQ Bulletin',
      newsletterTitle: 'Subscribe for Practical Updates',
      newsletterText:
        'Get the latest Odoo questions, GoCloud Elite service insights, and concise tips to help you make faster decisions.',
      newsletterLabel: 'Email address',
      newsletterButton: 'Subscribe Now'
    }
  };

  const state = {
    lang: document.documentElement.lang === 'en' ? 'en' : 'ar',
    category: 'odoo',
    query: '',
    data: null,
    openItemId: null
  };

  const badge = document.querySelector('[data-faq-badge]');
  const title = document.querySelector('[data-faq-title]');
  const subtitle = document.querySelector('[data-faq-subtitle]');
  const helper = root.querySelector('[data-faq-helper]');
  const searchLabel = root.querySelector('[data-faq-search-label]');
  const searchInput = root.querySelector('[data-faq-search]');
  const langButtons = Array.from(root.querySelectorAll('[data-faq-lang]'));
  const categoryButtons = Array.from(root.querySelectorAll('[data-faq-category]'));
  const accordion = root.querySelector('[data-faq-accordion]');
  const emptyState = root.querySelector('[data-faq-empty]');
  const status = root.querySelector('[data-faq-status]');
  const quickOdooTitle = root.querySelector('[data-faq-card-title="odoo"]');
  const quickOdooText = root.querySelector('[data-faq-card-text="odoo"]');
  const quickEliteTitle = root.querySelector('[data-faq-card-title="elite"]');
  const quickEliteText = root.querySelector('[data-faq-card-text="elite"]');
  const consultationTitle = root.querySelector('[data-faq-consultation-title]');
  const consultationText = root.querySelector('[data-faq-consultation-text]');
  const consultationPrimary = root.querySelector('[data-faq-consultation-primary]');
  const consultationSecondary = root.querySelector('[data-faq-consultation-secondary]');
  const newsletterTag = document.querySelector('[data-faq-newsletter-tag]');
  const newsletterTitle = document.querySelector('[data-faq-newsletter-title]');
  const newsletterText = document.querySelector('[data-faq-newsletter-text]');
  const newsletterLabel = document.querySelector('[data-faq-newsletter-label]');
  const newsletterButton = document.querySelector('[data-faq-newsletter-button]');

  const getCategoryById = categoryId => {
    if (!state.data) {
      return null;
    }
    return state.data.categories.find(category => category.id === categoryId) || null;
  };

  const getVisibleItems = () => {
    const category = getCategoryById(state.category);
    if (!category) {
      return [];
    }

    const query = state.query.trim().toLowerCase();
    if (!query) {
      return category.items;
    }

    return category.items.filter(item => {
      const question = item.question[state.lang].toLowerCase();
      const answer = item.answer[state.lang].toLowerCase();
      return question.includes(query) || answer.includes(query);
    });
  };

  const updateHash = hash => {
    window.history.replaceState(null, '', `#${hash}`);
  };

  const syncChrome = () => {
    const copy = ui[state.lang];
    root.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', state.lang);
    root.classList.toggle('is-en', state.lang === 'en');
    root.classList.toggle('is-ar', state.lang === 'ar');
    document.title =
      state.lang === 'ar'
        ? 'الأسئلة الشائعة | GoCloud'
        : 'FAQ | GoCloud';

    if (badge) {
      badge.textContent = copy.badge;
    }
    if (title) {
      title.textContent = copy.title;
    }
    if (subtitle) {
      subtitle.textContent = copy.subtitle;
    }
    if (helper) {
      helper.textContent = copy.categoryHelper;
    }
    if (searchLabel) {
      searchLabel.textContent = copy.searchLabel;
    }
    if (searchInput) {
      searchInput.placeholder = copy.searchPlaceholder;
    }
    if (emptyState) {
      emptyState.textContent = copy.noResults;
    }
    if (quickOdooTitle) {
      quickOdooTitle.textContent = copy.odooCardTitle;
    }
    if (quickOdooText) {
      quickOdooText.textContent = copy.odooCardText;
    }
    if (quickEliteTitle) {
      quickEliteTitle.textContent = copy.eliteCardTitle;
    }
    if (quickEliteText) {
      quickEliteText.textContent = copy.eliteCardText;
    }
    if (consultationTitle) {
      consultationTitle.textContent = copy.consultationTitle;
    }
    if (consultationText) {
      consultationText.textContent = copy.consultationText;
    }
    if (consultationPrimary) {
      consultationPrimary.textContent = copy.consultationPrimary;
    }
    if (consultationSecondary) {
      consultationSecondary.textContent = copy.consultationSecondary;
    }
    if (newsletterTag) {
      newsletterTag.innerHTML = `<i class="fas fa-bell"></i> ${copy.newsletterTag}`;
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

    langButtons.forEach(button => {
      const isActive = button.dataset.faqLang === state.lang;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    if (state.data) {
      categoryButtons.forEach(button => {
        const category = getCategoryById(button.dataset.faqCategory || 'odoo');
        const isActive = button.dataset.faqCategory === state.category;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
        if (category) {
          button.textContent = category.label[state.lang];
        }
      });
    }
  };

  const renderSchema = items => {
    let schema = document.getElementById('faq-schema');
    if (!schema) {
      schema = document.createElement('script');
      schema.type = 'application/ld+json';
      schema.id = 'faq-schema';
      document.head.appendChild(schema);
    }

    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: state.lang,
      mainEntity: items.map(item => ({
        '@type': 'Question',
        name: item.question[state.lang],
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer[state.lang]
        }
      }))
    });
  };

  const renderAccordion = () => {
    if (!accordion || !state.data) {
      return;
    }

    const items = getVisibleItems();
    const activeCategory = getCategoryById(state.category);

    if (status && activeCategory) {
      status.textContent = activeCategory.intro[state.lang];
    }

    if (!items.length) {
      accordion.innerHTML = '';
      if (emptyState) {
        emptyState.hidden = false;
      }
      renderSchema([]);
      return;
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    if (!state.openItemId || !items.some(item => item.id === state.openItemId)) {
      state.openItemId = items[0].id;
    }

    accordion.innerHTML = items
      .map(item => {
        const isOpen = item.id === state.openItemId;
        return `
          <article class="faq-item ${isOpen ? 'active' : ''}" id="${item.id}">
            <button class="faq-question" type="button" aria-expanded="${isOpen}" aria-controls="panel-${item.id}">
              <span>${item.question[state.lang]}</span>
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
            </button>
            <div class="faq-answer" id="panel-${item.id}" style="max-height:${isOpen ? '320px' : '0px'}">
              <div class="faq-answer-inner">${item.answer[state.lang]}</div>
            </div>
          </article>
        `;
      })
      .join('');

    Array.from(accordion.querySelectorAll('.faq-item')).forEach(item => {
      const trigger = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      if (!trigger || !answer) {
        return;
      }
      if (item.id === state.openItemId) {
        answer.style.maxHeight = `${answer.scrollHeight}px`;
      }
      trigger.addEventListener('click', () => {
        const isOpen = state.openItemId === item.id;
        state.openItemId = isOpen ? null : item.id;
        if (!isOpen) {
          updateHash(item.id);
        } else {
          updateHash(state.category);
        }
        renderAccordion();
      });
    });

    renderSchema(items);
  };

  const applyHash = () => {
    const hash = window.location.hash.replace('#', '');
    if (!hash || !state.data) {
      return false;
    }

    const category = getCategoryById(hash);
    if (category) {
      state.category = category.id;
      state.openItemId = category.items[0] ? category.items[0].id : null;
      return true;
    }

    for (const itemCategory of state.data.categories) {
      const item = itemCategory.items.find(entry => entry.id === hash);
      if (item) {
        state.category = itemCategory.id;
        state.openItemId = item.id;
        return true;
      }
    }

    return false;
  };

  const loadFaqData = async () => {
    if (status) {
      status.textContent = ui[state.lang].loading;
    }

    const response = await fetch('data/faq-content.json', {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load FAQ data: ${response.status}`);
    }

    state.data = await response.json();
    applyHash();
    syncChrome();
    renderAccordion();
  };

  langButtons.forEach(button => {
    button.addEventListener('click', () => {
      state.lang = button.dataset.faqLang || 'ar';
      syncChrome();
      renderAccordion();
    });
  });

  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      state.category = button.dataset.faqCategory || 'odoo';
      state.openItemId = null;
      updateHash(state.category);
      syncChrome();
      renderAccordion();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      state.query = event.target.value;
      state.openItemId = null;
      renderAccordion();
    });
  }

  window.addEventListener('hashchange', () => {
    if (applyHash()) {
      syncChrome();
      renderAccordion();
    }
  });

  // Keep FAQ-local language UI synchronized with global site language toggles.
  window.addEventListener('gocloud:language-change', event => {
    const language = event && event.detail ? event.detail.language : null;
    if (language !== 'ar' && language !== 'en') {
      return;
    }
    if (state.lang === language) {
      return;
    }
    state.lang = language;
    syncChrome();
    renderAccordion();
  });

  syncChrome();
  loadFaqData().catch(() => {
    if (status) {
      status.textContent = ui[state.lang].error;
    }
    if (emptyState) {
      emptyState.hidden = true;
    }
  });
});
