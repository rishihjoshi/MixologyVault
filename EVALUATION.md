# Mixology Vault — Audit & Evaluation

_Date: 2026-07-15 · Version: 2.0.0 · Scope: `claude/mixology-vault-audit-fe7db2`_

## 1. Executive summary

Mixology Vault is a static, dependency-free Progressive Web App (vanilla HTML/CSS/JS, no build step) served as GitHub Pages. This evaluation accompanies a release that:

1. **Removed the standalone "Snap" tab** and the entire **user-supplied API-key UI** (on-device `localStorage` key entry + settings overlay).
2. **Preserved the camera → cocktail-suggestion feature**, relocating it inside the **Decide** tab behind a `By mood` / `By photo` toggle.
3. **Moved the API key off the device**: it is now injected at deploy time from the GitHub Actions secret `ANTHROPIC_API_KEY` into `config.js`, read as `window.ANTHROPIC_API_KEY`.
4. **Added version functionality**: a visible `v2.0.0` label plus a service-worker–driven "A new version is available → Refresh" update banner.

Overall the app is in good health: no framework attack surface, strict CSP, escaped output, and no inline event handlers. The one material risk introduced by this release is **deploy-time key exposure** (Section 3), which is an accepted, documented tradeoff with concrete mitigations.

## 2. Scope & methodology

- **Reviewed:** `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`, `config.js`, `.github/workflows/deploy.yml`, and the JSON data files.
- **Method:** static reading of the diff, grep-based dead-code verification, and an automated Playwright E2E suite (`e2e/mixology.spec.js`) exercising the removal, relocation, versioning, navigation, and core flows.
- **Not in scope:** penetration testing of the live Anthropic endpoint, and load/perf profiling.

## 3. Security assessment

### 3.1 Improvements in this release
- **On-device key storage eliminated.** The `mv_anthropic_key` `localStorage` entry, the key-entry inputs, validation, and settings overlay are all gone. Verified: `grep` for `mv_anthropic_key`, `cam-key`, `cam-settings` returns nothing in the shipped source.
- **No secret in the repository.** `config.js` is committed with an empty string; the real key exists only as a GitHub Actions secret and is written into the deploy artifact, never into git.
- **Deploy artifact is minimized.** The workflow stages only app files (`_site/`), excluding `.git`, `.github`, `node_modules`, tests, and `EVALUATION.md`, so history and dev tooling are not published.

### 3.2 ⚠️ Accepted risk: browser-exposed API key
Because the key is injected into `config.js` and used for direct browser→`api.anthropic.com` calls (`anthropic-dangerous-direct-browser-access: true`), **anyone who can load the deployed page can read the key** via DevTools or the network tab. This mirrors the pattern already used in the sibling Colorado Trip app and is implemented here at the user's explicit direction.

**Required mitigations (in priority order):**
1. **Keep the repository and GitHub Pages private.** A public Pages site publishes the key to the world.
2. **Set a low monthly spend cap** on the Anthropic key and monitor usage.
3. **Rotate the key periodically** (and immediately if the site is ever made public). Rotation is a redeploy only — `config.js` is served network-first by the service worker, so a rotated key reaches users on their next load without an app-version/cache bump.
4. **Long-term:** proxy the call through a serverless function (e.g. Cloudflare Worker / Netlify Function) so the key never reaches the browser. This is the only way to fully close the exposure.

### 3.3 Standing posture (unchanged, verified healthy)
- **CSP** remains strict: `default-src 'self'`, `script-src 'self'` (no inline JS), `connect-src` limited to `'self'` and `https://api.anthropic.com`, `object-src 'none'`, `frame-ancestors 'none'`.
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
- **Offline:** cache-first app shell; `api.anthropic.com` is never intercepted. `config.js` is served **network-first** (cached copy is the offline fallback), so a rotated key propagates on the next load with no cache bump.
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
- **Removal regressions:** 5 nav buttons, no `#nb-camera`/`#screen-camera`, no key UI, `mv_anthropic_key` never set.
- **Relocation:** capture UI lives in `#screen-decide`; `By photo` shows the unavailable notice with an empty key; `By mood` is the default.
- **Versioning:** `#app-version` = `v2.0.0`; `#update-banner` present and hidden.
- **Navigation:** each of the 5 tabs activates its screen.
- **Core flows:** Decide generate (3 picks), cocktail search + modal open, My Vault override persistence.

## 7. Prioritized recommendations

| # | Priority | Recommendation |
|---|----------|----------------|
| 1 | **High** | Keep repo + Pages **private**; set an Anthropic **spend cap**. The key is browser-readable. |
| 2 | High | Before first deploy, add the `ANTHROPIC_API_KEY` repo secret; verify `config.js` is injected (not the empty placeholder). |
| 3 | Medium | Plan a serverless proxy to remove the key from the client entirely. |
| 4 | Medium | Add a CI job (`.github/workflows/ci.yml`) to run the Playwright suite on PRs. |
| 5 | Low | Consider a small per-session cap on photo analyses to bound API spend. |
| 6 | Low | Add an image-dimension/size pre-check before upload to reduce token cost. |
| 7 | Low (INFO) | `camParseIngredients()` uses a greedy `/\[[\s\S]*\]/`. If a Claude reply contains two separate arrays with prose between them, the captured span is invalid JSON and it returns `[]`. Pre-existing; a single embedded array (the normal case) works. Consider a last-valid-array scan if this ever surfaces in practice. |
