# Blog Localization Schema

Blog posts in `data/posts/*.json` can now use localized fields.

## Supported localized fields

Use object format for these fields:

- `title`
- `categoryLabel`
- `excerpt`
- `content`
- `author`

Use localized array objects for:

- `tags`

Example:

```json
{
  "id": "elite-insurance-system",
  "slug": "elite-insurance-system",
  "title": {
    "ar": "ما هو نظام إدارة التأمين الطبي ELITE؟ دليل شامل",
    "en": "What Is the ELITE Medical Insurance Management System?"
  },
  "category": "insurance",
  "categoryLabel": {
    "ar": "التأمين الطبي",
    "en": "Medical Insurance"
  },
  "excerpt": {
    "ar": "تعرّف على نظام ELITE لإدارة التأمين الطبي...",
    "en": "Discover ELITE, an integrated medical insurance platform..."
  },
  "content": {
    "ar": "<p>...</p>",
    "en": "<p>...</p>"
  },
  "author": {
    "ar": "فريق GoCloud",
    "en": "GoCloud Team"
  },
  "date": "2026-03-01",
  "image": "images/m-cloud-logo.jpg",
  "tags": [
    {
      "ar": "ELITE",
      "en": "ELITE"
    },
    {
      "ar": "تأمين طبي",
      "en": "Medical Insurance"
    }
  ],
  "featured": true
}
```

## Backward compatibility

Legacy string fields are still accepted, e.g. `"title": "..."`.

Legacy tag arrays are also accepted, e.g. `"tags": ["Odoo", "تأمين طبي"]`.

The build now normalizes legacy strings to Arabic values and falls back to Arabic if English is missing.

## Build warnings

The build prints warnings for posts missing required English fields:

- `title.en`
- `excerpt.en`
- `content.en`

This is expected until content migration is complete.

## Current status

- Phase 1: build normalization and fallback support complete
- Phase 2: localized blog route generation complete (`/blog` and `/blog/en`)
- Phase 3: content migration complete for `title`, `categoryLabel`, `excerpt`, `content`, and `author`
- Tags localization support is now available and can be migrated incrementally
