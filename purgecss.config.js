module.exports = {
  content: [
    './*.html',
    './views/**/*.pug',
    './components/**/*.pug',
    './js/**/*.js'
  ],
  css: ['./css/**/*.css'],
  output: './css/purged/',
  safelist: {
    standard: [
      /^is-/,
      /^has-/,
      /^active/,
      /^show/,
      /^modal/,
      /^fade/,
      /^collapse/,
      /^dropdown/,
      /^navbar/,
      /^carousel/,
      /^tooltip/,
      /^popover/,
      /^swiper/,
      /^aos/,
      /^gsap/
    ],
    deep: [],
    greedy: [
      /^data-/,
      /^aria-/
    ]
  },
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
}
