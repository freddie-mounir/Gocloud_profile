'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.PORT || 3001;

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
const NEWSLETTER_TAGS = ['Newsletter', 'Inbound Lead'];
const NEWSLETTER_CONFIRMATION_BASE_URL =
  process.env.NEWSLETTER_CONFIRMATION_URL || 'https://www.gocloudeg.com/api/newsletter/confirm';
const NEWSLETTER_TOKEN_TTL_HOURS = Number(process.env.NEWSLETTER_TOKEN_TTL_HOURS || 48);
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_EXPECTED_ACTION = process.env.TURNSTILE_ACTION || 'newsletter_subscribe';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
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

function createConfirmationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + NEWSLETTER_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  return { rawToken, tokenHash, expiresAt };
}

function buildConfirmationLink(rawToken) {
  const url = new URL(NEWSLETTER_CONFIRMATION_BASE_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
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

  if (!transport) {
    throw new Error('SMTP is not configured.');
  }

  await transport.sendMail({
    from: buildFromHeader(),
    to: email,
    subject: NEWSLETTER_EMAIL_SUBJECT,
    text: [
      'Thank you for subscribing to GoCloud practical updates.',
      '',
      'Please confirm your subscription using this secure link:',
      confirmationLink,
      '',
      'If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: [
      '<p>Thank you for subscribing to GoCloud practical updates.</p>',
      '<p>Please confirm your subscription by clicking the secure link below:</p>',
      `<p><a href="${confirmationLink}">Confirm my subscription</a></p>`,
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
  const crmTypeOverride = sanitizeInput(req.body && req.body.crmType).slice(0, 30);
  const captchaToken = sanitizeCaptchaToken(req.body && req.body.captchaToken);
  const crmType = determineCrmType(source, pageUrl, crmTypeOverride);

  logNewsletterTrace(traceId, 'subscribe_request_received', email, {
    source: source || NEWSLETTER_SOURCE,
    language: language || 'en',
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
  const token = createConfirmationToken();

  let subscriber = subscribers.find(item => item && item.email === email);

  if (!subscriber) {
    subscriber = {
      email,
      source: source || NEWSLETTER_SOURCE,
      pageUrl: pageUrl || '',
      language: language || 'en',
      crmType,
      tags: NEWSLETTER_TAGS,
      status: NEWSLETTER_STATUS_PENDING,
      mailingListStatus: 'pending',
      createdAt: now,
      updatedAt: now
    };
    subscribers.push(subscriber);
  }

  subscriber.source = source || NEWSLETTER_SOURCE;
  subscriber.pageUrl = pageUrl || subscriber.pageUrl || '';
  subscriber.language = language || subscriber.language || 'en';
  subscriber.crmType = crmType;
  subscriber.tags = NEWSLETTER_TAGS;
  subscriber.status = NEWSLETTER_STATUS_PENDING;
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
    await sendDoubleOptInEmail(email, confirmationLink);
    logNewsletterTrace(traceId, 'subscribe_confirmation_email_sent', email);
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
  const rawToken = sanitizeInput(req.query && req.query.token).slice(0, 128);

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

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const subscribers = readNewsletterSubscribers();
  const subscriber = subscribers.find(
    item => item && item.confirmationTokenHash === tokenHash
  );

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
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
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

  return res.send(
    renderStatusPage(
      'Subscription Confirmed',
      'Your email is confirmed and now active for GoCloud practical updates.'
    )
  );
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`GoCloud Chatbot API running on port ${PORT}`);
});
