const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outputFile = path.join(root, 'docs', 'newsletter-campaign', 'campaign-plan.json');

if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

execFileSync(process.execPath, [path.join(root, 'scripts', 'newsletter-automation.js'), '--plan'], {
  cwd: root,
  stdio: 'pipe'
});

assert.ok(fs.existsSync(outputFile), 'Expected campaign plan to be generated');
console.log('newsletter CLI plan generation test passed');
