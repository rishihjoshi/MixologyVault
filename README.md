# Mixology Vault

Know what you can pour tonight, from the bottles you already own.

A dependency-free Progressive Web App (vanilla HTML/CSS/JS, **no build step**). It runs
entirely from static files and is served from GitHub Pages. A single serverless function
on Vercel proxies the optional "scan your shelf" photo feature to Anthropic's Claude so the
API key never touches the browser.

## Features

- **My bar** — mark the ingredients you own and see what's in stock vs. missing.
- **Cocktails / Mocktails** — browse, search, and filter ~100 cocktails and zero-proof mocktails; save favourites (persisted on-device).
- **Decide** — pick a drink by mood, spirit, sweetness, and time of day, or **snap a photo** of your shelf and let Claude identify the bottles, then see what you can make.
- **Offline-first PWA** — installable, works offline via a service worker, with an in-app "new version" update banner.
- **21+ age gate** remembered on-device.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The whole app shell and logic |
| `cocktails.json`, `mocktails.json`, `ingredients.json` | Data |
| `sw.js`, `manifest.json` | Service worker + PWA manifest |
| `AppIcon.png`, `HeroImage.jpg` | App icon and hero background |
| `assets/img/` | Drink photos (only drinks listed in `DRINK_PHOTOS` in `app.js` get one) |
| `api/analyze.js` | Vercel serverless proxy for photo analysis (holds the Anthropic key) |
| `e2e/` | Playwright end-to-end tests |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |

## Local development

```bash
npm install            # dev-only: Playwright
npm run serve          # serves the site at http://localhost:3333
npm test               # runs the Playwright e2e suite (auto-starts the server)
npm run test:headed    # same, with a visible browser
npm run test:api       # runs the Vercel proxy handler tests (node:test, no browser)
npm run test:all       # test:api then the Playwright suite
```

First run only: `npx playwright install chromium` to fetch the browser binary.

The photo-scan feature calls the live Vercel proxy, whose CORS/Origin gate only allows the
production origin — so **photo scan won't work from `localhost`**. Everything else works
locally. The app degrades gracefully to "By mood" when the photo service is unreachable.

## Deployment

Two independent pieces:

1. **The app → GitHub Pages.** Every push to `main` triggers `.github/workflows/deploy.yml`,
   which stages only the app files (excluding tests, CI, `api/`, docs) and publishes them.
2. **The photo proxy → Vercel.** `api/analyze.js` is deployed to Vercel with the
   `ANTHROPIC_API_KEY` environment variable set in the Vercel dashboard. The key lives
   **only** there — never in the repo or any page asset. The model and prompt are pinned
   server-side, CORS + an `Origin` check are locked to the production origin, and there is a
   best-effort in-memory rate limit. **The hard cost ceiling is the spend limit on the
   Anthropic Console workspace that owns the key — set one.**

**Security headers.** `vercel.json` sends CSP (with `frame-ancestors 'none'`),
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS
for everything Vercel serves, plus a locked-down CSP and `no-store` for `/api/*`.
GitHub Pages can't set custom headers, so the Pages copy relies on the `<meta>` CSP in
`index.html` (which browsers can't apply `frame-ancestors`/`X-Frame-Options` from). Keep the
two CSPs in sync — an e2e test checks this.

## Release checklist

The app version is tracked in three places that must be bumped **together** each release:

- `APP_VERSION` in `app.js`
- `CACHE_NAME` in `sw.js` (bump the `-vN` suffix so clients pick up new assets)
- `version` in `package.json`

Then push to `main`. Returning users see the "A new version is ready" banner and reload onto
the fresh assets.

## Data notes

- Ingredient stock and favourites are stored in `localStorage`; there is no account or server state.
- `mood` values in the data use British spelling (`Cosy`); `app.js` also normalises any legacy `Cozy`.

## Please drink responsibly.
