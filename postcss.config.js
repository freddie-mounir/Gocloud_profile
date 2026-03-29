module.exports = {
  plugins: {
    'autoprefixer': {
      overrideBrowserslist: [
        'last 2 versions',
        '> 1%',
        'not dead',
        'not ie <= 11'
      ]
    },
    'cssnano': {
      preset: ['default', {
        discardComments: {
          removeAll: true
        },
        normalizeWhitespace: true,
        colormin: true,
        minifyFontValues: true,
        minifySelectors: true
      }]
    }
  }
};
