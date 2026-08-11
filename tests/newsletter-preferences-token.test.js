const assert = require('assert');
const tokenUtil = require('../scripts/newsletter-preferences-token');

const secret = 'unit-test-secret';
const token = tokenUtil.createPreferencesToken('User@Example.com', secret, Date.now());
assert.ok(token && token.includes('.'), 'Expected token format to include signature separator');

const decoded = tokenUtil.verifyPreferencesToken(token, secret, 3650);
assert.ok(decoded, 'Expected token to verify');
assert.strictEqual(decoded.email, 'user@example.com');

const invalid = tokenUtil.verifyPreferencesToken(`${token}x`, secret, 3650);
assert.strictEqual(invalid, null, 'Expected tampered token to fail verification');

console.log('newsletter preferences token test passed');
