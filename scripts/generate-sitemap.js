const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const SITEMAP_PATHS = [
  path.join(ROOT, 'sitemap.xml'),
  path.join(ROOT, 'deployment', 'sitemap.xml')
];
const BASE_URL = 'https://www.gocloudeg.com';

function formatDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeUrlEntry(loc, options = {}) {
  return {
    loc,
    lastmod: options.lastmod || formatDate(new Date()),
    changefreq: options.changefreq || 'monthly',
    priority: options.priority || '0.7'
  };
}

function getPostEntries() {
  if (!fs.existsSync(POSTS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(POSTS_DIR).filter(name => name.endsWith('.json'));

  return files
    .map(file => {
      const fullPath = path.join(POSTS_DIR, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const post = JSON.parse(raw);

      if (!post.slug) {
        return [];
      }

      const lastmod = formatDate(post.date || fs.statSync(fullPath).mtime);

      return [
        makeUrlEntry(`${BASE_URL}/blog/${post.slug}.html`, {
          lastmod,
          changefreq: 'monthly',
          priority: '0.7'
        }),
        makeUrlEntry(`${BASE_URL}/blog/en/${post.slug}.html`, {
          lastmod,
          changefreq: 'monthly',
          priority: '0.7'
        })
      ];
    })
    .flat();
}

function buildSitemapXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  entries.forEach(entry => {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
    lines.push(`    <priority>${escapeXml(entry.priority)}</priority>`);
    lines.push('  </url>');
  });

  lines.push('</urlset>');
  lines.push('');
  return lines.join('\n');
}

function writeSitemaps(xml) {
  SITEMAP_PATHS.forEach(target => {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(target, xml, 'utf8');
    console.log(`  ✓ ${path.relative(ROOT, target).replace(/\\/g, '/')}`);
  });
}

const today = formatDate(new Date());

const staticEntries = [
  makeUrlEntry(`${BASE_URL}/`, { lastmod: today, changefreq: 'weekly', priority: '1.0' }),
  makeUrlEntry(`${BASE_URL}/about.html`, { lastmod: today, priority: '0.9' }),
  makeUrlEntry(`${BASE_URL}/business.html`, { lastmod: today, priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/contact.html`, { lastmod: today, priority: '0.9' }),
  makeUrlEntry(`${BASE_URL}/service.html`, { lastmod: today, priority: '0.9' }),
  makeUrlEntry(`${BASE_URL}/odoo-services.html`, { lastmod: today, priority: '0.9' }),
  makeUrlEntry(`${BASE_URL}/odoo-imp.html`, { lastmod: today, priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/odoo-dev.html`, { lastmod: today, priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/portfolio.html`, { lastmod: today, priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/elite.html`, { lastmod: today, priority: '0.9' }),
  makeUrlEntry(`${BASE_URL}/faq.html`, { lastmod: today, priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/privacy.html`, { lastmod: today, changefreq: 'yearly', priority: '0.5' }),
  makeUrlEntry(`${BASE_URL}/conditions-terms.html`, {
    lastmod: today,
    changefreq: 'yearly',
    priority: '0.5'
  }),
  makeUrlEntry(`${BASE_URL}/blog/`, { lastmod: today, changefreq: 'weekly', priority: '0.8' }),
  makeUrlEntry(`${BASE_URL}/blog/en/`, { lastmod: today, changefreq: 'weekly', priority: '0.8' })
];

const postEntries = getPostEntries();
const entries = [...staticEntries, ...postEntries];
const xml = buildSitemapXml(entries);

writeSitemaps(xml);
console.log(`  Sitemap build complete: ${entries.length} URLs.`);
