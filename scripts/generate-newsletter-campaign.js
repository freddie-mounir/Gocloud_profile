#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CALENDAR_PATH = path.join(ROOT, 'data', 'newsletter', 'calendar.json');
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'newsletter-campaign');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'campaign-plan.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugToPostPath(slug) {
  const candidates = [
    path.join(POSTS_DIR, `${slug}.json`),
    path.join(POSTS_DIR, `${slug}.md`),
    path.join(POSTS_DIR, `${slug}.html`)
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function buildEntry(entry, post) {
  const subject = entry.subjectOptions[0] || 'Practical updates from GoCloud';
  const preview = entry.previewText || post.excerpt?.en || post.excerpt?.ar || '';
  const title = post.title?.en || post.title?.ar || entry.title;
  const body = [
    `Hello,`,
    '',
    `This week we are sharing a practical perspective on ${entry.theme.toLowerCase()}.`,
    '',
    `Featured topic: ${title}`,
    '',
    preview,
    '',
    'Read the full article here:',
    entry.ctaUrl,
    '',
    'If you would like a tailored recommendation for your business, we would be happy to arrange a consultation.',
    '',
    'Best regards,',
    'GoCloud Team',
    'marketing@gocloudeg.com'
  ].join('\n');

  return {
    id: entry.id,
    sendDate: entry.sendDate,
    theme: entry.theme,
    title,
    subject,
    previewText: preview,
    body,
    ctaLabel: entry.ctaLabel,
    ctaUrl: entry.ctaUrl,
    postSlug: entry.postSlug
  };
}

function main() {
  if (!fs.existsSync(CALENDAR_PATH)) {
    throw new Error(`Missing calendar file: ${CALENDAR_PATH}`);
  }

  const calendar = readJson(CALENDAR_PATH);
  const entries = [];

  for (const entry of calendar.entries || []) {
    const postPath = slugToPostPath(entry.postSlug);
    if (!postPath) {
      entries.push({
        ...buildEntry(entry, {
          title: { en: entry.title, ar: entry.title },
          excerpt: { en: entry.previewText, ar: entry.previewText }
        }),
        postStatus: 'missing-post'
      });
      continue;
    }

    const post = readJson(postPath);
    entries.push({
      ...buildEntry(entry, post),
      postStatus: 'ready'
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), calendar, entries }, null, 2));

  console.log(`Generated ${entries.length} newsletter campaign entries in ${OUTPUT_FILE}`);
}

main();
