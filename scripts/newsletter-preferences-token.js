'use strict';

const crypto = require('crypto');

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4 !== 0) {
    input += '=';
  }
  return Buffer.from(input, 'base64');
}

function createPreferencesToken(email, secret, issuedAt) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !secret) {
    return '';
  }

  const payload = {
    email: normalizedEmail,
    iat: Number.isFinite(issuedAt) ? Number(issuedAt) : Date.now()
  };

  const payloadEncoded = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = crypto
    .createHmac('sha256', String(secret))
    .update(payloadEncoded)
    .digest();

  return `${payloadEncoded}.${toBase64Url(signature)}`;
}

function verifyPreferencesToken(token, secret, maxAgeDays) {
  const raw = String(token || '').trim();
  if (!raw || !secret || !raw.includes('.')) {
    return null;
  }

  const parts = raw.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const payloadEncoded = parts[0];
  const providedSignature = parts[1];

  const expectedSignature = toBase64Url(
    crypto
      .createHmac('sha256', String(secret))
      .update(payloadEncoded)
      .digest()
  );

  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded).toString('utf8'));
  } catch (error) {
    return null;
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const iat = Number(payload.iat || 0);
  if (!email || !iat) {
    return null;
  }

  const maxDays = Number(maxAgeDays || 3650);
  const maxAgeMs = maxDays > 0 ? maxDays * 24 * 60 * 60 * 1000 : 0;
  if (maxAgeMs > 0 && Date.now() - iat > maxAgeMs) {
    return null;
  }

  return {
    email,
    issuedAt: new Date(iat).toISOString()
  };
}

module.exports = {
  createPreferencesToken,
  verifyPreferencesToken
};
