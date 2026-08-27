'use strict';

// Sends an operational alert email to the admin using the existing SMTP config.
// Usage: node send-admin-alert.js --subject="..." --message="..." [--severity=critical]

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const nodemailer = require('nodemailer');
const SMTP_HELPER = require(path.join(__dirname, '..', 'scripts', 'newsletter-smtp'));

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = raw.match(/^--([^=]+)=([\s\S]*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

function buildFromHeader() {
  const from = process.env.SMTP_FROM || 'marketing@gocloudeg.com';
  const fromName = process.env.SMTP_FROM_NAME || 'GoCloud Monitoring';
  if (from.includes('<') && from.includes('>')) {
    return from;
  }
  return `${fromName} <${from}>`;
}

async function sendAlert({ subject, message, severity }) {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = SMTP_HELPER.getSmtpPassword(process.env);
  if (!user || !pass) {
    throw new Error('SMTP is not configured (SMTP_USER/SMTP_PASS missing).');
  }

  const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  const candidates = SMTP_HELPER.buildSmtpCandidates(process.env);

  let lastError = null;
  for (const config of candidates) {
    try {
      const transport = nodemailer.createTransport(config);
      await transport.sendMail({
        from: buildFromHeader(),
        to: adminEmail,
        subject: `[GoCloud ${severity || 'ALERT'}] ${subject}`,
        text: message,
        html: `<pre style="font-family:Consolas,monospace;white-space:pre-wrap;">${message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`
      });
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to send admin alert email.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subject = args.subject || 'Service alert';
  const message = args.message || 'A service issue was detected on the GoCloud production server.';
  const severity = args.severity || 'ALERT';

  try {
    await sendAlert({ subject, message, severity });
    console.log(JSON.stringify({ status: 'sent' }));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: error.message }));
    process.exit(1);
  }
}

main();
