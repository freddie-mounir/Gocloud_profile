'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SYSTEM_PROMPT = require('./system-prompt');
let PREF_TOKEN = null;

try {
  PREF_TOKEN = require(path.join(__dirname, 'newsletter-preferences-token'));
} catch (error) {
  try {
    PREF_TOKEN = require(path.join(__dirname, '..', 'scripts', 'newsletter-preferences-token'));
  } catch (nestedError) {
    PREF_TOKEN = require(path.join(__dirname, '..', '..', 'scripts', 'newsletter-preferences-token'));
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const execFileAsync = promisify(execFile);

function normalizeClientIp(rawIp) {
  if (typeof rawIp !== 'string') {
    return 'unknown';
  }

  let ip = rawIp.trim();
  if (!ip) {
    return 'unknown';
  }

  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }

  const bracketMatch = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch) {
    ip = bracketMatch[1];
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, '');
  }

  return ip || 'unknown';
}

function rateLimitKey(req) {
  const forwarded = req.get('x-forwarded-for') || '';
  const candidate = forwarded || req.ip || req.socket?.remoteAddress || '';
  return normalizeClientIp(candidate);
}

app.set('trust proxy', 1);

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'https://www.gocloudeg.com,https://gocloudeg.com')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const REQUIRED_CHAT_TOKEN = process.env.CHATBOT_API_TOKEN || '';
const CHAT_MINUTE_LIMIT = Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 10);
const CHAT_DAILY_LIMIT = Number(process.env.CHAT_RATE_LIMIT_PER_DAY || 250);
const NEWSLETTER_FILE = path.join(__dirname, 'newsletter-subscribers.json');
const NEWSLETTER_SOURCE = process.env.NEWSLETTER_SOURCE_LABEL || 'Website Newsletter (Subscribe for Practical Updates)';
const NEWSLETTER_STATUS_PENDING = 'Unconfirmed / Pending Opt-In';
const NEWSLETTER_STATUS_CONFIRMED = 'Confirmed / Active';
const NEWSLETTER_STATUS_UNSUBSCRIBED = 'Unsubscribed / Opt-Out';
const NEWSLETTER_TAGS = ['Newsletter', 'Inbound Lead'];
const NEWSLETTER_CONFIRMATION_BASE_URL =
  process.env.NEWSLETTER_CONFIRMATION_URL || 'https://www.gocloudeg.com/api/newsletter/confirm';
const NEWSLETTER_TOKEN_TTL_HOURS = Number(process.env.NEWSLETTER_TOKEN_TTL_HOURS || 48);
const NEWSLETTER_CONFIRMATION_SECRET =
  process.env.NEWSLETTER_CONFIRMATION_SECRET
  || process.env.NEWSLETTER_PREFERENCES_SECRET
  || process.env.SMTP_PASS
  || process.env.ZOHO_APP_PASSWORD
  || 'newsletter-confirmation-secret';
const NEWSLETTER_PREFERENCES_URL =
  process.env.NEWSLETTER_PREFERENCES_URL || 'https://www.gocloudeg.com/api/newsletter/preferences';
const NEWSLETTER_UNSUBSCRIBE_URL =
  process.env.NEWSLETTER_UNSUBSCRIBE_URL || 'https://www.gocloudeg.com/api/newsletter/unsubscribe';
const NEWSLETTER_PREFERENCES_SECRET =
  process.env.NEWSLETTER_PREFERENCES_SECRET || process.env.SMTP_PASS || process.env.ZOHO_APP_PASSWORD || 'newsletter-secret';
const NEWSLETTER_PREFERENCES_TOKEN_MAX_DAYS = Number(process.env.NEWSLETTER_PREFERENCES_TOKEN_MAX_DAYS || 3650);
const NEWSLETTER_WELCOME_ENABLED = String(process.env.NEWSLETTER_WELCOME_ENABLED || 'true').toLowerCase() !== 'false';
const NEWSLETTER_WELCOME_ENTRY_ID = process.env.NEWSLETTER_WELCOME_ENTRY_ID || 'welcome-gocloud';
const NEWSLETTER_WELCOME_SEND_TIMEOUT_MS = Number(process.env.NEWSLETTER_WELCOME_SEND_TIMEOUT_MS || 60000);
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_EXPECTED_ACTION = process.env.TURNSTILE_ACTION || 'newsletter_subscribe';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.ZOHO_APP_PASSWORD || process.env.ZOHO_PASSWORD || '';
const SMTP_FROM = process.env.SMTP_FROM || 'marketing@gocloudeg.com';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'GoCloud Team';
const NEWSLETTER_EMAIL_SUBJECT =
  process.env.NEWSLETTER_EMAIL_SUBJECT ||
  'Action Required: Confirm your GoCloud newsletter subscription';
const ODOO_OPPORTUNITY_SOURCES = (process.env.ODOO_OPPORTUNITY_SOURCES || 'demo,request-demo,book-demo,demo-form,contact-sales,sales-contact')
  .split(',')
  .map(v => v.trim().toLowerCase())
  .filter(Boolean);

const ODOO_URL = (process.env.ODOO_URL || '').replace(/\/$/, '');
const ODOO_DB = process.env.ODOO_DB || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME || '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || '';
const ODOO_CRM_MODEL = process.env.ODOO_CRM_MODEL || 'crm.lead';
const ODOO_MAILING_LIST_ID = Number(process.env.ODOO_MAILING_LIST_ID || 0);

const ODOO_ENABLED = Boolean(ODOO_URL && ODOO_DB && ODOO_USERNAME && ODOO_PASSWORD);
const SMTP_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let cachedOdooUid = null;

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-GoCloud-Chat-Token', 'X-Requested-With']
  })
);

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('Invalid JSON payload:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  return next(err);
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: CHAT_MINUTE_LIMIT,
  keyGenerator: req => rateLimitKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a moment.' }
});

const chatDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: CHAT_DAILY_LIMIT,
  keyGenerator: req => rateLimitKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily request limit reached. Please try again later.' }
});

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.NEWSLETTER_RATE_LIMIT_PER_15_MIN || 8),
  keyGenerator: req => rateLimitKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many subscription attempts. Please try again later.' }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  systemInstruction: SYSTEM_PROMPT
});

function sanitizeInput(str) {
  if (typeof str !== 'string') {
    return '';
  }

  return str
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 500);
}

function sanitizeCaptchaToken(str) {
  if (typeof str !== 'string') {
    return '';
  }

  return str.trim().slice(0, 2048);
}

function normalizeNewsletterLanguage(value) {
  if (typeof value !== 'string') {
    return 'bilingual';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return 'bilingual';
  }

  if (['ar', 'arabic', 'العربية', 'العربي', 'ara'].includes(normalized)) {
    return 'ar';
  }

  if (['en', 'english', 'eng', 'us'].includes(normalized)) {
    return 'en';
  }

  return 'bilingual';
}

function normalizeNewsletterFrequency(value) {
  if (typeof value !== 'string') {
    return 'bi-weekly';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'bi-weekly' || normalized === 'monthly' || normalized === 'paused') {
    return normalized;
  }

  return 'bi-weekly';
}

function buildHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  const mapped = rawHistory
    .slice(-20)
    .filter(msg => msg && msg.role && msg.text)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: sanitizeInput(msg.text) }]
    }));

  while (mapped.length > 0 && mapped[0].role !== 'user') {
    mapped.shift();
  }

  return mapped;
}

function isAllowedBrowserOrigin(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return false;
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!ALLOWED_ORIGINS.includes(refererOrigin)) {
        return false;
      }
    } catch (err) {
      return false;
    }
  }

  return true;
}

function requireChatAuth(req, res, next) {
  if (!isAllowedBrowserOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden origin.' });
  }

  const userAgent = req.get('user-agent');
  if (!userAgent) {
    return res.status(400).json({ error: 'Missing user agent.' });
  }

  if (REQUIRED_CHAT_TOKEN) {
    const token = req.get('x-gocloud-chat-token');
    if (token !== REQUIRED_CHAT_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized request.' });
    }
  }

  next();
}

function requireAllowedOrigin(req, res, next) {
  if (!isAllowedBrowserOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden origin.' });
  }

  next();
}

function sanitizeEmail(email) {
  if (typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeClassificationText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function determineCrmType(source, pageUrl, explicitCrmType) {
  const normalizedExplicit = normalizeClassificationText(explicitCrmType);
  if (normalizedExplicit === 'opportunity' || normalizedExplicit === 'lead') {
    return normalizedExplicit;
  }

  const sourceText = normalizeClassificationText(source);
  const pageText = normalizeClassificationText(pageUrl);
  const haystack = `${sourceText} ${pageText}`;

  for (const token of ODOO_OPPORTUNITY_SOURCES) {
    if (token && haystack.includes(token)) {
      return 'opportunity';
    }
  }

  return 'lead';
}

function createNewsletterTraceId() {
  return crypto.randomBytes(6).toString('hex');
}

function maskEmailForLog(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'unknown';
  }

  const parts = email.split('@');
  const local = parts[0] || '';
  const domain = parts[1] || '';

  if (!local || !domain) {
    return 'unknown';
  }

  if (local.length <= 2) {
    return `**@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

function logNewsletterTrace(traceId, stage, email, details) {
  const payload = Object.assign(
    {
      traceId,
      stage,
      email: maskEmailForLog(email)
    },
    details || {}
  );

  console.error('[newsletter-trace]', JSON.stringify(payload));
}

function readNewsletterSubscribers() {
  if (!fs.existsSync(NEWSLETTER_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(NEWSLETTER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeNewsletterSubscribers(subscribers) {
  fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify(subscribers, null, 2), 'utf8');
}

function createConfirmationToken(email) {
  const rawToken = PREF_TOKEN.createPreferencesToken(email, NEWSLETTER_CONFIRMATION_SECRET, Date.now());
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + NEWSLETTER_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  return { rawToken, tokenHash, expiresAt };
}

function hasReusablePendingConfirmationToken(subscriber) {
  if (!subscriber || subscriber.status !== NEWSLETTER_STATUS_PENDING) {
    return false;
  }

  if (!subscriber.confirmationTokenRaw || !subscriber.confirmationTokenHash) {
    return false;
  }

  const expiresAt = Date.parse(subscriber.confirmationTokenExpiresAt || '');
  return Number.isFinite(expiresAt) && Date.now() <= expiresAt;
}

function buildConfirmationLink(rawToken) {
  const url = new URL(NEWSLETTER_CONFIRMATION_BASE_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

function buildPreferencesToken(email) {
  return PREF_TOKEN.createPreferencesToken(email, NEWSLETTER_PREFERENCES_SECRET);
}

function parsePreferencesToken(rawToken) {
  return PREF_TOKEN.verifyPreferencesToken(
    rawToken,
    NEWSLETTER_PREFERENCES_SECRET,
    NEWSLETTER_PREFERENCES_TOKEN_MAX_DAYS
  );
}

function buildPreferencesLink(email) {
  const token = buildPreferencesToken(email);
  const url = new URL(NEWSLETTER_PREFERENCES_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildUnsubscribeLink(email) {
  const token = buildPreferencesToken(email);
  const url = new URL(NEWSLETTER_UNSUBSCRIBE_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function renderPreferencesPage(subscriber, token, savedMessage, completeAfterSave = false) {
  const selectedLanguage = normalizeNewsletterLanguage(subscriber?.preferredLanguage);
  const selectedFrequency = normalizeNewsletterFrequency(subscriber?.frequency);
  const isUnsubscribed = String(subscriber?.status || '') === NEWSLETTER_STATUS_UNSUBSCRIBED;
  const messageHtml = savedMessage
    ? `<p class="status-message">${savedMessage}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manage Newsletter Preferences</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#f5f7fc;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{background:#fff;max-width:680px;width:100%;border-radius:16px;padding:28px;box-shadow:0 14px 40px rgba(2,6,23,.08)}
    h1{margin:0 0 10px;font-size:1.6rem;color:#0e38b1}
    p{line-height:1.6;color:#374151}
    .row{margin:18px 0}
    label{display:block;font-weight:600;margin:0 0 8px}
    select{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
    button{border:0;border-radius:999px;padding:11px 18px;font-weight:700;cursor:pointer}
    .primary{background:#0e38b1;color:#fff}
    .danger{background:#fee2e2;color:#991b1b}
    .muted{font-size:12px;color:#64748b;margin-top:14px}
    .status-message{background:#ecfeff;border:1px solid #a5f3fc;color:#0f766e;padding:10px 12px;border-radius:10px}
  </style>
</head>
<body>
  <main class="card">
    <h1>Manage your newsletter preferences</h1>
    <p>Email: <strong>${subscriber.email}</strong></p>
    ${messageHtml}
    <form method="post" action="/api/newsletter/preferences">
      <input type="hidden" name="token" value="${token}" />
      <input type="hidden" name="afterSave" value="${completeAfterSave ? 'complete' : 'manage'}" />
      <div class="row">
        <label for="preferredLanguage">Preferred language</label>
        <select id="preferredLanguage" name="preferredLanguage">
          <option value="bilingual"${selectedLanguage === 'bilingual' ? ' selected' : ''}>Bilingual (English + Arabic)</option>
          <option value="en"${selectedLanguage === 'en' ? ' selected' : ''}>English only</option>
          <option value="ar"${selectedLanguage === 'ar' ? ' selected' : ''}>Arabic only</option>
        </select>
      </div>
      <div class="row">
        <label for="frequency">Email frequency</label>
        <select id="frequency" name="frequency">
          <option value="weekly"${selectedFrequency === 'weekly' ? ' selected' : ''}>Weekly</option>
          <option value="bi-weekly"${selectedFrequency === 'bi-weekly' ? ' selected' : ''}>Bi-weekly</option>
          <option value="monthly"${selectedFrequency === 'monthly' ? ' selected' : ''}>Monthly</option>
          <option value="paused"${selectedFrequency === 'paused' ? ' selected' : ''}>Pause emails</option>
        </select>
      </div>
      <div class="actions">
        <button class="primary" type="submit" name="action" value="save">Save preferences</button>
        <button class="danger" type="submit" name="action" value="unsubscribe">Unsubscribe</button>
      </div>
      <p class="muted">If unsubscribed, you can re-enable delivery anytime by choosing a frequency and saving again.</p>
      <p class="muted">Status: ${isUnsubscribed ? 'Unsubscribed' : 'Active'}</p>
    </form>
  </main>
</body>
</html>`;
}

function renderPreferencesCompletePage(isUnsubscribed) {
  const title = isUnsubscribed ? 'Subscription paused' : 'Preferences saved';
  const message = isUnsubscribed
    ? 'You will not receive new newsletters unless you reactivate your subscription.'
    : 'Your newsletter preferences are active. You can update them anytime from a future email.';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="4;url=https://www.gocloudeg.com/" />
  <title>${title}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#172033;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{background:#fff;max-width:520px;width:100%;border:1px solid #dde4f0;border-top:5px solid #a1e934;border-radius:8px;padding:32px;box-shadow:0 12px 30px rgba(14,56,177,.08);text-align:center}
    h1{margin:0 0 10px;font-size:1.6rem;color:#082a86}
    p{margin:0 0 18px;line-height:1.65;color:#667085}
    a{display:inline-block;background:#0e38b1;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;font-weight:700}
    .muted{margin-top:16px;font-size:12px}
  </style>
</head>
<body>
  <main class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://www.gocloudeg.com/">Return to GoCloud</a>
    <p class="muted">Returning to the website automatically. You may also close this tab.</p>
  </main>
</body>
</html>`;
}

function renderStatusPage(title, message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#f5f7fc;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{background:#fff;max-width:560px;width:100%;border-radius:16px;padding:28px;box-shadow:0 14px 40px rgba(2,6,23,.08)}
    h1{margin:0 0 10px;font-size:1.5rem;color:#0e38b1}
    p{margin:0;line-height:1.6;color:#374151}
  </style>
</head>
<body>
  <main class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

async function verifyTurnstileToken(token, remoteIp) {
  if (!TURNSTILE_SECRET_KEY) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', TURNSTILE_SECRET_KEY);
    body.set('response', token);
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    if (!payload.success) {
      console.warn(
        'Turnstile verification failed:',
        JSON.stringify({
          errorCodes: payload['error-codes'] || [],
          action: payload.action || '',
          hostname: payload.hostname || ''
        })
      );
      return false;
    }

    if (payload.action && payload.action !== TURNSTILE_EXPECTED_ACTION) {
      console.warn(
        'Turnstile action mismatch:',
        JSON.stringify({
          expectedAction: TURNSTILE_EXPECTED_ACTION,
          actualAction: payload.action,
          hostname: payload.hostname || ''
        })
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error('Turnstile verification error:', err.message);
    return false;
  }
}

function getEmailTransport() {
  if (!SMTP_ENABLED) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

function buildFromHeader() {
  if (!SMTP_FROM) {
    return '';
  }

  if (SMTP_FROM.includes('<') && SMTP_FROM.includes('>')) {
    return SMTP_FROM;
  }

  return `${SMTP_FROM_NAME} <${SMTP_FROM}>`;
}

async function sendDoubleOptInEmail(email, confirmationLink) {
  const transport = getEmailTransport();
  const preferencesLink = buildPreferencesLink(email);
  const unsubscribeLink = buildUnsubscribeLink(email);

  if (!transport) {
    throw new Error('SMTP is not configured.');
  }

  return transport.sendMail({
    from: buildFromHeader(),
    to: email,
    subject: NEWSLETTER_EMAIL_SUBJECT,
    text: [
      'Thank you for subscribing to GoCloud practical updates.',
      '',
      'Please confirm your subscription using this secure link:',
      confirmationLink,
      '',
      'Manage your preferences:',
      preferencesLink,
      '',
      'Unsubscribe:',
      unsubscribeLink,
      '',
      'If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: [
      '<p>Thank you for subscribing to GoCloud practical updates.</p>',
      '<p>Please confirm your subscription by clicking the secure link below:</p>',
      `<p><a href="${confirmationLink}">Confirm my subscription</a></p>`,
      `<p><a href="${preferencesLink}">Manage preferences</a> • <a href="${unsubscribeLink}">Unsubscribe</a></p>`,
      '<p>If you did not request this, you can ignore this email.</p>'
    ].join('')
  });
}

async function odooRpc(service, method, args) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service,
        method,
        args
      },
      id: Date.now()
    })
  });

  if (!response.ok) {
    throw new Error(`Odoo request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    const msg = payload.error.data && payload.error.data.message ? payload.error.data.message : 'Odoo RPC error';
    throw new Error(msg);
  }

  return payload.result;
}

async function getOdooUid() {
  if (cachedOdooUid) {
    return cachedOdooUid;
  }

  const uid = await odooRpc('common', 'login', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD]);
  if (!uid) {
    throw new Error('Failed to authenticate with Odoo.');
  }

  cachedOdooUid = uid;
  return uid;
}

async function odooExecuteKw(modelName, methodName, methodArgs, kwargs) {
  const uid = await getOdooUid();
  return odooRpc('object', 'execute_kw', [
    ODOO_DB,
    uid,
    ODOO_PASSWORD,
    modelName,
    methodName,
    methodArgs,
    kwargs || {}
  ]);
}

async function ensureOdooSourceId() {
  const ids = await odooExecuteKw('utm.source', 'search', [[['name', '=', NEWSLETTER_SOURCE]]], {
    limit: 1
  });

  if (Array.isArray(ids) && ids.length > 0) {
    return ids[0];
  }

  return odooExecuteKw('utm.source', 'create', [{ name: NEWSLETTER_SOURCE }]);
}

async function ensureOdooTagIds(modelName) {
  if (modelName === 'crm.lead') {
    const tagIds = [];

    for (const tagName of NEWSLETTER_TAGS) {
      const ids = await odooExecuteKw('crm.tag', 'search', [[['name', '=', tagName]]], { limit: 1 });
      if (Array.isArray(ids) && ids.length > 0) {
        tagIds.push(ids[0]);
      } else {
        const created = await odooExecuteKw('crm.tag', 'create', [{ name: tagName }]);
        tagIds.push(created);
      }
    }

    return tagIds;
  }

  if (modelName === 'res.partner') {
    const categoryIds = [];

    for (const tagName of NEWSLETTER_TAGS) {
      const ids = await odooExecuteKw('res.partner.category', 'search', [[['name', '=', tagName]]], {
        limit: 1
      });
      if (Array.isArray(ids) && ids.length > 0) {
        categoryIds.push(ids[0]);
      } else {
        const created = await odooExecuteKw('res.partner.category', 'create', [{ name: tagName }]);
        categoryIds.push(created);
      }
    }

    return categoryIds;
  }

  return [];
}

async function upsertCrmSubscriber(email, status, crmType) {
  if (!ODOO_ENABLED) {
    return null;
  }

  const modelName = ODOO_CRM_MODEL;
  const statusNote = `Newsletter status: ${status}`;
  const leadType = crmType === 'opportunity' ? 'opportunity' : 'lead';

  if (modelName === 'crm.lead') {
    const sourceId = await ensureOdooSourceId();
    const tagIds = await ensureOdooTagIds(modelName);
    const ids = await odooExecuteKw('crm.lead', 'search', [[['email_from', '=', email]]], { limit: 1 });

    const values = {
      name:
        leadType === 'opportunity'
          ? `Opportunity - ${email}`
          : `Newsletter subscriber - ${email}`,
      email_from: email,
      source_id: sourceId,
      type: leadType,
      description: `${NEWSLETTER_SOURCE}\n${statusNote}`,
      tag_ids: [[6, 0, tagIds]]
    };

    if (Array.isArray(ids) && ids.length > 0) {
      await odooExecuteKw('crm.lead', 'write', [[ids[0]], values]);
      return { model: 'crm.lead', id: ids[0] };
    }

    const created = await odooExecuteKw('crm.lead', 'create', [values]);
    return { model: 'crm.lead', id: created };
  }

  if (modelName === 'res.partner') {
    const categoryIds = await ensureOdooTagIds(modelName);
    const ids = await odooExecuteKw('res.partner', 'search', [[['email', '=', email]]], { limit: 1 });

    const values = {
      name: `Newsletter subscriber - ${email}`,
      email,
      comment: `${NEWSLETTER_SOURCE}\n${statusNote}`,
      category_id: [[6, 0, categoryIds]]
    };

    if (Array.isArray(ids) && ids.length > 0) {
      await odooExecuteKw('res.partner', 'write', [[ids[0]], values]);
      return { model: 'res.partner', id: ids[0] };
    }

    const created = await odooExecuteKw('res.partner', 'create', [values]);
    return { model: 'res.partner', id: created };
  }

  return null;
}

async function upsertDemoOpportunity(details) {
  if (!ODOO_ENABLED) {
    return null;
  }

  const modelName = ODOO_CRM_MODEL;
  const email = sanitizeEmail(details && details.email);
  const firstName = sanitizeInput(details && details.firstName).slice(0, 80);
  const lastName = sanitizeInput(details && details.lastName).slice(0, 80);
  const phone = sanitizeInput(details && details.phone).slice(0, 40);
  const company = sanitizeInput(details && details.company).slice(0, 120);
  const service = sanitizeInput(details && details.service).slice(0, 120);
  const preferredDate = sanitizeInput(details && details.preferredDate).slice(0, 40);
  const preferredTime = sanitizeInput(details && details.preferredTime).slice(0, 40);
  const notes = sanitizeInput(details && details.notes).slice(0, 1000);
  const source = sanitizeInput(details && details.source).slice(0, 120) || 'Book a Free Demo';
  const pageUrl = sanitizeInput(details && details.pageUrl).slice(0, 300);

  const leadNameParts = [firstName, lastName].filter(Boolean);
  const leadName = leadNameParts.length > 0 ? leadNameParts.join(' ') : `Demo request - ${email}`;

  if (modelName === 'crm.lead') {
    const sourceId = await ensureOdooSourceId();
    const tagIds = await ensureOdooTagIds(modelName);
    const ids = await odooExecuteKw('crm.lead', 'search', [[['email_from', '=', email]]], { limit: 1 });

    const descriptionLines = [
      `Demo request source: ${source}`,
      pageUrl ? `Page: ${pageUrl}` : '',
      company ? `Company: ${company}` : '',
      phone ? `Phone: ${phone}` : '',
      service ? `Service: ${service}` : '',
      preferredDate ? `Preferred date: ${preferredDate}` : '',
      preferredTime ? `Preferred time: ${preferredTime}` : '',
      notes ? `Notes: ${notes}` : ''
    ].filter(Boolean);

    const values = {
      name: leadName,
      email_from: email,
      phone: phone,
      contact_name: `${firstName} ${lastName}`.trim(),
      partner_name: company,
      source_id: sourceId,
      type: 'opportunity',
      description: descriptionLines.join('\n'),
      tag_ids: [[6, 0, tagIds]]
    };

    if (Array.isArray(ids) && ids.length > 0) {
      await odooExecuteKw('crm.lead', 'write', [[ids[0]], values]);
      return { model: 'crm.lead', id: ids[0] };
    }

    const created = await odooExecuteKw('crm.lead', 'create', [values]);
    return { model: 'crm.lead', id: created };
  }

  if (modelName === 'res.partner') {
    const categoryIds = await ensureOdooTagIds(modelName);
    const ids = await odooExecuteKw('res.partner', 'search', [[['email', '=', email]]], { limit: 1 });

    const commentLines = [
      `Demo request source: ${source}`,
      pageUrl ? `Page: ${pageUrl}` : '',
      company ? `Company: ${company}` : '',
      phone ? `Phone: ${phone}` : '',
      service ? `Service: ${service}` : '',
      preferredDate ? `Preferred date: ${preferredDate}` : '',
      preferredTime ? `Preferred time: ${preferredTime}` : '',
      notes ? `Notes: ${notes}` : ''
    ].filter(Boolean);

    const values = {
      name: leadName,
      email,
      phone,
      comment: commentLines.join('\n'),
      category_id: [[6, 0, categoryIds]]
    };

    if (Array.isArray(ids) && ids.length > 0) {
      await odooExecuteKw('res.partner', 'write', [[ids[0]], values]);
      return { model: 'res.partner', id: ids[0] };
    }

    const created = await odooExecuteKw('res.partner', 'create', [values]);
    return { model: 'res.partner', id: created };
  }

  return null;
}

async function syncConfirmedToMailingList(email) {
  if (!ODOO_ENABLED) {
    return null;
  }

  const contactIds = await odooExecuteKw('mailing.contact', 'search', [[['email', '=', email]]], {
    limit: 1
  });

  const values = {
    name: email,
    email,
    opt_out: false
  };

  let mailingContactId = null;

  if (Array.isArray(contactIds) && contactIds.length > 0) {
    mailingContactId = contactIds[0];
    await odooExecuteKw('mailing.contact', 'write', [[mailingContactId], values]);
  } else {
    mailingContactId = await odooExecuteKw('mailing.contact', 'create', [values]);
  }

  if (ODOO_MAILING_LIST_ID > 0 && mailingContactId) {
    const subscriptionIds = await odooExecuteKw(
      'mailing.contact.subscription',
      'search',
      [[['list_id', '=', ODOO_MAILING_LIST_ID], ['contact_id', '=', mailingContactId]]],
      { limit: 1 }
    );

    if (Array.isArray(subscriptionIds) && subscriptionIds.length > 0) {
      await odooExecuteKw('mailing.contact.subscription', 'write', [[subscriptionIds[0]], { opt_out: false }]);
    } else {
      await odooExecuteKw('mailing.contact.subscription', 'create', [
        {
          list_id: ODOO_MAILING_LIST_ID,
          contact_id: mailingContactId,
          opt_out: false
        }
      ]);
    }
  }

  return mailingContactId;
}

function resolveSubscriberFromPreferencesToken(rawToken) {
  const tokenPayload = parsePreferencesToken(rawToken);
  if (!tokenPayload || !tokenPayload.email) {
    return null;
  }

  const subscribers = readNewsletterSubscribers();
  const subscriber = subscribers.find(item => item && item.email === tokenPayload.email);
  if (!subscriber) {
    return null;
  }

  return {
    subscriber,
    subscribers,
    tokenPayload
  };
}

function resolveProjectRootFromApiDir() {
  if (path.basename(__dirname).toLowerCase() === 'api') {
    return path.dirname(__dirname);
  }
  return path.resolve(__dirname, '..');
}

function updateSubscriberByEmail(email, updater) {
  const subscribers = readNewsletterSubscribers();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const index = subscribers.findIndex(item => item && item.email === normalizedEmail);
  if (index < 0) {
    return false;
  }

  updater(subscribers[index]);
  writeNewsletterSubscribers(subscribers);
  return true;
}

async function triggerWelcomeNewsletterSend(subscriber, traceId) {
  if (!NEWSLETTER_WELCOME_ENABLED) {
    logNewsletterTrace(traceId, 'confirm_welcome_send_skipped_disabled', subscriber.email);
    return;
  }

  const projectRoot = resolveProjectRootFromApiDir();
  const scriptPath = path.join(projectRoot, 'scripts', 'newsletter-automation.js');

  if (!fs.existsSync(scriptPath)) {
    logNewsletterTrace(traceId, 'confirm_welcome_send_skipped_missing_script', subscriber.email, {
      scriptPath
    });
    return;
  }

  const args = [
    scriptPath,
    '--send',
    `--entry=${NEWSLETTER_WELCOME_ENTRY_ID}`,
    `--test-email=${subscriber.email}`
  ];

  if (SMTP_FROM_NAME) {
    args.push(`--from-name=${SMTP_FROM_NAME}`);
  }

  if (SMTP_FROM) {
    args.push(`--from-email=${SMTP_FROM}`);
  }

  logNewsletterTrace(traceId, 'confirm_welcome_send_started', subscriber.email, {
    entryId: NEWSLETTER_WELCOME_ENTRY_ID
  });

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: projectRoot,
      timeout: NEWSLETTER_WELCOME_SEND_TIMEOUT_MS,
      env: process.env,
      maxBuffer: 1024 * 1024
    });

    if (stderr && stderr.trim()) {
      logNewsletterTrace(traceId, 'confirm_welcome_send_stderr', subscriber.email, {
        stderr: stderr.trim().slice(0, 500)
      });
    }

    let parsed = null;
    if (stdout && stdout.trim()) {
      try {
        parsed = JSON.parse(stdout.trim());
      } catch (error) {
        parsed = null;
      }
    }

    const status = parsed && parsed.status ? parsed.status : 'unknown';
    if (status === 'sent') {
      updateSubscriberByEmail(subscriber.email, record => {
        record.welcomeNewsletterSentAt = new Date().toISOString();
        record.updatedAt = new Date().toISOString();
      });
    }

    logNewsletterTrace(traceId, 'confirm_welcome_send_completed', subscriber.email, {
      status,
      recipients: parsed && typeof parsed.recipients === 'number' ? parsed.recipients : null,
      message: parsed && parsed.message ? parsed.message : null
    });
  } catch (error) {
    updateSubscriberByEmail(subscriber.email, record => {
      record.welcomeNewsletterSendError = error.message;
      record.welcomeNewsletterLastAttemptAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
    });

    logNewsletterTrace(traceId, 'confirm_welcome_send_failed', subscriber.email, {
      error: error.message
    });
  }
}

app.post('/api/chat', chatLimiter, chatDailyLimiter, requireChatAuth, async (req, res) => {
  try {
    const { message, history } = req.body;
    const userMessage = sanitizeInput(message);

    if (!userMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const chatHistory = buildHistory(history);

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    res.json({ reply: response });
  } catch (err) {
    console.error('Gemini API error:', err.message);

    if (err.message && err.message.includes('API key')) {
      return res
        .status(500)
        .json({ error: 'Service configuration error. Please try again later.' });
    }

    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.post('/api/newsletter', newsletterLimiter, requireAllowedOrigin, async (req, res) => {
  const traceId = createNewsletterTraceId();
  const email = sanitizeEmail(req.body && req.body.email);
  const source = sanitizeInput(req.body && req.body.source).slice(0, 120);
  const pageUrl = sanitizeInput(req.body && req.body.pageUrl).slice(0, 300);
  const language = sanitizeInput(req.body && req.body.language).slice(0, 20);
  const preferredLanguage = normalizeNewsletterLanguage(language);
  const frequencyValue = sanitizeInput(req.body && req.body.frequency).slice(0, 20);
  const frequency = normalizeNewsletterFrequency(frequencyValue);
  const crmTypeOverride = sanitizeInput(req.body && req.body.crmType).slice(0, 30);
  const captchaToken = sanitizeCaptchaToken(req.body && req.body.captchaToken);
  const crmType = determineCrmType(source, pageUrl, crmTypeOverride);

  logNewsletterTrace(traceId, 'subscribe_request_received', email, {
    source: source || NEWSLETTER_SOURCE,
    language: preferredLanguage,
    hasCaptchaToken: Boolean(captchaToken),
    ip: rateLimitKey(req),
    pageUrl: pageUrl || '',
    crmType
  });

  if (!isValidEmail(email)) {
    logNewsletterTrace(traceId, 'subscribe_invalid_email', email);
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const isCaptchaValid = await verifyTurnstileToken(captchaToken, req.ip);
  if (!isCaptchaValid) {
    logNewsletterTrace(traceId, 'subscribe_turnstile_rejected', email);
    return res.status(400).json({ error: 'Security verification failed. Please try again.' });
  }

  logNewsletterTrace(traceId, 'subscribe_turnstile_passed', email);

  const subscribers = readNewsletterSubscribers();
  const now = new Date().toISOString();

  let subscriber = subscribers.find(item => item && item.email === email);

  if (!subscriber) {
    subscriber = {
      email,
      source: source || NEWSLETTER_SOURCE,
      pageUrl: pageUrl || '',
      preferredLanguage,
      frequency,
      language: preferredLanguage,
      crmType,
      tags: NEWSLETTER_TAGS,
      status: NEWSLETTER_STATUS_PENDING,
      mailingListStatus: 'pending',
      createdAt: now,
      updatedAt: now
    };
    subscribers.push(subscriber);
  }

  const token = hasReusablePendingConfirmationToken(subscriber)
    ? {
      rawToken: subscriber.confirmationTokenRaw,
      tokenHash: subscriber.confirmationTokenHash,
      expiresAt: subscriber.confirmationTokenExpiresAt
    }
    : createConfirmationToken(email);

  subscriber.source = source || NEWSLETTER_SOURCE;
  subscriber.pageUrl = pageUrl || subscriber.pageUrl || '';
  subscriber.preferredLanguage = preferredLanguage;
  subscriber.frequency = frequency;
  subscriber.language = preferredLanguage || subscriber.language || 'en';
  subscriber.crmType = crmType;
  subscriber.tags = NEWSLETTER_TAGS;
  subscriber.status = NEWSLETTER_STATUS_PENDING;
  subscriber.mailingListStatus = 'pending';
  subscriber.unsubscribedAt = null;
  subscriber.confirmedAt = subscriber.confirmedAt || null;
  subscriber.confirmationTokenRaw = token.rawToken;
  subscriber.confirmationTokenHash = token.tokenHash;
  subscriber.confirmationTokenExpiresAt = token.expiresAt;
  subscriber.updatedAt = now;

  try {
    const crmRecord = await upsertCrmSubscriber(email, NEWSLETTER_STATUS_PENDING, crmType);
    if (crmRecord) {
      subscriber.crmModel = crmRecord.model;
      subscriber.crmRecordId = crmRecord.id;
      logNewsletterTrace(traceId, 'subscribe_crm_pending_synced', email, {
        crmModel: crmRecord.model,
        crmRecordId: crmRecord.id
      });
    } else {
      logNewsletterTrace(traceId, 'subscribe_crm_pending_skipped', email, {
        odooEnabled: ODOO_ENABLED
      });
    }
  } catch (err) {
    console.error('CRM sync (pending) failed:', err.message);
    logNewsletterTrace(traceId, 'subscribe_crm_pending_failed', email, {
      error: err.message
    });
  }

  try {
    const confirmationLink = buildConfirmationLink(token.rawToken);
    const delivery = await sendDoubleOptInEmail(email, confirmationLink);
    subscriber.confirmationEmailMessageId = delivery.messageId || null;
    subscriber.confirmationEmailAcceptedAt = new Date().toISOString();
    subscriber.confirmationEmailResponse = delivery.response || null;
    logNewsletterTrace(traceId, 'subscribe_confirmation_email_sent', email, {
      messageId: delivery.messageId || null,
      response: delivery.response || null,
      acceptedCount: Array.isArray(delivery.accepted) ? delivery.accepted.length : null,
      rejectedCount: Array.isArray(delivery.rejected) ? delivery.rejected.length : null
    });
  } catch (err) {
    console.error('Failed to send confirmation email:', err.message);
    logNewsletterTrace(traceId, 'subscribe_confirmation_email_failed', email, {
      error: err.message
    });
    return res.status(500).json({
      error:
        'Subscription received, but email delivery is unavailable right now. Please try again later.'
    });
  }

  writeNewsletterSubscribers(subscribers);
  logNewsletterTrace(traceId, 'subscribe_saved_pending', email, {
    subscriberCount: subscribers.length
  });

  return res.status(202).json({
    ok: true,
    status: 'pending_confirmation',
    message: 'Thank you for subscribing! Please check your inbox to confirm your email.'
  });
});

app.post('/api/demo-request', newsletterLimiter, requireAllowedOrigin, async (req, res) => {
  const traceId = createNewsletterTraceId();
  const email = sanitizeEmail(req.body && req.body.email);
  const firstName = sanitizeInput(req.body && req.body.firstName).slice(0, 80);
  const lastName = sanitizeInput(req.body && req.body.lastName).slice(0, 80);
  const phone = sanitizeInput(req.body && req.body.phone).slice(0, 40);
  const company = sanitizeInput(req.body && req.body.company).slice(0, 120);
  const service = sanitizeInput(req.body && req.body.service).slice(0, 120);
  const preferredDate = sanitizeInput(req.body && req.body.preferredDate).slice(0, 40);
  const preferredTime = sanitizeInput(req.body && req.body.preferredTime).slice(0, 40);
  const notes = sanitizeInput(req.body && req.body.notes).slice(0, 1000);
  const source = sanitizeInput(req.body && req.body.source).slice(0, 120) || 'Book a Free Demo';
  const pageUrl = sanitizeInput(req.body && req.body.pageUrl).slice(0, 300);
  const language = sanitizeInput(req.body && req.body.language).slice(0, 20);
  const captchaToken = sanitizeCaptchaToken(req.body && req.body.captchaToken);

  logNewsletterTrace(traceId, 'demo_request_received', email, {
    source,
    language: language || 'en',
    hasCaptchaToken: Boolean(captchaToken),
    ip: rateLimitKey(req),
    pageUrl,
    crmType: 'opportunity'
  });

  if (!isValidEmail(email)) {
    logNewsletterTrace(traceId, 'demo_request_invalid_email', email);
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const isCaptchaValid = await verifyTurnstileToken(captchaToken, req.ip);
  if (!isCaptchaValid) {
    logNewsletterTrace(traceId, 'demo_request_turnstile_rejected', email);
    return res.status(400).json({ error: 'Security verification failed. Please try again.' });
  }

  logNewsletterTrace(traceId, 'demo_request_turnstile_passed', email);

  try {
    const crmRecord = await upsertDemoOpportunity({
      email,
      firstName,
      lastName,
      phone,
      company,
      service,
      preferredDate,
      preferredTime,
      notes,
      source,
      pageUrl
    });

    if (crmRecord) {
      logNewsletterTrace(traceId, 'demo_request_crm_synced', email, {
        crmModel: crmRecord.model,
        crmRecordId: crmRecord.id
      });
    } else {
      logNewsletterTrace(traceId, 'demo_request_crm_skipped', email, {
        odooEnabled: ODOO_ENABLED
      });
    }
  } catch (err) {
    console.error('CRM sync (demo request) failed:', err.message);
    logNewsletterTrace(traceId, 'demo_request_crm_failed', email, {
      error: err.message
    });
    return res.status(500).json({ error: 'Could not save the demo request right now. Please try again.' });
  }

  return res.status(202).json({
    ok: true,
    status: 'received',
    message: 'Thanks. Your demo request was received and will be handled as a sales opportunity.'
  });
});

app.get('/api/public-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    requireTurnstile: Boolean(TURNSTILE_SECRET_KEY),
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    turnstileAction: TURNSTILE_EXPECTED_ACTION
  });
});

app.get('/api/newsletter/confirm', async (req, res) => {
  const traceId = createNewsletterTraceId();
  const rawToken = sanitizeInput(req.query && req.query.token).slice(0, 2048);

  logNewsletterTrace(traceId, 'confirm_request_received', 'unknown', {
    hasToken: Boolean(rawToken),
    ip: rateLimitKey(req)
  });

  if (!rawToken) {
    logNewsletterTrace(traceId, 'confirm_missing_token', 'unknown');
    return res
      .status(400)
      .send(
        renderStatusPage('Confirmation Failed', 'This confirmation link is invalid or incomplete.')
      );
  }

  const subscribers = readNewsletterSubscribers();
  const signedPayload = PREF_TOKEN.verifyPreferencesToken(
    rawToken,
    NEWSLETTER_CONFIRMATION_SECRET,
    NEWSLETTER_TOKEN_TTL_HOURS / 24
  );

  let subscriber = null;
  if (signedPayload && signedPayload.email) {
    subscriber = subscribers.find(item => item && item.email === signedPayload.email);
  }

  if (!subscriber) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    subscriber = subscribers.find(
      item => item && item.confirmationTokenHash === tokenHash
    );
  }

  if (!subscriber) {
    logNewsletterTrace(traceId, 'confirm_token_not_found', 'unknown');
    return res
      .status(400)
      .send(
        renderStatusPage(
          'Confirmation Failed',
          'This confirmation link is invalid or expired. Please subscribe again.'
        )
      );
  }

  const expiresAt = Date.parse(subscriber.confirmationTokenExpiresAt || '');
  if (!signedPayload && (!Number.isFinite(expiresAt) || Date.now() > expiresAt)) {
    logNewsletterTrace(traceId, 'confirm_token_expired', subscriber.email);
    return res
      .status(400)
      .send(
        renderStatusPage(
          'Confirmation Expired',
          'This confirmation link has expired. Please subscribe again to receive a new link.'
        )
      );
  }

  subscriber.status = NEWSLETTER_STATUS_CONFIRMED;
  subscriber.confirmedAt = new Date().toISOString();
  subscriber.preferredLanguage = normalizeNewsletterLanguage(subscriber.preferredLanguage);
  subscriber.frequency = normalizeNewsletterFrequency(subscriber.frequency);
  subscriber.confirmationTokenRaw = null;
  subscriber.confirmationTokenHash = null;
  subscriber.confirmationTokenExpiresAt = null;
  subscriber.mailingListStatus = 'active';
  subscriber.updatedAt = new Date().toISOString();
  const crmType = determineCrmType(subscriber.source, subscriber.pageUrl, subscriber.crmType);
  subscriber.crmType = crmType;
  logNewsletterTrace(traceId, 'confirm_marked_active', subscriber.email);

  try {
    const crmRecord = await upsertCrmSubscriber(subscriber.email, NEWSLETTER_STATUS_CONFIRMED, crmType);
    if (crmRecord) {
      subscriber.crmModel = crmRecord.model;
      subscriber.crmRecordId = crmRecord.id;
      logNewsletterTrace(traceId, 'confirm_crm_synced', subscriber.email, {
        crmModel: crmRecord.model,
        crmRecordId: crmRecord.id
      });
    } else {
      logNewsletterTrace(traceId, 'confirm_crm_skipped', subscriber.email, {
        odooEnabled: ODOO_ENABLED
      });
    }
  } catch (err) {
    console.error('CRM sync (confirmed) failed:', err.message);
    logNewsletterTrace(traceId, 'confirm_crm_failed', subscriber.email, {
      error: err.message
    });
  }

  try {
    const mailingContactId = await syncConfirmedToMailingList(subscriber.email);
    if (mailingContactId) {
      subscriber.mailingContactId = mailingContactId;
      logNewsletterTrace(traceId, 'confirm_mailing_synced', subscriber.email, {
        mailingContactId
      });
    } else {
      logNewsletterTrace(traceId, 'confirm_mailing_skipped', subscriber.email, {
        odooEnabled: ODOO_ENABLED
      });
    }
  } catch (err) {
    console.error('Mailing list sync failed:', err.message);
    subscriber.mailingListStatus = 'sync_failed';
    logNewsletterTrace(traceId, 'confirm_mailing_failed', subscriber.email, {
      error: err.message
    });
  }

  writeNewsletterSubscribers(subscribers);
  logNewsletterTrace(traceId, 'confirm_saved_active', subscriber.email, {
    subscriberCount: subscribers.length
  });

  setImmediate(() => {
    triggerWelcomeNewsletterSend({
      email: subscriber.email
    }, traceId).catch(err => {
      logNewsletterTrace(traceId, 'confirm_welcome_send_unhandled', subscriber.email, {
        error: err.message
      });
    });
  });

  const preferencesToken = buildPreferencesToken(subscriber.email);
  return res.send(
    renderPreferencesPage(
      subscriber,
      preferencesToken,
      'Your subscription is confirmed! Set your language and frequency preferences below.',
      true
    )
  );
});

app.get('/api/newsletter/preferences', (req, res) => {
  const rawToken = sanitizeInput(req.query && req.query.token).slice(0, 1024);
  const resolved = resolveSubscriberFromPreferencesToken(rawToken);

  if (!resolved) {
    return res
      .status(400)
      .send(
        renderStatusPage(
          'Invalid preferences link',
          'This preferences link is invalid or expired. Please subscribe again to receive a new link.'
        )
      );
  }

  return res.send(renderPreferencesPage(resolved.subscriber, rawToken, ''));
});

app.post('/api/newsletter/preferences', (req, res) => {
  const rawToken = sanitizeInput(req.body && req.body.token).slice(0, 1024);
  const action = sanitizeInput(req.body && req.body.action).slice(0, 40).toLowerCase();
  const afterSave = sanitizeInput(req.body && req.body.afterSave).slice(0, 20).toLowerCase();
  const preferredLanguage = normalizeNewsletterLanguage(req.body && req.body.preferredLanguage);
  const frequency = normalizeNewsletterFrequency(req.body && req.body.frequency);
  const resolved = resolveSubscriberFromPreferencesToken(rawToken);

  if (!resolved) {
    return res
      .status(400)
      .send(
        renderStatusPage(
          'Update failed',
          'This preferences link is invalid or expired. Please subscribe again to receive a new link.'
        )
      );
  }

  const now = new Date().toISOString();
  const subscriber = resolved.subscriber;
  subscriber.preferredLanguage = preferredLanguage;
  subscriber.frequency = frequency;
  subscriber.updatedAt = now;

  if (action === 'unsubscribe' || frequency === 'paused') {
    subscriber.status = NEWSLETTER_STATUS_UNSUBSCRIBED;
    subscriber.unsubscribedAt = now;
    subscriber.mailingListStatus = 'opt_out';
  } else {
    subscriber.status = NEWSLETTER_STATUS_CONFIRMED;
    subscriber.confirmedAt = subscriber.confirmedAt || now;
    subscriber.unsubscribedAt = null;
    subscriber.mailingListStatus = 'active';
  }

  writeNewsletterSubscribers(resolved.subscribers);

  const savedMessage = action === 'unsubscribe' || frequency === 'paused'
    ? 'Your subscription is now paused/unsubscribed. You will not receive new newsletters unless you reactivate it.'
    : 'Your newsletter preferences were saved successfully.';

  if (afterSave === 'complete') {
    return res.send(renderPreferencesCompletePage(action === 'unsubscribe' || frequency === 'paused'));
  }

  return res.send(renderPreferencesPage(subscriber, rawToken, savedMessage));
});

app.get('/api/newsletter/unsubscribe', (req, res) => {
  const rawToken = sanitizeInput(req.query && req.query.token).slice(0, 1024);
  const resolved = resolveSubscriberFromPreferencesToken(rawToken);

  if (!resolved) {
    return res
      .status(400)
      .send(
        renderStatusPage(
          'Unsubscribe failed',
          'This unsubscribe link is invalid or expired. Please try again from a newer newsletter email.'
        )
      );
  }

  const now = new Date().toISOString();
  resolved.subscriber.status = NEWSLETTER_STATUS_UNSUBSCRIBED;
  resolved.subscriber.frequency = 'paused';
  resolved.subscriber.mailingListStatus = 'opt_out';
  resolved.subscriber.unsubscribedAt = now;
  resolved.subscriber.updatedAt = now;
  writeNewsletterSubscribers(resolved.subscribers);

  return res.send(
    renderStatusPage(
      'You are unsubscribed',
      'Your email has been removed from active newsletter sends. You can re-enable it anytime from the Manage preferences link.'
    )
  );
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`GoCloud Chatbot API running on port ${PORT}`);
});
