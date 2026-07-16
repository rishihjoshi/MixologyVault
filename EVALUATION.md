# Mixology Vault — Audit & Evaluation

_Date: 2026-07-15 · Version: 2.0.0 · Scope: `claude/mixology-vault-audit-fe7db2`_

## 1. Executive summary

Mixology Vault is a static, dependency-free Progressive Web App (vanilla HTML/CSS/JS, no build step) served as GitHub Pages. This evaluation accompanies a release that:

1. **Removed the standalone "Snap" tab** and the entire **user-supplied API-key UI** (on-device `localStorage` key entry + settings overlay).
2. **Preserved the camera → cocktail-suggestion feature**, relocating it inside the **Decide** tab behind a `By mood` / `By photo` toggle.
3. **Moved the API key off the browser entirely**: photo analysis now calls a Vercel serverless proxy (`api/analyze.js`) that holds the key in its `ANTHROPIC_API_KEY` env var and forwards to Claude. No key is present in any page asset.
4. **Added version functionality**: a visible `v2.0.0` label plus a service-worker–driven "A new version is available → Refresh" update banner.

Overall the app is in good health: no framework attack surface, strict CSP, escaped output, and no inline event handlers. The earlier browser-side key exposure has been **closed** — the key now lives only in the Vercel proxy's env var (Section 3).

## 2. Scope & methodology

- **Reviewed:** `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`, `api/analyze.js` (Vercel proxy), `.github/workflows/deploy.yml`, and the JSON data files.
- **Method:** static reading of the diff, grep-based dead-code verification, and an automated Playwright E2E suite (`e2e/mixology.spec.js`) exercising the removal, relocation, versioning, navigation, and core flows.
- **Not in scope:** penetration testing of the live Anthropic endpoint, and load/perf profiling.

## 3. Security assessment

### 3.1 Improvements in this release
- **On-device key storage eliminated.** The `mv_anthropic_key` `localStorage` entry, the key-entry inputs, validation, and settings overlay are all gone. Verified: `grep` for `mv_anthropic_key`, `cam-key`, `cam-settings` returns nothing in the shipped source.
- **No secret in the repository.** `config.js` is committed with an empty string; the real key exists only as a GitHub Actions secret and is written into the deploy artifact, never into git.
- **Deploy artifact is minimized.** The workflow stages only app files (`_site/`), excluding `.git`, `.github`, `node_modules`, tests, and `EVALUATION.md`, so history and dev tooling are not published.

### 3.2 API key is now server-side (exposure closed)
Photo analysis posts `{ base64, mediaType }` to `https://mixology-vault.vercel.app/api/analyze`. The Vercel function attaches the key from its `ANTHROPIC_API_KEY` env var and forwards to Anthropic, returning Claude's response. The key is **never** in `config.js` (deleted), page assets, or network requests visible to the client. Hardening on the proxy:
- **CORS locked** to `https://rishihjoshi.github.io` (only the app's origin may call it).
- **Model + prompt pinned server-side**, so the key can't be abused for arbitrary Anthropic requests.
- **Payload guarded** (type + size); the client also downscales images to ≤1568px before upload.

**Remaining good-hygiene items:**
1. **Set a low monthly spend cap** on the key in the Anthropic console (the proxy is public-callable within the CORS allowlist).
2. **Revoke the previously-exposed key** that was briefly live in `config.js`.
3. **Rotate** by updating the Vercel env var and redeploying the function — no app change, and the key never touches the browser.

### 3.3 Standing posture (unchanged, verified healthy)
- **CSP** remains strict: `default-src 'self'`, `script-src 'self'` (no inline JS), `connect-src` limited to `'self'` and `https://mixology-vault.vercel.app` (the proxy), `object-src 'none'`, `frame-ancestors 'none'`.
- **Output escaping:** user/AI-derived strings pass through `esc()` before insertion; identified-ingredient chips and cocktail cards are escaped.
- **No inline handlers:** all events are wired via delegation in `init()` (consistent with prior security commits #7/#8).
- **Prototype-pollution guard** on `mv_ing_overrides` parsing is retained.

## 4. Code quality

- **Architecture:** single-file JS with clear sections; screens toggled via `switchScreen()` gated by `VALID_SCREENS` (now correctly excludes `camera`).
- **Reuse:** the relocated Snap flow reuses shared helpers (`labScoreCocktail`, `cardHTML`, `LAB_SPIRIT_GRAD`, `esc`) rather than duplicating logic — the move was surgical (IDs preserved), keeping churn low.
- **Dead code:** removed key-management functions (`camGetKey/Set/Clear`, `camHandleKeyChange`, `camShowSetup/Main`, `camSettings*`) and their listeners; grep confirms no dangling references.
- **Single source of truth for version:** `APP_VERSION` in `app.js` with a documented ritual to bump it alongside `CACHE_NAME` in `sw.js`.

## 5. PWA / functionality

- **Update flow (new):** `install` no longer calls `skipWaiting()` silently; instead a waiting worker surfaces the banner, and the user's Refresh click posts `SKIP_WAITING` → `controllerchange` → one clean reload. This prevents mid-session asset mismatch and makes updates visible.
- **Offline:** cache-first app shell; the Vercel proxy origin is never intercepted by the service worker. No key material is cached (there is no `config.js`).
- **Manifest:** standalone PWA with icons and shortcuts; unaffected by this release.
- **Graceful degradation:** with no key (local/dev), `By photo` shows a friendly "unavailable" notice and `By mood` remains fully functional — no errors.

## 6. Test coverage

**74 tests passing (Playwright, Chromium).** Run: `npm install && npm test`.

**Unit tests — `e2e/unit.spec.js` (57 tests).** Pure logic functions from `app.js` are exercised in isolation via `page.evaluate` (the app is a classic script, so its functions are globals):
- `esc()` / `safeMarkup()` — HTML-escaping incl. XSS payloads, null/number coercion, escape ordering.
- `normaliseSpiritKey()` — all spirit families, whisky synonyms, case-insensitivity, `other` fallback.
- `splitLines()`, `labBuildKeys()`, `labIngMatchesLine()`, `labScoreCocktail()` — recipe parsing, brand-key stripping, bidirectional matching, and scoring (perfect/partial/none + per-line detail).
- `camParseIngredients()` — array extraction from Claude replies, length/type filtering, trimming, and malformed-input handling (incl. a documented greedy-regex limitation).
- `camBuildIngObjects()`, `camHasKey()`, `cardHTML()` — object shaping, key gate, and output escaping.

**E2E tests — `e2e/mixology.spec.js` (17 tests):**
- **Removal regressions:** 4 nav buttons, no `#nb-camera`/`#screen-camera`, no `#nb-lab`/`#screen-lab`, no key UI, `mv_anthropic_key` never set.
- **Relocation:** capture UI lives in `#screen-decide`; `By photo` shows the unavailable notice with an empty key; `By mood` is the default.
- **Versioning:** `#app-version` = `v2.0.0`; `#update-banner` present and hidden.
- **Navigation:** each of the 4 tabs activates its screen; My Vault → "I can make" lists makeable cocktails (with empty-state).
- **Core flows:** Decide generate (3 picks), cocktail search + modal open, My Vault override persistence.

## 7. Prioritized recommendations

| # | Priority | Recommendation |
|---|----------|----------------|
| 1 | **High** | **Revoke the old key** that was briefly live in `config.js`; set a monthly **spend cap** on the new Vercel key. |
| 2 | Medium | Optionally add a lightweight rate-limit / per-session cap on the proxy to bound spend (CORS already restricts origin). |
| 3 | Medium | Add a CI job (`.github/workflows/ci.yml`) to run the Playwright suite on PRs. |
| 5 | Low | Consider a small per-session cap on photo analyses to bound API spend. |
| 6 | Low | Add an image-dimension/size pre-check before upload to reduce token cost. |
| 7 | Low (INFO) | `camParseIngredients()` uses a greedy `/\[[\s\S]*\]/`. If a Claude reply contains two separate arrays with prose between them, the captured span is invalid JSON and it returns `[]`. Pre-existing; a single embedded array (the normal case) works. Consider a last-valid-array scan if this ever surfaces in practice. |
