/**
 * Bundle local CSS and JS assets to reduce HTTP requests.
 * Concatenates small plugin files into single bundles.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// --- CSS Bundle ---
// Combine small local CSS files (nice-select + mobile-menu + font-loading)
const cssFiles = ['css/nice-select.min.css', 'css/mobile-menu.min.css', 'css/font-loading.css'];

const cssBundle = cssFiles
  .map(f => {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) {
      console.warn(`WARN: ${f} not found, skipping`);
      return '';
    }
    return `/* === ${f} === */\n${fs.readFileSync(full, 'utf8')}`;
  })
  .join('\n\n');

fs.writeFileSync(path.join(root, 'css/plugins-bundle.min.css'), cssBundle, 'utf8');
console.log(`✅ css/plugins-bundle.min.css (${(cssBundle.length / 1024).toFixed(1)} KB)`);

// --- JS Bundle ---
// Combine small local JS plugin files into one
const jsFiles = [
  'js/jquery.countup.min.js',
  'js/mobile-menu.min.js',
  'js/Splitetext.min.js',
  'js/text-animation.min.js',
  'js/SmoothScroll.min.js',
  'js/jquery.lineProgressbar.min.js',
  'js/ripple-btn.min.js',
  'js/typewriter.min.js'
];

const jsBundle = jsFiles
  .map(f => {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) {
      console.warn(`WARN: ${f} not found, skipping`);
      return '';
    }
    return `/* === ${f} === */\n${fs.readFileSync(full, 'utf8')}`;
  })
  .join('\n;\n');

fs.writeFileSync(path.join(root, 'js/plugins-bundle.min.js'), jsBundle, 'utf8');
console.log(`✅ js/plugins-bundle.min.js  (${(jsBundle.length / 1024).toFixed(1)} KB)`);
