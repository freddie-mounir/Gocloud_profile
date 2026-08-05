/**
 * Critical CSS Extraction Configuration
 * Extracts above-the-fold CSS for faster initial page load
 */

module.exports = {
  // Base configuration
  base: 'dist/',
  src: 'index.html',
  target: {
    css: 'css/main.min.css',
    html: 'index.html',
    uncritical: 'css/non-critical.css'
  },
  
  // Dimensions for viewport simulation
  dimensions: [
    {
      width: 1920,
      height: 1080
    },
    {
      width: 1366,
      height: 768
    },
    {
      width: 768,
      height: 1024
    },
    {
      width: 375,
      height: 667
    }
  ],

  // Penthouse options
  penthouse: {
    timeout: 30000,
    maxEmbeddedBase64Length: 1000,
    renderWaitTime: 100,
    blockJSRequests: false
  },

  // Inline critical CSS
  inline: true,

  // Extract options
  extract: true,
  
  // Minify critical CSS
  minify: true,

  // Ignore specific rules
  ignore: {
    atrule: ['@font-face'],
    rule: [/\.no-critical/],
    decl: (node, value) => {
      // Ignore animations
      return /animation/.test(node.prop);
    }
  }
};

// Helper function to generate critical CSS for multiple pages
function generateCriticalCSS(pages) {
  const critical = require('critical');
  const promises = [];

  pages.forEach(page => {
    promises.push(
      critical.generate({
        base: 'dist/',
        src: `${page}.html`,
        target: `${page}.html`,
        inline: true,
        width: 1300,
        height: 900,
        minify: true,
        extract: true,
        ignore: {
          atrule: ['@font-face']
        }
      })
    );
  });

  return Promise.all(promises);
}

// Export for use in build scripts
module.exports.generateCriticalCSS = generateCriticalCSS;
