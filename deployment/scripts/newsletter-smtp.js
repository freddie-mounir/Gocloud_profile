'use strict';

function getSmtpPassword(env = process.env) {
  return env.SMTP_PASS || env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD || '';
}

function buildSmtpCandidates(env = process.env) {
  const user = String(env.SMTP_USER || '').trim();
  const pass = getSmtpPassword(env);
  const host = String(env.SMTP_HOST || 'smtp.zoho.com').trim() || 'smtp.zoho.com';
  const explicitPort = env.SMTP_PORT ? Number(env.SMTP_PORT) : null;
  const secureOverride = String(env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  const hosts = [host];
  if (host === 'smtp.zoho.com') {
    hosts.push('smtp.zoho.eu');
  } else if (host === 'smtp.zoho.eu') {
    hosts.push('smtp.zoho.com');
  }

  const configs = [];

  const addConfig = (candidateHost, candidatePort, candidateSecure) => {
    configs.push({
      host: candidateHost,
      port: candidatePort,
      secure: candidateSecure,
      auth: user && pass ? { user, pass } : undefined,
      authMethod: 'LOGIN',
      requireTLS: candidatePort === 587
    });
  };

  if (explicitPort) {
    for (const candidateHost of hosts) {
      addConfig(candidateHost, explicitPort, explicitPort === 465 || secureOverride);
    }
    return configs;
  }

  for (const candidateHost of hosts) {
    addConfig(candidateHost, 465, true);
    addConfig(candidateHost, 587, false);
  }

  return configs;
}

module.exports = {
  buildSmtpCandidates,
  getSmtpPassword
};
