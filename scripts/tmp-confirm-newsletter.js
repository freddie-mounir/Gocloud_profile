'use strict';

const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes('=')) {
      continue;
    }

    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

async function main() {
  const email = process.argv[2];
  const envPath = process.argv[3] || path.join(__dirname, '..', 'api', '.env');
  const helperPath = path.join(__dirname, 'newsletter-preferences-token.js');

  if (!email) {
    throw new Error('Email argument is required.');
  }

  const env = parseEnvFile(envPath);
  const secret = env.NEWSLETTER_CONFIRMATION_SECRET
    || env.NEWSLETTER_PREFERENCES_SECRET
    || env.SMTP_PASS
    || env.ZOHO_APP_PASSWORD
    || 'newsletter-confirmation-secret';

  const helper = require(helperPath);
  const token = helper.createPreferencesToken(email, secret, Date.now());
  const response = await fetch(`https://www.gocloudeg.com/api/newsletter/confirm?token=${encodeURIComponent(token)}`);
  const body = await response.text();

  console.log(`status=${response.status}`);
  console.log(body.includes('Subscription Confirmed'));
}

main().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
