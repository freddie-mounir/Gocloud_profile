/**
 * Blog Build Script
 * Reads JSON posts from data/posts/, generates:
 *   1. data/_posts-index.json (metadata array for listing page)
 *   2. blog/{slug}.html (individual post pages via Pug)
 *
 * Phase 1 localization support:
 * - Supports localized fields as objects: { ar: '...', en: '...' }
 * - Keeps backward compatibility with legacy string fields
 * - Uses Arabic as current output locale and records missing English fields
 */

const fs = require('fs');
const path = require('path');
const pug = require('pug');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const INDEX_FILE = path.join(ROOT, 'data', '_posts-index.json');
const BLOG_OUT = path.join(ROOT, 'blog');
const BLOG_SCHEMA_DIR = path.join(BLOG_OUT, 'schema');
const BLOG_EN_OUT = path.join(BLOG_OUT, 'en');
const BLOG_EN_SCHEMA_DIR = path.join(BLOG_EN_OUT, 'schema');
const POST_TEMPLATE = path.join(ROOT, 'src', 'blog', 'post.pug');
const INDEX_TEMPLATE = path.join(ROOT, 'src', 'blog', 'index.pug');
const DEFAULT_LOCALE = 'ar';
const FALLBACK_LOCALE = 'ar';
const LOCALE_SEQUENCE = ['ar', 'en'];

const LOCALE_CONFIG = {
  ar: {
    lang: 'ar',
    dir: 'rtl',
    outputDir: BLOG_OUT,
    schemaDir: BLOG_SCHEMA_DIR,
    pathPrefix: '../',
    canonicalBase: 'https://www.gocloudeg.com/blog/'
  },
  en: {
    lang: 'en',
    dir: 'ltr',
    outputDir: BLOG_EN_OUT,
    schemaDir: BLOG_EN_SCHEMA_DIR,
    pathPrefix: '../../',
    canonicalBase: 'https://www.gocloudeg.com/blog/en/'
  }
};

const LOCALIZED_FIELDS = ['title', 'categoryLabel', 'excerpt', 'content', 'author'];
const REQUIRED_EN_FIELDS = ['title', 'excerpt', 'content'];

const CATEGORY_LABELS = {
  insurance: {
    ar: 'التأمين الطبي',
    en: 'Medical Insurance'
  },
  odoo: {
    ar: 'تطبيقات أودو',
    en: 'Odoo Applications'
  }
};

const EXPERT_LINKS_BY_CATEGORY = {
  insurance: [
    {
      href: 'elite.html',
      title: {
        ar: 'نظام ELITE لإدارة التأمين الطبي',
        en: 'ELITE Medical Insurance Management System'
      },
      reason: {
        ar: 'حل متخصص لإدارة المطالبات وشبكات مقدمي الخدمة',
        en: 'A specialized solution for claims and provider network operations'
      }
    },
    {
      href: 'service.html',
      title: {
        ar: 'خدمات GoCloud للتحول الرقمي',
        en: 'GoCloud Digital Transformation Services'
      },
      reason: {
        ar: 'نظرة شاملة على الخدمات المناسبة لقطاع التأمين',
        en: 'A complete overview of services relevant to insurance companies'
      }
    },
    {
      href: 'contact.html',
      title: {
        ar: 'احجز استشارة مجانية مع خبراء GoCloud',
        en: 'Book a Free Consultation with GoCloud Experts'
      },
      reason: {
        ar: 'توصيات عملية حسب حجم شركتك ونموذج التشغيل',
        en: 'Practical recommendations based on your company size and operations'
      }
    }
  ],
  odoo: [
    {
      href: 'odoo-services.html',
      title: {
        ar: 'خدمات Odoo من GoCloud',
        en: 'GoCloud Odoo Services'
      },
      reason: {
        ar: 'تعرف على باقات التطبيق والدعم الفني',
        en: 'Explore implementation packages and support options'
      }
    },
    {
      href: 'odoo-imp.html',
      title: {
        ar: 'منهجية تطبيق Odoo خطوة بخطوة',
        en: 'Step-by-Step Odoo Implementation Methodology'
      },
      reason: {
        ar: 'دليل عملي لتقليل مخاطر التطبيق وتسريع الإطلاق',
        en: 'A practical guide to reduce implementation risks and accelerate go-live'
      }
    },
    {
      href: 'odoo-dev.html',
      title: {
        ar: 'تطوير وتخصيص Odoo للشركات',
        en: 'Odoo Development and Customization for Businesses'
      },
      reason: {
        ar: 'توسيع قدرات Odoo بما يناسب العمليات الفعلية',
        en: 'Extend Odoo capabilities to match real operational workflows'
      }
    }
  ]
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toLocalizedObject(value) {
  if (hasText(value)) {
    return { ar: value, en: null };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ar: hasText(value.ar) ? value.ar : null,
      en: hasText(value.en) ? value.en : null
    };
  }

  return { ar: null, en: null };
}

function toLocalizedTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(tag => {
    if (hasText(tag)) {
      return { ar: tag.trim(), en: null };
    }

    if (tag && typeof tag === 'object' && !Array.isArray(tag)) {
      return {
        ar: hasText(tag.ar) ? tag.ar.trim() : null,
        en: hasText(tag.en) ? tag.en.trim() : null
      };
    }

    return { ar: null, en: null };
  });
}

function pickLocalized(localized, locale = DEFAULT_LOCALE, fallbackLocale = FALLBACK_LOCALE) {
  if (!localized || typeof localized !== 'object') {
    return '';
  }

  if (hasText(localized[locale])) {
    return localized[locale].trim();
  }

  if (hasText(localized[fallbackLocale])) {
    return localized[fallbackLocale].trim();
  }

  if (hasText(localized.ar)) {
    return localized.ar.trim();
  }

  if (hasText(localized.en)) {
    return localized.en.trim();
  }

  return '';
}

function normalizePost(rawPost) {
  const localized = {};

  LOCALIZED_FIELDS.forEach(field => {
    localized[field] = toLocalizedObject(rawPost[field]);
  });

  // Derive default category labels when missing.
  if (!localized.categoryLabel.ar && CATEGORY_LABELS[rawPost.category]) {
    localized.categoryLabel.ar = CATEGORY_LABELS[rawPost.category].ar;
  }
  if (!localized.categoryLabel.en && CATEGORY_LABELS[rawPost.category]) {
    localized.categoryLabel.en = CATEGORY_LABELS[rawPost.category].en;
  }

  return {
    ...rawPost,
    title_i18n: localized.title,
    categoryLabel_i18n: localized.categoryLabel,
    excerpt_i18n: localized.excerpt,
    content_i18n: localized.content,
    author_i18n: localized.author,
    tags_i18n: toLocalizedTags(rawPost.tags),
    // Preserve existing template behavior using Arabic/default language strings.
    title: pickLocalized(localized.title),
    categoryLabel: pickLocalized(localized.categoryLabel),
    excerpt: pickLocalized(localized.excerpt),
    content: pickLocalized(localized.content),
    author: pickLocalized(localized.author),
    tags: toLocalizedTags(rawPost.tags).map(tag => pickLocalized(tag))
  };
}

function localizePost(post, locale = DEFAULT_LOCALE) {
  return {
    ...post,
    title: pickLocalized(post.title_i18n, locale),
    categoryLabel: pickLocalized(post.categoryLabel_i18n, locale),
    excerpt: pickLocalized(post.excerpt_i18n, locale),
    content: pickLocalized(post.content_i18n, locale),
    author: pickLocalized(post.author_i18n, locale),
    tags: (post.tags_i18n || []).map(tag => pickLocalized(tag, locale))
  };
}

function collectMissingEnglishFields(posts) {
  return posts
    .map(post => {
      const missing = REQUIRED_EN_FIELDS.filter(field => !hasText(post[`${field}_i18n`].en));
      return {
        id: post.id,
        slug: post.slug,
        missing
      };
    })
    .filter(entry => entry.missing.length > 0);
}

// Ensure output directory exists
if (!fs.existsSync(BLOG_OUT)) {
  fs.mkdirSync(BLOG_OUT, { recursive: true });
}
if (!fs.existsSync(BLOG_SCHEMA_DIR)) {
  fs.mkdirSync(BLOG_SCHEMA_DIR, { recursive: true });
}
if (!fs.existsSync(BLOG_EN_OUT)) {
  fs.mkdirSync(BLOG_EN_OUT, { recursive: true });
}
if (!fs.existsSync(BLOG_EN_SCHEMA_DIR)) {
  fs.mkdirSync(BLOG_EN_SCHEMA_DIR, { recursive: true });
}

// Remove previously generated schema files to avoid stale entries.
[BLOG_SCHEMA_DIR, BLOG_EN_SCHEMA_DIR].forEach(schemaDir => {
  fs.readdirSync(schemaDir)
    .filter(f => f.endsWith('.json'))
    .forEach(f => fs.unlinkSync(path.join(schemaDir, f)));
});

// 1. Read all JSON post files
const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.log('  No blog posts found in data/posts/. Skipping blog build.');
  fs.writeFileSync(INDEX_FILE, '[]', 'utf8');
  process.exit(0);
}

const posts = files.map(file => {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  return normalizePost(JSON.parse(raw));
});

const missingEnglish = collectMissingEnglishFields(posts);
if (missingEnglish.length > 0) {
  console.warn(
    `  ⚠ Localization warning: ${missingEnglish.length} posts are missing required English fields (fallback to Arabic is active).`
  );
  missingEnglish.forEach(entry => {
    console.warn(`    - ${entry.slug}: missing [${entry.missing.join(', ')}]`);
  });
}

function getTagOverlap(postA, postB) {
  const tagsA = new Set((postA.tags || []).map(tag => String(tag).toLowerCase()));
  const tagsB = new Set((postB.tags || []).map(tag => String(tag).toLowerCase()));
  let overlap = 0;

  tagsB.forEach(tag => {
    if (tagsA.has(tag)) {
      overlap += 1;
    }
  });

  return overlap;
}

function getExpertCategoryLinks(category, locale) {
  const config = LOCALE_CONFIG[locale] || LOCALE_CONFIG[DEFAULT_LOCALE];
  const externalPrefix = config.pathPrefix;

  return (EXPERT_LINKS_BY_CATEGORY[category] || []).map(link => ({
    href: `${externalPrefix}${link.href}`,
    title: pickLocalized(link.title, locale),
    reason: pickLocalized(link.reason, locale)
  }));
}

function buildExpertBacklinks(currentPost, allPosts, locale) {
  const relatedByRelevance = allPosts
    .filter(post => post.id !== currentPost.id)
    .map(post => {
      const score = (post.category === currentPost.category ? 3 : 0) + getTagOverlap(currentPost, post);
      return { post, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(item => ({
      href: `${item.post.slug}.html`,
      title: item.post.title,
      reason: locale === 'en' ? 'A related article that expands this topic' : 'مقال مرتبط يكمّل نفس الموضوع'
    }));

  const categoryExpertLinks = getExpertCategoryLinks(currentPost.category, locale).slice(0, 2);
  const merged = [...relatedByRelevance, ...categoryExpertLinks];

  const deduped = [];
  const seen = new Set();
  merged.forEach(link => {
    if (!seen.has(link.href)) {
      seen.add(link.href);
      deduped.push(link);
    }
  });

  return deduped.slice(0, 4);
}

// Sort by date descending (newest first)
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

// 2. Generate posts index (metadata only — no content field)
const index = posts.map(({ content, content_i18n, ...meta }) => meta);
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
console.log(`  ✓ Generated ${INDEX_FILE} (${index.length} posts)`);

// 3. Compile individual post pages
const compileFn = pug.compileFile(POST_TEMPLATE, { pretty: true, basedir: path.join(ROOT, 'src', 'blog') });

LOCALE_SEQUENCE.forEach(locale => {
  const cfg = LOCALE_CONFIG[locale];
  const localizedPosts = posts.map(item => localizePost(item, locale));

  localizedPosts.forEach(post => {
    // Build related posts (same category, exclude current, max 3)
    const related = localizedPosts
      .filter(p => p.category === post.category && p.id !== post.id)
      .slice(0, 3);
    const expertBacklinks = buildExpertBacklinks(post, localizedPosts, locale);

    const postCanonical = `${cfg.canonicalBase}${post.slug}.html`;
    const postArUrl = `${LOCALE_CONFIG.ar.canonicalBase}${post.slug}.html`;
    const postEnUrl = `${LOCALE_CONFIG.en.canonicalBase}${post.slug}.html`;

    const postSchema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      inLanguage: locale,
      headline: post.title,
      description: post.excerpt,
      image: `https://www.gocloudeg.com/${post.image}`,
      datePublished: post.date,
      author: { '@type': 'Person', name: post.author },
      publisher: {
        '@type': 'Organization',
        name: 'GoCloud',
        logo: {
          '@type': 'ImageObject',
          url: 'https://www.gocloudeg.com/images/gocloud-logo.png'
        }
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': postCanonical
      }
    };

    fs.writeFileSync(
      path.join(cfg.schemaDir, `${post.slug}.json`),
      JSON.stringify(postSchema, null, 2),
      'utf8'
    );

    const html = compileFn({
      post,
      related,
      expertBacklinks,
      allPosts: localizedPosts,
      pageLang: cfg.lang,
      pageDir: cfg.dir,
      pathPrefix: cfg.pathPrefix,
      canonicalUrl: postCanonical,
      alternateArUrl: postArUrl,
      alternateEnUrl: postEnUrl
    });

    const outFile = path.join(cfg.outputDir, `${post.slug}.html`);
    fs.writeFileSync(outFile, html, 'utf8');

    const outputLabel = locale === 'en' ? `blog/en/${post.slug}.html` : `blog/${post.slug}.html`;
    console.log(`  ✓ ${outputLabel}`);
  });
});

// 4. Compile blog index page
const indexCompileFn = pug.compileFile(INDEX_TEMPLATE, { pretty: true, basedir: path.join(ROOT, 'src', 'blog') });
LOCALE_SEQUENCE.forEach(locale => {
  const cfg = LOCALE_CONFIG[locale];
  const localizedIndex = index.map(post => localizePost(post, locale));
  const indexCanonical = `${cfg.canonicalBase}`;

  const indexHtml = indexCompileFn({
    posts: localizedIndex,
    pageLang: cfg.lang,
    pageDir: cfg.dir,
    pathPrefix: cfg.pathPrefix,
    canonicalUrl: indexCanonical,
    alternateArUrl: LOCALE_CONFIG.ar.canonicalBase,
    alternateEnUrl: LOCALE_CONFIG.en.canonicalBase
  });

  fs.writeFileSync(path.join(cfg.outputDir, 'index.html'), indexHtml, 'utf8');

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    inLanguage: locale,
    name: locale === 'en' ? 'GoCloud Blog' : 'مدونة GoCloud',
    description:
      locale === 'en'
        ? 'Specialized articles in medical insurance management and Odoo ERP applications'
        : 'مقالات متخصصة في إدارة التأمين الطبي وتطبيقات Odoo ERP',
    url: indexCanonical,
    publisher: {
      '@type': 'Organization',
      name: 'GoCloud',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.gocloudeg.com/images/gocloud-logo.png'
      }
    }
  };

  fs.writeFileSync(path.join(cfg.schemaDir, 'index.json'), JSON.stringify(blogSchema, null, 2), 'utf8');
  console.log(`  ✓ ${locale === 'en' ? 'blog/en/index.html' : 'blog/index.html'}`);
});

console.log(`  Blog build complete: ${posts.length} posts generated.`);
