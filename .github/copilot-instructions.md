# GoCloud Profile Website — Copilot Instructions

## Project Context

This is the **GoCloud company profile website** — a static/semi-static website built with modern build tools and deployed to IIS.

## Tech Stack

- **Templating:** Pug (compiled to HTML)
- **Styling:** CSS with PostCSS (autoprefixer, cssnano)
- **JavaScript:** Vanilla ES2021+ (no framework)
- **Build Tools:** npm scripts, PurgeCSS, Terser (JS minification)
- **Deployment:** IIS via `deploy-iis.ps1` and `web.config`
- **Linting:** ESLint (eslint:recommended)
- **Formatting:** Prettier

## Code Style (Enforced)

These rules are enforced by ESLint and Prettier — follow them exactly:

- **Indentation:** 2 spaces (all files)
- **Quotes:** Single quotes in JS
- **Semicolons:** Always
- **Trailing commas:** None
- **Print width:** 100 characters
- **Line endings:** LF (Unix-style)
- **Arrow parens:** Avoid when possible (`x => x` not `(x) => x`)
- **Equality:** Always use strict equality (`===`)
- **Curly braces:** Always required (even single-line `if`)
- **No console.log:** Use `console.warn` or `console.error` only

## File Structure

```
├── views/           # Pug templates → compiled to HTML
├── components/      # Reusable Pug components/mixins
├── css/             # Stylesheets (processed by PostCSS)
├── js/              # Client-side JavaScript
├── images/          # Optimized images
├── fonts/           # Web fonts
├── docs/            # Internal documentation
├── deployment/      # Deployment scripts and configs
```

## Build Commands

- `npm run dev` — Watch mode (development)
- `npm run build:prod` — Production build (compile + optimize)
- `npm run lint` / `npm run lint:fix` — Check / fix linting
- `npm run format` — Format with Prettier
- `npm run serve` — Local HTTP server on port 8000

## Conventions

- Keep JavaScript lightweight — no heavy frameworks. Vanilla JS with progressive enhancement.
- Images should be optimized before committing.
- CSS uses utility classes where appropriate; avoid deep nesting.
- All HTML output must be accessible (semantic elements, ARIA attributes, alt text).

## Do NOT

- Add npm packages without justification — keep the dependency footprint minimal
- Use `var` — always `const` or `let`
- Commit `node_modules/` or minified output files to git
- Use inline styles or inline JavaScript in HTML/Pug templates
