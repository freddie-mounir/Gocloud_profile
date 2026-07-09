/**
 * Blog Build Script
 * Reads JSON posts from data/posts/, generates:
 *   1. data/_posts-index.json (metadata array for listing page)
 *   2. blog/{slug}.html (individual post pages via Pug)
 */

const fs = require('fs');
const path = require('path');
const pug = require('pug');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const INDEX_FILE = path.join(ROOT, 'data', '_posts-index.json');
const BLOG_OUT = path.join(ROOT, 'blog');
const BLOG_SCHEMA_DIR = path.join(BLOG_OUT, 'schema');
const POST_TEMPLATE = path.join(ROOT, 'src', 'blog', 'post.pug');
const INDEX_TEMPLATE = path.join(ROOT, 'src', 'blog', 'index.pug');

// Ensure output directory exists
if (!fs.existsSync(BLOG_OUT)) {
  fs.mkdirSync(BLOG_OUT, { recursive: true });
}
if (!fs.existsSync(BLOG_SCHEMA_DIR)) {
  fs.mkdirSync(BLOG_SCHEMA_DIR, { recursive: true });
}

// Remove previously generated schema files to avoid stale entries.
fs.readdirSync(BLOG_SCHEMA_DIR)
  .filter(f => f.endsWith('.json'))
  .forEach(f => fs.unlinkSync(path.join(BLOG_SCHEMA_DIR, f)));

// 1. Read all JSON post files
const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.log('  No blog posts found in data/posts/. Skipping blog build.');
  fs.writeFileSync(INDEX_FILE, '[]', 'utf8');
  process.exit(0);
}

const posts = files.map(file => {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  return JSON.parse(raw);
});

// Sort by date descending (newest first)
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

// 2. Generate posts index (metadata only — no content field)
const index = posts.map(({ content, ...meta }) => meta);
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
console.log(`  ✓ Generated ${INDEX_FILE} (${index.length} posts)`);

// 3. Compile individual post pages
const compileFn = pug.compileFile(POST_TEMPLATE, { pretty: true, basedir: path.join(ROOT, 'src', 'blog') });

posts.forEach(post => {
  // Build related posts (same category, exclude current, max 3)
  const related = posts
    .filter(p => p.category === post.category && p.id !== post.id)
    .slice(0, 3);

  const postSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
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
      '@id': `https://www.gocloudeg.com/blog/${post.slug}.html`
    }
  };

  fs.writeFileSync(
    path.join(BLOG_SCHEMA_DIR, `${post.slug}.json`),
    JSON.stringify(postSchema, null, 2),
    'utf8'
  );

  const html = compileFn({
    post,
    related,
    allPosts: index,
  });

  const outFile = path.join(BLOG_OUT, `${post.slug}.html`);
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  ✓ blog/${post.slug}.html`);
});

// 4. Compile blog index page
const indexCompileFn = pug.compileFile(INDEX_TEMPLATE, { pretty: true, basedir: path.join(ROOT, 'src', 'blog') });
const indexHtml = indexCompileFn({ posts: index });
fs.writeFileSync(path.join(BLOG_OUT, 'index.html'), indexHtml, 'utf8');
const blogSchema = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'مدونة GoCloud',
  description: 'مقالات متخصصة في إدارة التأمين الطبي وتطبيقات Odoo ERP',
  url: 'https://www.gocloudeg.com/blog/',
  publisher: {
    '@type': 'Organization',
    name: 'GoCloud',
    logo: {
      '@type': 'ImageObject',
      url: 'https://www.gocloudeg.com/images/gocloud-logo.png'
    }
  }
};
fs.writeFileSync(path.join(BLOG_SCHEMA_DIR, 'index.json'), JSON.stringify(blogSchema, null, 2), 'utf8');
console.log(`  ✓ blog/index.html`);

console.log(`  Blog build complete: ${posts.length} posts generated.`);
