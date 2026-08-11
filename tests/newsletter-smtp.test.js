const assert = require('assert');
const { buildSmtpCandidates, getSmtpPassword } = require('../scripts/newsletter-smtp');

const candidates = buildSmtpCandidates({
  SMTP_HOST: 'smtp.zoho.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'marketing@gocloudeg.com',
  SMTP_PASS: 'demo-pass'
});

assert.ok(candidates.length >= 2, 'Expected multiple Zoho SMTP candidates');
assert.ok(candidates.some(candidate => candidate.host === 'smtp.zoho.com' && candidate.port === 587), 'Expected Zoho STARTTLS candidate');
assert.strictEqual(getSmtpPassword({ ZOHO_APP_PASSWORD: 'app-pass' }), 'app-pass');
console.log('newsletter SMTP helper test passed');
