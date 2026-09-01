'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const automation = require('./newsletter-automation');
const tokenHelper = require('./newsletter-preferences-token');

function parseEnv(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) {
    return values;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function extractLinks(html) {
  return [...String(html || '').matchAll(/href="([^"]+)"/g)].map(match => match[1]);
}

function classifyLink(rawUrl) {
  const url = new URL(rawUrl);
  if (url.hostname === 'wa.me') {
    return 'whatsapp';
  }
  if (url.pathname === '/api/newsletter/preferences') {
    return 'preferences';
  }
  if (url.pathname === '/api/newsletter/unsubscribe') {
    return 'unsubscribe';
  }
  if (url.pathname.startsWith('/blog/')) {
    return 'article';
  }
  return 'other';
}

async function fetchSafe(url, expectedStatuses = [200]) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    return {
      ok: expectedStatuses.includes(response.status),
      status: response.status
    };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function main() {
  const env = {
    ...parseEnv(path.join(ROOT, 'api', '.env')),
    ...process.env
  };
  const recipient = env.NEWSLETTER_AUDIT_EMAIL || 'walid.azhary@gocloudeg.com';
  const secret =
    env.NEWSLETTER_PREFERENCES_SECRET ||
    env.SMTP_PASS ||
    env.ZOHO_APP_PASSWORD ||
    'newsletter-secret';
  const confirmationSecret =
    env.NEWSLETTER_CONFIRMATION_SECRET ||
    env.NEWSLETTER_PREFERENCES_SECRET ||
    env.SMTP_PASS ||
    env.ZOHO_APP_PASSWORD ||
    'newsletter-confirmation-secret';
  const calendar = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'newsletter', 'calendar.json'), 'utf8'));
  const postFiles = fs.readdirSync(path.join(ROOT, 'data', 'posts'));
  const variants = [];
  const failures = [];
  const safeUrls = new Map();

  for (const entry of calendar.entries || []) {
    const postFile = postFiles.find(file => file === `${entry.postSlug}.json` || file.endsWith(`-${entry.postSlug}.json`));
    const post = postFile
      ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts', postFile), 'utf8'))
      : {};

    for (const mode of ['en', 'ar', 'bilingual']) {
      const rendered = mode === 'bilingual'
        ? automation.buildBilingualEmail(entry, post)
        : automation.buildSingleLanguageEmail(entry, post, mode);
      const recipientLinks = automation.buildRecipientLinks({ email: recipient }, entry.id, mode);
      const html = rendered.bodyHtml
        .split('__GC_PREF_URL__').join(recipientLinks.preferencesUrl)
        .split('__GC_UNSUB_URL__').join(recipientLinks.unsubscribeUrl);
      const links = extractLinks(html).filter(link => link.startsWith('http'));
      const types = links.map(classifyLink);
      const expected = ['preferences', 'unsubscribe', 'article', 'whatsapp'];

      for (const type of expected) {
        if (!types.includes(type)) {
          failures.push(`${entry.id}/${mode}: missing ${type} link`);
        }
      }

      for (const link of links) {
        const type = classifyLink(link);
        const url = new URL(link);
        if (type === 'preferences' || type === 'unsubscribe') {
          const token = url.searchParams.get('token');
          const verified = tokenHelper.verifyPreferencesToken(token, secret, 3650);
          if (!verified || verified.email !== recipient) {
            failures.push(`${entry.id}/${mode}: invalid ${type} token`);
          }
        }
        if (type === 'article' || type === 'whatsapp' || type === 'preferences') {
          safeUrls.set(link, type);
        }
      }

      variants.push({ entryId: entry.id, mode, linkCount: links.length, types: [...new Set(types)] });
    }
  }

  const confirmationToken = tokenHelper.createPreferencesToken(recipient, confirmationSecret);
  const confirmationUrl = new URL(env.NEWSLETTER_CONFIRMATION_URL || 'https://www.gocloudeg.com/api/newsletter/confirm');
  confirmationUrl.searchParams.set('token', confirmationToken);
  const verifiedConfirmation = tokenHelper.verifyPreferencesToken(confirmationToken, confirmationSecret, 2);
  if (!verifiedConfirmation || verifiedConfirmation.email !== recipient || confirmationUrl.pathname !== '/api/newsletter/confirm') {
    failures.push('confirmation: invalid confirmation URL or token');
  }

  const confirmationPreferencesToken = tokenHelper.createPreferencesToken(recipient, secret);
  const confirmationPreferencesUrl = new URL(
    env.NEWSLETTER_PREFERENCES_URL || 'https://www.gocloudeg.com/api/newsletter/preferences'
  );
  confirmationPreferencesUrl.searchParams.set('token', confirmationPreferencesToken);
  const confirmationUnsubscribeUrl = new URL(
    env.NEWSLETTER_UNSUBSCRIBE_URL || 'https://www.gocloudeg.com/api/newsletter/unsubscribe'
  );
  confirmationUnsubscribeUrl.searchParams.set('token', confirmationPreferencesToken);
  const verifiedConfirmationPreferences = tokenHelper.verifyPreferencesToken(
    confirmationPreferencesToken,
    secret,
    3650
  );
  if (
    !verifiedConfirmationPreferences ||
    verifiedConfirmationPreferences.email !== recipient ||
    confirmationPreferencesUrl.pathname !== '/api/newsletter/preferences' ||
    confirmationUnsubscribeUrl.pathname !== '/api/newsletter/unsubscribe'
  ) {
    failures.push('confirmation email: invalid preferences or unsubscribe link');
  }
  safeUrls.set(confirmationPreferencesUrl.toString(), 'preferences');

  const networkResults = [];
  for (const [url, type] of safeUrls) {
    const expectedStatuses = type === 'whatsapp' ? [200, 301, 302, 303, 307, 308] : [200];
    const result = await fetchSafe(url, expectedStatuses);
    networkResults.push({ type, url, ...result });
    if (!result.ok) {
      failures.push(`${type}: HTTP ${result.status} ${url}`);
    }
  }

  const report = {
    ok: failures.length === 0,
    recipient,
    confirmation: {
      path: confirmationUrl.pathname,
      tokenValid: Boolean(verifiedConfirmation),
      preferencesPath: confirmationPreferencesUrl.pathname,
      preferencesTokenValid: Boolean(verifiedConfirmationPreferences),
      unsubscribePath: confirmationUnsubscribeUrl.pathname,
      article: 'not applicable',
      whatsapp: 'not applicable',
      requested: false,
      reason: 'Not requested because confirming has subscriber and welcome-email side effects.'
    },
    unsubscribe: {
      tokensValidated: true,
      requested: false,
      reason: 'Not requested because GET /unsubscribe immediately changes subscriber status.'
    },
    variantsChecked: variants.length,
    variants,
    networkChecks: networkResults.length,
    failures
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});