'use strict';

const fs = require('fs');
const path = require('path');

let dotenv = null;
let nodemailer = null;

const ROOT = path.resolve(__dirname, '..');
const SMTP_HELPER = require('./newsletter-smtp');
const TOKEN_HELPER = require('./newsletter-preferences-token');

function loadModule(moduleName) {
  try {
    const resolvedPath = require.resolve(moduleName, { paths: [path.join(ROOT, 'api')] });
    return require(resolvedPath);
  } catch (error) {
    try {
      return require(moduleName);
    } catch (fallbackError) {
      return null;
    }
  }
}

try {
  dotenv = loadModule('dotenv');
} catch (error) {
  dotenv = null;
}

try {
  nodemailer = loadModule('nodemailer');
} catch (error) {
  nodemailer = null;
}
const DATA_DIR = path.join(ROOT, 'data');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const NEWSLETTER_DIR = path.join(ROOT, 'docs', 'newsletter-campaign');
const CALENDAR_PATH = path.join(DATA_DIR, 'newsletter', 'calendar.json');
const DEFAULT_OUTPUT_FILE = path.join(NEWSLETTER_DIR, 'campaign-plan.json');
const SUBSCRIBERS_PATH = path.join(ROOT, 'api', 'newsletter-subscribers.json');
const DISPATCH_LOG_PATH = path.join(NEWSLETTER_DIR, 'dispatch-log.json');
const CONFIRMED_STATUS = 'Confirmed / Active';
const PREFERENCES_URL_BASE = process.env.NEWSLETTER_PREFERENCES_URL || 'https://www.gocloudeg.com/api/newsletter/preferences';
const UNSUBSCRIBE_URL_BASE = process.env.NEWSLETTER_UNSUBSCRIBE_URL || 'https://www.gocloudeg.com/api/newsletter/unsubscribe';
const PREFERENCES_TOKEN_SECRET = process.env.NEWSLETTER_PREFERENCES_SECRET || process.env.SMTP_PASS || 'newsletter-secret';
const PREF_URL_PLACEHOLDER = '__GC_PREF_URL__';
const UNSUB_URL_PLACEHOLDER = '__GC_UNSUB_URL__';

function toUtmSafe(value, fallback) {
  const normalized = String(value || fallback || 'newsletter')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback || 'newsletter';
}

function withUtmParams(rawUrl, params) {
  try {
    const url = new URL(String(rawUrl || '').trim());
    for (const [key, value] of Object.entries(params || {})) {
      if (value) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  } catch (error) {
    return rawUrl;
  }
}

function buildRecipientLinks(subscriber, entryId, languageMode) {
  const email = String(subscriber?.email || '').trim().toLowerCase();
  const token = TOKEN_HELPER.createPreferencesToken(email, PREFERENCES_TOKEN_SECRET);
  const campaign = toUtmSafe(entryId || 'newsletter', 'newsletter');
  const content = toUtmSafe(languageMode || 'bilingual', 'bilingual');

  const preferencesUrl = withUtmParams(`${PREFERENCES_URL_BASE}?token=${encodeURIComponent(token)}`, {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: campaign,
    utm_content: `preferences-${content}`
  });

  const unsubscribeUrl = withUtmParams(`${UNSUBSCRIBE_URL_BASE}?token=${encodeURIComponent(token)}`, {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: campaign,
    utm_content: `unsubscribe-${content}`
  });

  return {
    preferencesUrl,
    unsubscribeUrl
  };
}

function applyRecipientLinks(content, links) {
  if (!content) {
    return content;
  }

  const source = String(content);
  return source
    .split(PREF_URL_PLACEHOLDER)
    .join(links.preferencesUrl)
    .split(UNSUB_URL_PLACEHOLDER)
    .join(links.unsubscribeUrl);
}

function normalizeFrequency(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'bi-weekly' || normalized === 'monthly' || normalized === 'paused') {
    return normalized;
  }
  return 'bi-weekly';
}

function getSubscriberLastSentAt(logEntries, email) {
  let latest = 0;
  for (const batch of logEntries || []) {
    const sentAt = Date.parse(batch.sentAt || '');
    if (!Number.isFinite(sentAt)) {
      continue;
    }

    const hasRecipient = Array.isArray(batch.results)
      && batch.results.some(result => String(result.email || '').toLowerCase() === String(email || '').toLowerCase());

    if (hasRecipient && sentAt > latest) {
      latest = sentAt;
    }
  }

  return latest > 0 ? latest : null;
}

function shouldSendForFrequency(subscriber, logEntries) {
  const frequency = normalizeFrequency(subscriber?.frequency);
  if (frequency === 'paused') {
    return false;
  }

  const lastSentAt = getSubscriberLastSentAt(logEntries, subscriber?.email);
  if (!lastSentAt) {
    return true;
  }

  const elapsedMs = Date.now() - lastSentAt;
  const dayMs = 24 * 60 * 60 * 1000;

  if (frequency === 'weekly') {
    return elapsedMs >= 6 * dayMs;
  }
  if (frequency === 'monthly') {
    return elapsedMs >= 27 * dayMs;
  }

  return elapsedMs >= 13 * dayMs;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadEnvironmentFiles() {
  const candidates = [
    path.join(ROOT, 'api', '.env'),
    path.join(ROOT, '.env'),
    path.join(ROOT, 'api', '.env.example'),
    path.join(ROOT, '.env.example')
  ];

  for (const candidate of candidates) {
    const parsed = parseEnvFile(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof process.env[key] === 'undefined' || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }

  if (dotenv) {
    dotenv.config({ path: path.join(ROOT, 'api', '.env') });
    dotenv.config({ path: path.join(ROOT, '.env') });
  }
}

loadEnvironmentFiles();

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function getPostFilePath(slug) {
  const candidates = [
    path.join(POSTS_DIR, `${slug}.json`),
    path.join(POSTS_DIR, `${slug}.md`),
    path.join(POSTS_DIR, `${slug}.html`)
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalizedValue(value, locale) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  if (typeof value[locale] === 'string' && value[locale].trim()) {
    return value[locale];
  }

  if (typeof value.en === 'string' && value.en.trim()) {
    return value.en;
  }

  if (typeof value.ar === 'string' && value.ar.trim()) {
    return value.ar;
  }

  return '';
}

function hasArabicText(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

function extractBodyInnerHtml(html) {
  const source = String(html || '');
  const match = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : source;
}

function resolveArabicText(value, fallback) {
  const normalized = String(value || '').trim();
  if (normalized && hasArabicText(normalized)) {
    return normalized;
  }
  return fallback;
}

function isWelcomeEntry(entry) {
  return String(entry?.id || '').trim().toLowerCase() === 'welcome-gocloud';
}

function buildWelcomeSingleLanguageEmail(entry, locale) {
  const isArabic = locale === 'ar';
  const utmCampaign = toUtmSafe(entry.id || 'welcome-gocloud', 'welcome-gocloud');
  const utmContent = toUtmSafe(`welcome-${locale}`, 'welcome-en');
  const articleUrl = withUtmParams(entry.ctaUrl || 'https://www.gocloudeg.com/blog/why-odoo-erp.html', {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: utmCampaign,
    utm_content: `welcome-guide-${utmContent}`
  });
  const servicesUrl = withUtmParams('https://www.gocloudeg.com/odoo-services.html', {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: utmCampaign,
    utm_content: `welcome-services-${utmContent}`
  });
  const contactUrl = withUtmParams('https://www.gocloudeg.com/contact.html', {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: utmCampaign,
    utm_content: `welcome-contact-${utmContent}`
  });

  const subject = isArabic
    ? 'مرحبًا بك في GoCloud | بداية عملية للتحول الرقمي'
    : (entry.subjectOptions && entry.subjectOptions[0]) || 'Welcome to GoCloud: practical insights for smarter growth';
  const preview = isArabic
    ? 'شكرًا لتأكيد الاشتراك. هذه بداية عملية ومفيدة لتطوير أعمالك.'
    : (entry.previewText || 'Thanks for confirming. Here is what you will get from GoCloud and where to start.');
  const greeting = isArabic ? 'مرحبًا بك,' : 'Welcome,';
  const intro = isArabic
    ? 'يسعدنا انضمامك إلى مجتمع GoCloud. هدفنا أن نقدم لك محتوى عملي يساعدك على اتخاذ قرارات أوضح في ERP والتحول الرقمي.'
    : 'We are glad to have you with GoCloud. Our goal is to share practical insights that help you make better ERP and digital transformation decisions.';
  const blockTitle = isArabic ? 'ماذا ستحصل عليه من هذه النشرة؟' : 'What you will get from this newsletter';
  const bulletOne = isArabic ? 'تحليلات قصيرة قابلة للتنفيذ وليست محتوى نظري.' : 'Short, actionable insights instead of generic theory.';
  const bulletTwo = isArabic ? 'أفضل ممارسات واقعية من مشاريع ERP والتحول الرقمي.' : 'Real implementation lessons from ERP and transformation projects.';
  const bulletThree = isArabic ? 'أدلة عملية تساعدك في التخطيط والتنفيذ بثقة.' : 'Practical guides that support planning and confident execution.';
  const startTitle = isArabic ? 'ابدأ من هنا' : 'Start here';
  const startBody = isArabic
    ? 'هذه المقالة التمهيدية تعطيك صورة واضحة عن الخطوة الأولى المناسبة.'
    : 'This starter article gives a clear baseline for your first practical step.';
  const primaryCtaLabel = isArabic ? 'ابدأ بالدليل العملي' : 'Start with the practical guide';
  const secondaryCtaLabel = isArabic ? 'استكشف خدمات GoCloud' : 'Explore GoCloud services';
  const tertiaryCtaLabel = isArabic ? 'احجز استشارة سريعة' : 'Book a quick consultation';
  const preferencesUrl = PREF_URL_PLACEHOLDER;
  const unsubscribeUrl = UNSUB_URL_PLACEHOLDER;
  const preferencesLabel = isArabic ? 'إدارة التفضيلات' : 'Manage preferences';
  const unsubscribeLabel = isArabic ? 'إلغاء الاشتراك' : 'Unsubscribe';
  const closing = isArabic ? 'مع أطيب التحيات,' : 'Best regards,';
  const signature = isArabic ? 'فريق GoCloud' : 'GoCloud Team';

  const textLines = [
    greeting,
    '',
    intro,
    '',
    blockTitle,
    `- ${bulletOne}`,
    `- ${bulletTwo}`,
    `- ${bulletThree}`,
    '',
    `${startTitle}:`,
    startBody,
    articleUrl,
    '',
    `${isArabic ? 'الخدمات:' : 'Services:'}`,
    servicesUrl,
    '',
    `${isArabic ? 'الاستشارة:' : 'Consultation:'}`,
    contactUrl,
    '',
    `${isArabic ? 'إدارة التفضيلات:' : 'Manage preferences:'}`,
    preferencesUrl,
    '',
    `${isArabic ? 'إلغاء الاشتراك:' : 'Unsubscribe:'}`,
    unsubscribeUrl,
    '',
    closing,
    signature,
    'marketing@gocloudeg.com'
  ];

  const html = `<!doctype html>
<html lang="${locale}" dir="${isArabic ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f7fb;">${escapeHtml(preview)}</div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f5f7fb;padding:0;margin:0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:700px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0E38B1 0%,#113ADC 100%);padding:30px 34px;border-radius:18px 18px 0 0;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.92;">GoCloud Newsletter</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;">${escapeHtml(isArabic ? 'مرحبًا بك في GoCloud' : 'Welcome to GoCloud')}</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:0.92;">${escapeHtml(isArabic ? 'بداية عملية لمحتوى مفيد وقابل للتنفيذ' : 'A practical start to useful, actionable content')}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 34px 24px;border-left:1px solid #e8edf7;border-right:1px solid #e8edf7;">
                <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
                <div style="background:#f8fbff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin:0 0 18px;">
                  <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">${escapeHtml(blockTitle)}</p>
                  <ul style="margin:0;padding-${isArabic ? 'right' : 'left'}:20px;color:#334155;line-height:1.8;">
                    <li>${escapeHtml(bulletOne)}</li>
                    <li>${escapeHtml(bulletTwo)}</li>
                    <li>${escapeHtml(bulletThree)}</li>
                  </ul>
                </div>
                <div style="background:linear-gradient(135deg,#eef4ff 0%,#f8fbff 100%);border:1px solid #dbe7ff;border-radius:14px;padding:16px 18px;margin:0 0 18px;">
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#0E38B1;font-weight:700;">${escapeHtml(startTitle)}</p>
                  <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(startBody)}</p>
                  <p style="margin:0 0 10px;"><a href="${articleUrl}" style="display:inline-block;background:#0E38B1;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;font-size:14px;">${escapeHtml(primaryCtaLabel)}</a></p>
                  <p style="margin:0 0 10px;"><a href="${servicesUrl}" style="display:inline-block;background:#ffffff;color:#0E38B1;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid #0E38B1;">${escapeHtml(secondaryCtaLabel)}</a></p>
                  <p style="margin:0;"><a href="${contactUrl}" style="display:inline-block;background:#ffffff;color:#1f2937;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid #d1d5db;">${escapeHtml(tertiaryCtaLabel)}</a></p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fbff;padding:20px 34px 30px;border:1px solid #e8edf7;border-top:0;border-radius:0 0 18px 18px;">
                <p style="margin:0 0 4px;color:#64748b;font-size:13px;line-height:1.6;">${escapeHtml(closing)}</p>
                <p style="margin:0;font-weight:700;color:#0f172a;font-size:14px;">${escapeHtml(signature)}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#64748b;line-height:1.6;"><a href="https://www.gocloudeg.com" style="color:#0E38B1;text-decoration:none;">www.gocloudeg.com</a> • <a href="mailto:marketing@gocloudeg.com" style="color:#0E38B1;text-decoration:none;">marketing@gocloudeg.com</a></p>
                <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6;"><a href="${preferencesUrl}" style="color:#0E38B1;text-decoration:none;">${escapeHtml(preferencesLabel)}</a> • <a href="${unsubscribeUrl}" style="color:#0E38B1;text-decoration:none;">${escapeHtml(unsubscribeLabel)}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    previewText: preview,
    bodyText: textLines.join('\n'),
    bodyHtml: html
  };
}

function buildWelcomeBilingualEmail(entry) {
  const english = buildWelcomeSingleLanguageEmail(entry, 'en');
  const arabic = buildWelcomeSingleLanguageEmail(entry, 'ar');

  return {
    subject: `${(entry.subjectOptions && entry.subjectOptions[0]) || 'Welcome to GoCloud: practical insights for smarter growth'} | GoCloud`,
    previewText: english.previewText,
    bodyText: ['English', '', english.bodyText, '', 'العربية', '', arabic.bodyText].join('\n'),
    bodyHtml: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml((entry.subjectOptions && entry.subjectOptions[0]) || entry.title || 'Welcome to GoCloud')}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f7fb;">${escapeHtml('Welcome to GoCloud in English and Arabic')}</div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f5f7fb;padding:0;margin:0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:760px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:#ffffff;padding:14px;border:1px solid #e8edf7;border-radius:18px;">${extractBodyInnerHtml(english.bodyHtml)}</td>
            </tr>
            <tr><td style="height:14px;"></td></tr>
            <tr>
              <td style="background:#ffffff;padding:14px;border:1px solid #e8edf7;border-radius:18px;" dir="rtl">${extractBodyInnerHtml(arabic.bodyHtml)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}

function buildSingleLanguageEmail(entry, post, locale) {
  if (isWelcomeEntry(entry)) {
    return buildWelcomeSingleLanguageEmail(entry, locale);
  }

  const isArabic = locale === 'ar';
  const rawTitle = getLocalizedValue(post.title, locale) || entry.title;
  const rawPreview = entry.previewText || getLocalizedValue(post.excerpt, locale) || '';
  const title = isArabic
    ? resolveArabicText(rawTitle, 'رؤية عملية لتحسين كفاءة أنظمة الأعمال')
    : rawTitle;
  const preview = isArabic
    ? resolveArabicText(rawPreview, 'نعرض لك رؤية عملية تساعد فريقك على تقليل التكاليف ورفع الكفاءة.')
    : rawPreview;
  const utmCampaign = toUtmSafe(entry.id || 'newsletter', 'newsletter');
  const utmContent = toUtmSafe(locale || 'en', 'en');
  const articleUrl = withUtmParams(entry.ctaUrl || 'https://www.gocloudeg.com/blog/', {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: utmCampaign,
    utm_content: `cta-${utmContent}`
  });
  const ctaLabel = isArabic
    ? resolveArabicText(entry.ctaLabel, 'اقرأ المقال بالكامل')
    : (entry.ctaLabel || 'Read the full article');
  const preferredSubject = entry.subjectOptions && entry.subjectOptions[0]
    ? entry.subjectOptions[0]
    : (isArabic ? 'تحديثات عملية من GoCloud' : 'Practical updates from GoCloud');
  const personalizedSubject = isArabic
    ? resolveArabicText(preferredSubject, 'تحديثات عملية من GoCloud')
    : preferredSubject;

  const greeting = isArabic ? 'مرحبًا,' : 'Hello,';
  const localizedTheme = isArabic
    ? resolveArabicText(entry.theme, 'تطوير الأنظمة المؤسسية والتحول الرقمي')
    : entry.theme.toLowerCase();
  const intro = isArabic
    ? `هذا الأسبوع نشارك لك منظورًا عمليًا حول ${localizedTheme}.`
    : `This week we are sharing a practical perspective on ${localizedTheme}.`;
  const featured = isArabic ? 'الموضوع المميز' : 'Featured topic';
  const closing = isArabic ? 'مع أطيب التحيات,' : 'Best regards,';
  const signature = isArabic ? 'فريق GoCloud' : 'GoCloud Team';
  const supportText = isArabic
    ? 'إذا أردت توصية مخصصة حسب احتياجك، يسعدنا ترتيب استشارة عملية لك.'
    : 'If you would like a tailored recommendation for your business, we would be happy to arrange a consultation.';
  const preheader = isArabic
    ? `مقال جديد من GoCloud: ${title}`
    : `New GoCloud insight: ${title}`;
  const footerLine = isArabic
    ? 'تحويل رقمي • ERP • سحابة • أتمتة'
    : 'Digital transformation • ERP • Cloud • Automation';
  const ctaTitle = isArabic ? 'هل تحتاج إلى خطة شخصية؟' : 'Need a tailored plan?';
  const ctaBody = isArabic
    ? 'نساعدك في اختيار الخطوة التالية بثقة ومنطق عملي.'
    : 'We can help you identify the right next step with clarity and practical guidance.';
  const ctaLink = isArabic ? 'اطلب استشارة' : 'Book a consultation';
  const preferencesUrl = PREF_URL_PLACEHOLDER;
  const unsubscribeUrl = UNSUB_URL_PLACEHOLDER;
  const preferencesLabel = isArabic ? 'إدارة تفضيلاتك' : 'Manage preferences';
  const unsubscribeLabel = isArabic ? 'إلغاء الاشتراك' : 'Unsubscribe';
  const socialPrefix = isArabic ? 'تابعنا:' : 'Follow us:';
  const socialLinks = [
    `<a href="${withUtmParams('https://www.linkedin.com/company/gocloud-co', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: `linkedin-${utmContent}` })}" style="color:#0E38B1;text-decoration:none;">LinkedIn</a>`,
    `<a href="${withUtmParams('https://www.youtube.com/@GoCloudeg', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: `youtube-${utmContent}` })}" style="color:#0E38B1;text-decoration:none;">YouTube</a>`,
    `<a href="${withUtmParams('https://www.facebook.com/GoCloudEg/', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: `facebook-${utmContent}` })}" style="color:#0E38B1;text-decoration:none;">Facebook</a>`
  ].join(' • ');

  const textLines = [
    greeting,
    '',
    intro,
    '',
    `${featured}: ${title}`,
    '',
    preview,
    '',
    isArabic ? 'اقرأ المقال بالكامل هنا:' : 'Read the full article here:',
    articleUrl,
    '',
    supportText,
    '',
    isArabic ? 'إدارة التفضيلات:' : 'Manage preferences:',
    preferencesUrl,
    '',
    isArabic ? 'إلغاء الاشتراك:' : 'Unsubscribe:',
    unsubscribeUrl,
    '',
    closing,
    signature,
    'marketing@gocloudeg.com'
  ];

  const html = `<!doctype html>
<html lang="${locale}" dir="${isArabic ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(entry.subjectOptions[0] || entry.title)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f7fb;">${escapeHtml(preheader)}</div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f5f7fb;padding:0;margin:0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:700px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0E38B1 0%,#113ADC 100%);padding:30px 34px;border-radius:18px 18px 0 0;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.92;">GoCloud Newsletter</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;">${escapeHtml(isArabic ? 'نشرة GoCloud' : 'GoCloud Newsletter')}</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:0.92;">${escapeHtml(isArabic ? 'رؤى عملية ومحتوى عملي لقيادة التحول الرقمي' : 'Practical insights for smarter digital transformation')}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 34px 24px;border-left:1px solid #e8edf7;border-right:1px solid #e8edf7;">
                <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
                <div style="background:#f8fbff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin:0 0 18px;">
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">${escapeHtml(featured)}</p>
                  <h2 style="margin:0 0 8px;font-size:21px;line-height:1.35;color:#0f172a;">${escapeHtml(title)}</h2>
                  <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">${escapeHtml(preview)}</p>
                </div>
                <div style="background:linear-gradient(135deg,#eef4ff 0%,#f8fbff 100%);border:1px solid #dbe7ff;border-radius:14px;padding:16px 18px;margin:0 0 18px;">
                  <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#0E38B1;font-weight:700;">${escapeHtml(ctaTitle)}</p>
                  <p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(ctaBody)}</p>
                  <p style="margin:0;"><a href="${preferencesUrl}" style="display:inline-block;background:#0E38B1;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:999px;font-weight:700;font-size:14px;">${escapeHtml(ctaLink)}</a></p>
                </div>
                <p style="margin:0 0 18px;"><a href="${articleUrl}" style="display:inline-block;background:#0E38B1;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;font-size:14px;">${escapeHtml(ctaLabel)}</a></p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">${escapeHtml(supportText)}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fbff;padding:20px 34px 30px;border:1px solid #e8edf7;border-top:0;border-radius:0 0 18px 18px;">
                <p style="margin:0 0 4px;color:#64748b;font-size:13px;line-height:1.6;">${escapeHtml(closing)}</p>
                <p style="margin:0;font-weight:700;color:#0f172a;font-size:14px;">${escapeHtml(signature)}</p>
                <p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:1.6;">${escapeHtml(footerLine)}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#64748b;line-height:1.6;"><a href="https://www.gocloudeg.com" style="color:#0E38B1;text-decoration:none;">www.gocloudeg.com</a> • <a href="mailto:marketing@gocloudeg.com" style="color:#0E38B1;text-decoration:none;">marketing@gocloudeg.com</a></p>
                <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6;"><a href="${preferencesUrl}" style="color:#0E38B1;text-decoration:none;">${escapeHtml(preferencesLabel)}</a> • <a href="${unsubscribeUrl}" style="color:#0E38B1;text-decoration:none;">${escapeHtml(unsubscribeLabel)}</a></p>
                <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6;">${escapeHtml(socialPrefix)} ${socialLinks}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: isArabic ? `${personalizedSubject} | GoCloud` : personalizedSubject,
    previewText: preview,
    bodyText: textLines.join('\n'),
    bodyHtml: html
  };
}

function buildBilingualEmail(entry, post) {
  if (isWelcomeEntry(entry)) {
    return buildWelcomeBilingualEmail(entry);
  }

  const english = buildSingleLanguageEmail(entry, post, 'en');
  const arabic = buildSingleLanguageEmail(entry, post, 'ar');
  const englishSectionHtml = extractBodyInnerHtml(english.bodyHtml);
  const arabicSectionHtml = extractBodyInnerHtml(arabic.bodyHtml);
  const utmCampaign = toUtmSafe(entry.id || 'newsletter', 'newsletter');

  const subject = `${entry.subjectOptions[0] || entry.title} | GoCloud`;
  const previewText = `${english.previewText}`;

  const textBody = [
    'English',
    '',
    english.bodyText,
    '',
    'العربية',
    '',
    arabic.bodyText
  ].join('\n');

  const htmlBody = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f5f7fb;">${escapeHtml('Bilingual update from GoCloud with an Arabic and English perspective')}</div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f5f7fb;padding:0;margin:0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:760px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0E38B1 0%,#113ADC 100%);padding:30px 34px;border-radius:18px 18px 0 0;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.92;">GoCloud Newsletter</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:700;">${escapeHtml(entry.theme)}</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:0.92;">${escapeHtml('Practical insights for smarter digital transformation')}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 34px 24px;border-left:1px solid #e8edf7;border-right:1px solid #e8edf7;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
                  <tr>
                    <td style="padding:0 6px 0 0;width:50%;">
                      <a href="#section-en" style="display:block;background:#eef4ff;border:1px solid #dbe7ff;border-radius:999px;padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#0E38B1;text-decoration:none;">English</a>
                    </td>
                    <td style="padding:0 0 0 6px;width:50%;">
                      <a href="#section-ar" style="display:block;background:#fef3e2;border:1px solid #fde6bf;border-radius:999px;padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#a16207;text-decoration:none;">العربية</a>
                    </td>
                  </tr>
                </table>
                <div style="background:#f8fbff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:16px;">
                  <a id="section-en" style="display:block;position:relative;top:-8px;"></a>
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">English</p>
                  <div style="padding:4px 0;">${englishSectionHtml}</div>
                </div>
                <div style="background:#f8fbff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;">
                  <a id="section-ar" style="display:block;position:relative;top:-8px;"></a>
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">العربية</p>
                  <div style="padding:4px 0;" dir="rtl">${arabicSectionHtml}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fbff;padding:20px 34px 30px;border:1px solid #e8edf7;border-top:0;border-radius:0 0 18px 18px;">
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">GoCloud • Digital transformation • ERP • Cloud • Automation</p>
                <p style="margin:8px 0 0;font-size:13px;color:#64748b;line-height:1.6;"><a href="https://www.gocloudeg.com" style="color:#0E38B1;text-decoration:none;">www.gocloudeg.com</a> • <a href="mailto:marketing@gocloudeg.com" style="color:#0E38B1;text-decoration:none;">marketing@gocloudeg.com</a></p>
                <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6;"><a href="${PREF_URL_PLACEHOLDER}" style="color:#0E38B1;text-decoration:none;">Manage preferences</a> • <a href="${UNSUB_URL_PLACEHOLDER}" style="color:#0E38B1;text-decoration:none;">Unsubscribe</a></p>
                <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6;">Follow us: <a href="${withUtmParams('https://www.linkedin.com/company/gocloud-co', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: 'linkedin-bilingual' })}" style="color:#0E38B1;text-decoration:none;">LinkedIn</a> • <a href="${withUtmParams('https://www.youtube.com/@GoCloudeg', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: 'youtube-bilingual' })}" style="color:#0E38B1;text-decoration:none;">YouTube</a> • <a href="${withUtmParams('https://www.facebook.com/GoCloudEg/', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: utmCampaign, utm_content: 'facebook-bilingual' })}" style="color:#0E38B1;text-decoration:none;">Facebook</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    previewText,
    bodyText: textBody,
    bodyHtml: htmlBody
  };
}

function generateCampaignPlan(options = {}) {
  const calendar = readJson(CALENDAR_PATH);
  const entries = [];

  for (const entry of calendar.entries || []) {
    const postPath = getPostFilePath(entry.postSlug);
    let post = null;

    if (postPath) {
      post = readJson(postPath);
    }

    const localizedContent = buildBilingualEmail(entry, post || { title: { en: entry.title, ar: entry.title }, excerpt: { en: entry.previewText || '', ar: entry.previewText || '' } });

    entries.push({
      id: entry.id,
      sendDate: entry.sendDate,
      theme: entry.theme,
      title: getLocalizedValue(post?.title, 'en') || entry.title,
      subject: localizedContent.subject,
      previewText: localizedContent.previewText,
      ctaLabel: entry.ctaLabel,
      ctaUrl: entry.ctaUrl,
      postSlug: entry.postSlug,
      bodyText: localizedContent.bodyText,
      bodyHtml: localizedContent.bodyHtml,
      localized: {
        en: buildSingleLanguageEmail(entry, post || { title: { en: entry.title }, excerpt: { en: entry.previewText || '' } }, 'en'),
        ar: buildSingleLanguageEmail(entry, post || { title: { ar: entry.title }, excerpt: { ar: entry.previewText || '' } }, 'ar')
      },
      postStatus: post ? 'ready' : 'missing-post'
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    calendar,
    entries
  };

  ensureDirectory(NEWSLETTER_DIR);
  const outputFile = options.outputFile || DEFAULT_OUTPUT_FILE;
  writeJson(outputFile, plan);

  return plan;
}

function loadSubscribers() {
  if (!fs.existsSync(SUBSCRIBERS_PATH)) {
    return [];
  }

  const raw = readJson(SUBSCRIBERS_PATH);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(item => item && typeof item.email === 'string' && item.email.trim());
}

function getConfirmedSubscribers() {
  return loadSubscribers().filter(item => item.status === CONFIRMED_STATUS);
}

function ensureSubscriberRecord(email, defaults = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const subscribers = loadSubscribers();
  const now = new Date().toISOString();
  let subscriber = subscribers.find(item => item && item.email === normalizedEmail);

  if (!subscriber) {
    subscriber = {
      email: normalizedEmail,
      status: CONFIRMED_STATUS,
      preferredLanguage: defaults.preferredLanguage || 'bilingual',
      frequency: defaults.frequency || 'bi-weekly',
      source: 'Newsletter test send',
      tags: ['Newsletter', 'Test'],
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
      mailingListStatus: 'active'
    };
    subscribers.push(subscriber);
  } else {
    subscriber.status = CONFIRMED_STATUS;
    subscriber.preferredLanguage = defaults.preferredLanguage || subscriber.preferredLanguage || 'bilingual';
    subscriber.frequency = defaults.frequency || subscriber.frequency || 'bi-weekly';
    subscriber.updatedAt = now;
    subscriber.confirmedAt = subscriber.confirmedAt || now;
    subscriber.mailingListStatus = subscriber.mailingListStatus || 'active';
  }

  ensureDirectory(path.dirname(SUBSCRIBERS_PATH));
  writeJson(SUBSCRIBERS_PATH, subscribers);
  return subscriber;
}

function loadDispatchLog() {
  if (!fs.existsSync(DISPATCH_LOG_PATH)) {
    return [];
  }

  const raw = readJson(DISPATCH_LOG_PATH);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw;
}

function writeDispatchLog(logEntries) {
  writeJson(DISPATCH_LOG_PATH, logEntries);
}

async function createTransporter() {
  if (!nodemailer) {
    return null;
  }

  const user = String(process.env.SMTP_USER || '').trim();
  const pass = SMTP_HELPER.getSmtpPassword(process.env);

  if (!user || !pass) {
    return null;
  }

  const candidates = SMTP_HELPER.buildSmtpCandidates(process.env);
  const transportOptions = candidates.map(candidate => ({
    ...candidate,
    auth: candidate.auth ? { user, pass } : undefined
  }));

  for (const transportConfig of transportOptions) {
    const transport = nodemailer.createTransport(transportConfig);
    try {
      await transport.verify();
      return transport;
    } catch (error) {
      continue;
    }
  }

  return null;
}

function getPreferredLanguage(subscriber) {
  const preferred = String(subscriber.preferredLanguage || '').toLowerCase();
  if (preferred === 'ar') {
    return 'ar';
  }
  if (preferred === 'en') {
    return 'en';
  }
  return 'bilingual';
}

function getNextDueEntry(plan, logEntries) {
  const sentIds = new Set((logEntries || []).map(item => item.entryId));
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const dueEntry = (plan.entries || []).find(entry => {
    const sendDate = new Date(`${entry.sendDate}T12:00:00`);
    return !sentIds.has(entry.id) && sendDate <= today;
  });

  return dueEntry || null;
}

async function sendCampaign(entryId, options = {}) {
  const plan = generateCampaignPlan({ outputFile: options.outputFile || DEFAULT_OUTPUT_FILE });
  const logEntries = loadDispatchLog();
  const entry = entryId
    ? (plan.entries.find(item => item.id === entryId) || null)
    : options.testEmail
      ? (plan.entries[0] || null)
      : getNextDueEntry(plan, logEntries);

  if (!entry) {
    return {
      status: 'noop',
      entry: null,
      recipients: 0,
      message: 'No due newsletter entry was found. Check the calendar date or the dispatch log.'
    };
  }

  const subscribers = options.testEmail
    ? [
      ensureSubscriberRecord(options.testEmail, {
        preferredLanguage: options.preferredLanguage || 'bilingual',
        frequency: options.frequency || 'bi-weekly'
      })
    ].filter(Boolean)
    : getConfirmedSubscribers();

  if (!subscribers.length) {
    return {
      status: 'noop',
      entry,
      recipients: 0,
      message: 'No confirmed subscribers were found. Add subscribers or run with --test-email.'
    };
  }

  const eligibleSubscribers = subscribers.filter(subscriber => {
    if (options.testEmail) {
      return true;
    }
    return shouldSendForFrequency(subscriber, logEntries);
  });

  if (!eligibleSubscribers.length) {
    return {
      status: 'noop',
      entry,
      recipients: 0,
      message: 'No subscribers are currently eligible based on frequency preferences.'
    };
  }

  if (options.dryRun) {
    return {
      status: 'dry-run',
      entry,
      recipients: eligibleSubscribers.length,
      message: 'Dry run only. No email was sent.'
    };
  }

  const transporter = await createTransporter();
  if (!transporter) {
    const missingKeys = [];
    if (!process.env.SMTP_HOST) {
      missingKeys.push('SMTP_HOST');
    }
    if (!process.env.SMTP_USER) {
      missingKeys.push('SMTP_USER');
    }
    if (!SMTP_HELPER.getSmtpPassword(process.env)) {
      missingKeys.push('SMTP_PASS');
    }

    return {
      status: 'skipped',
      entry,
      recipients: eligibleSubscribers.length,
      message: `SMTP credentials are missing. No email was sent. Add ${missingKeys.join(', ')} to your environment or API .env file, or rerun with --dry-run.`
    };
  }

  const fromEmail = options.fromEmail || process.env.SMTP_FROM || calendarFromEmail(plan) || 'marketing@gocloudeg.com';
  const fromName = options.fromName || process.env.SMTP_FROM_NAME || 'GoCloud Newsletter';
  const fromAddress = { name: fromName, address: fromEmail };
  const replyToAddress = { name: fromName, address: process.env.SMTP_FROM || fromEmail };
  const testSubscriberEmail = options.testEmail || process.env.TEST_SUBSCRIBER_EMAIL || '';
  const results = [];

  for (const subscriber of eligibleSubscribers) {
    const languageMode = getPreferredLanguage(subscriber);
    const selectedContent = languageMode === 'ar'
      ? entry.localized.ar
      : languageMode === 'en'
        ? entry.localized.en
        : {
          subject: entry.subject,
          previewText: entry.previewText,
          bodyText: entry.bodyText,
          bodyHtml: entry.bodyHtml
        };
    const links = buildRecipientLinks(subscriber, entry.id, languageMode);
    const messageText = applyRecipientLinks(selectedContent.bodyText, links);
    const messageHtml = applyRecipientLinks(selectedContent.bodyHtml, links);

    const targetEmail = testSubscriberEmail && subscriber.email === process.env.TEST_SUBSCRIBER_EMAIL
      ? testSubscriberEmail
      : subscriber.email;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: targetEmail,
      replyTo: replyToAddress,
      subject: selectedContent.subject,
      text: messageText,
      html: messageHtml
    });

    results.push({
      email: subscriber.email,
      languageMode,
      messageId: info.messageId
    });
  }

  const newLogEntries = [
    ...logEntries,
    {
      sentAt: new Date().toISOString(),
      entryId: entry.id,
      recipientCount: results.length,
      results
    }
  ];

  writeDispatchLog(newLogEntries);

  return {
    status: 'sent',
    entry,
    recipients: results.length,
    results
  };
}

function calendarFromEmail(plan) {
  return plan?.calendar?.fromEmail || 'marketing@gocloudeg.com';
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--plan') {
      options.plan = true;
    } else if (arg === '--send') {
      options.send = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--test-email=')) {
      options.testEmail = arg.split('=')[1];
    } else if (arg.startsWith('--entry=')) {
      options.entryId = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      options.outputFile = arg.split('=')[1];
    } else if (arg.startsWith('--from-name=')) {
      options.fromName = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--from-email=')) {
      options.fromEmail = arg.split('=').slice(1).join('=');
    }
  }

  return options;
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.plan) {
    generateCampaignPlan({ outputFile: options.outputFile || DEFAULT_OUTPUT_FILE });
    return {
      status: 'planned',
      message: 'Campaign plan generated successfully.'
    };
  }

  if (options.send) {
    const result = await sendCampaign(options.entryId, {
      ...options,
      testEmail: options.testEmail || process.env.TEST_SUBSCRIBER_EMAIL || ''
    });

    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  return {
    status: 'noop',
    message: 'No action requested. Use --plan or --send.'
  };
}

module.exports = {
  generateCampaignPlan,
  sendCampaign,
  getConfirmedSubscribers,
  loadSubscribers,
  calendarFromEmail,
  getNextDueEntry,
  buildBilingualEmail,
  buildSingleLanguageEmail,
  parseCliArgs,
  runCli
};

if (require.main === module) {
  runCli().catch(error => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}
