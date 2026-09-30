// @ts-check
const { test, expect } = require('@playwright/test');

// The photo feature calls a Vercel proxy (CAM_PROXY_URL). These tests only
// assert UI wiring — they never upload a photo, so no real proxy/Anthropic
// call is made.

test.beforeEach(async ({ page }) => {
  // Past the 21+ age gate (covered separately in age-gate.spec.js).
  await page.addInitScript(() => localStorage.setItem('mv_age_ok', '21'));
  await page.goto('/');
  // Wait for JSON data + first render.
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
});

test.describe('Snap tab + user API-key UI removed', () => {
  test('bottom nav has exactly 5 buttons and no Snap or Lab tab', async ({ page }) => {
    await expect(page.locator('#nav > button')).toHaveCount(5);
    await expect(page.locator('#nb-camera')).toHaveCount(0);
    await expect(page.locator('#nb-lab')).toHaveCount(0);
    await expect(page.locator('#screen-lab')).toHaveCount(0);
    await expect(page.locator('#nb-mocktails')).toHaveCount(1);
    await expect(page.locator('nav#nav')).not.toContainText('Snap');
    await expect(page.locator('nav#nav')).not.toContainText('Lab');
  });

  test('no standalone camera screen exists', async ({ page }) => {
    await expect(page.locator('#screen-camera')).toHaveCount(0);
  });

  test('no API-key entry UI exists anywhere', async ({ page }) => {
    await expect(page.locator('#cam-setup-panel')).toHaveCount(0);
    await expect(page.locator('#cam-settings-overlay')).toHaveCount(0);
    await expect(page.locator('#cam-key-input')).toHaveCount(0);
    await expect(page.locator('#cam-settings-btn')).toHaveCount(0);
  });

  test('the legacy on-device key is never stored', async ({ page }) => {
    const key = await page.evaluate(() => localStorage.getItem('mv_anthropic_key'));
    expect(key).toBeNull();
  });
});

test.describe('Snap feature relocated into Decide', () => {
  test('capture UI lives inside the Decide screen', async ({ page }) => {
    await expect(page.locator('#screen-decide #cam-capture-zone')).toHaveCount(1);
    await expect(page.locator('#screen-decide #decide-toggle')).toHaveCount(1);
  });

  test('By photo shows the capture UI (proxy configured)', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await expect(page.locator('#screen-decide')).toHaveClass(/active/);
    await page.locator('.decide-toggle-btn[data-decide-mode="photo"]').click();
    await expect(page.locator('#cam-main')).toBeVisible();
    await expect(page.locator('#cam-capture-zone')).toBeVisible();
    await expect(page.locator('#decide-snap-unavailable')).toBeHidden();
  });

  test('By mood is the default panel', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await expect(page.locator('#decide-mood-panel')).toBeVisible();
    await expect(page.locator('#decide-photo-panel')).toBeHidden();
  });
});

test.describe('Version functionality', () => {
  test('visible version label reads v3.2.0', async ({ page }) => {
    await expect(page.locator('#app-version')).toHaveText('v3.2.0');
  });

  test('update banner exists and starts hidden', async ({ page }) => {
    await expect(page.locator('#update-banner')).toHaveCount(1);
    await expect(page.locator('#update-banner')).toHaveClass(/hidden/);
    await expect(page.locator('#update-banner')).toBeHidden();
  });
});

test.describe('Navigation — all 5 tabs', () => {
  const tabs = [
    { btn: '#nb-bar', screen: '#screen-bar' },
    { btn: '#nb-cocktails', screen: '#screen-cocktails' },
    { btn: '#nb-mocktails', screen: '#screen-mocktails' },
    { btn: '#nav-decide', screen: '#screen-decide' },
    { btn: '#nb-home', screen: '#screen-home' },
  ];
  for (const { btn, screen } of tabs) {
    test(`${btn} activates ${screen}`, async ({ page }) => {
      await page.locator(btn).click();
      await expect(page.locator(screen)).toHaveClass(/active/);
    });
  }
});

test.describe('Core flows unaffected', () => {
  test('Decide → Generate produces 3 picks', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await page.locator('#gen-btn').click();
    await expect(page.locator('#results-list .drink-card')).toHaveCount(3);
  });

  test('Cocktails search filters and a card opens the modal', async ({ page }) => {
    await page.locator('#nb-cocktails').click();
    await page.locator('#cocktail-search').fill('margarita');
    const firstCard = page.locator('#cocktail-list .drink-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
  });

  test('recipe sheet shows the glass and garnish options', async ({ page }) => {
    await page.evaluate(() => openModal('gin-martini'));
    await expect(page.locator('#serve-wrap')).toBeVisible();
    await expect(page.locator('#modal-glass')).toHaveText('Martini or Nick & Nora or Coupe');
    await expect(page.locator('#modal-garnish')).toHaveText('Lemon twist or Green olive or Lime twist');
  });

  test('an ungarnished drink says "None"', async ({ page }) => {
    await page.evaluate(() => openModal('naked-famous-home-bar-edit'));
    await expect(page.locator('#modal-glass')).toHaveText('Coupe');
    await expect(page.locator('#modal-garnish')).toHaveText('None');
  });

  test('Mocktails tab lists drinks, search filters, and a card opens the modal', async ({ page }) => {
    await page.locator('#nb-mocktails').click();
    await expect(page.locator('#screen-mocktails')).toHaveClass(/active/);
    await expect(page.locator('#mocktail-list .drink-card').first()).toBeVisible();
    await page.locator('#mocktail-search').fill('mojito');
    const firstCard = page.locator('#mocktail-list .drink-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('.modal-base-label')).toHaveText('Base:');
  });

  test('My Vault ingredient toggle persists an override', async ({ page }) => {
    await page.locator('#nb-bar').click();
    const pill = page.locator('.pill[data-ing-id]').first();
    await expect(pill).toBeVisible();
    await pill.click();
    const overrides = await page.evaluate(() => localStorage.getItem('mv_ing_overrides'));
    expect(overrides).not.toBeNull();
    expect(overrides).not.toEqual('{}');
  });

  test('My Vault → "I can make" lists makeable cocktails from available ingredients', async ({ page }) => {
    // Mark every ingredient available, reload so the vault reflects it.
    await page.evaluate(() => {
      const ov = {};
      for (const ing of allIngredients) ov[ing.id] = 'have';
      localStorage.setItem('mv_ing_overrides', JSON.stringify(ov));
    });
    await page.reload();
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
    await page.locator('#nb-bar').click();
    await page.locator('[data-vault-mode="make"]').click();
    await expect(page.locator('#vault-make-panel')).toBeVisible();
    await expect(page.locator('#vault-shelf-panel')).toBeHidden();
    await expect(page.locator('#vault-make-results .lab-cocktail-card').first()).toBeVisible();
  });

  test('My Vault → "I can make" shows the empty-state prompt when nothing is available', async ({ page }) => {
    await page.evaluate(() => {
      const ov = {};
      for (const ing of allIngredients) ov[ing.id] = 'need';
      localStorage.setItem('mv_ing_overrides', JSON.stringify(ov));
    });
    await page.reload();
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
    await page.locator('#nb-bar').click();
    await page.locator('[data-vault-mode="make"]').click();
    await expect(page.locator('#vault-make-results .lab-empty')).toBeVisible();
  });
});

test.describe('Brand-voice pass: Decide, favourites, home stats', () => {
  test('Morning picks are zero-proof and say so', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await page.locator('.tod-btn[data-tod="Morning"]').click();
    await page.locator('#gen-btn').click();
    const ids = await page.locator('#results-list .drink-card').evaluateAll(els => els.map(e => e.dataset.id));
    expect(ids).toHaveLength(3);
    const allMock = await page.evaluate(ids => ids.every(id => allMocktails.some(m => m.id === id)), ids);
    expect(allMock).toBe(true);
    await expect(page.locator('#results-note')).toHaveText('Morning picks are zero-proof.');
  });

  test('mood choice steers Decide picks', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await page.locator('.tod-btn[data-tod="Evening"]').click();
    await page.locator('.mood-btn[data-mood="Romantic"]').click();
    await page.locator('#gen-btn').click();
    const moods = await page.locator('#results-list .drink-card').evaluateAll(els =>
      els.map(e => allCocktails.find(c => c.id === e.dataset.id)?.mood));
    expect(moods).toEqual(['Romantic', 'Romantic', 'Romantic']);
  });

  test('favourites persist and the home pill opens the Favourites filter', async ({ page }) => {
    await page.locator('#nb-cocktails').click();
    const first = page.locator('#cocktail-list .drink-card').first();
    const id = await first.getAttribute('data-id');
    await first.locator('.fav-btn').click();
    await expect(first.locator('.fav-btn')).toHaveAttribute('aria-label', 'Remove from favourites');
    await page.reload();
    await expect(page.locator('#count-favourites')).toHaveText('1');
    await page.locator('.stat-pill[data-filter-fav]').click();
    await expect(page.locator('#screen-cocktails')).toHaveClass(/active/);
    await expect(page.locator('#cocktail-list .drink-card')).toHaveCount(1);
    await expect(page.locator(`#cocktail-list .drink-card[data-id="${id}"]`)).toHaveCount(1);
  });

  test('home "In your bar" counts only in-stock ingredients', async ({ page }) => {
    await page.evaluate(() => {
      const ov = {};
      allIngredients.forEach((ing, i) => { ov[ing.id] = i < 3 ? 'have' : 'need'; });
      localStorage.setItem('mv_ing_overrides', JSON.stringify(ov));
    });
    await page.reload();
    await expect(page.locator('#count-ingredients')).toHaveText('3');
  });

  test('no developer copy leaks into the UI', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('cocktails.json');
    await expect(page.locator('body')).not.toContainText('configured');
  });
});

test.describe('Assets & accessibility', () => {
  test('optimised hero image is served and the old PNG is gone', async ({ page }) => {
    const jpg = await page.request.get('/HeroImage.jpg');
    expect(jpg.status()).toBe(200);
    // Old 2 MB PNG was removed and replaced by the ~150 KB JPEG.
    const oldPng = await page.request.get('/HeroImage.png');
    expect(oldPng.status()).toBe(404);
  });

  test('removed dead files return 404', async ({ page }) => {
    for (const path of ['/icon.svg', '/new-icon.svg']) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} should be gone`).toBe(404);
    }
  });

  test('manifest icons are 512x512 and the referenced icon loads', async ({ page }) => {
    const manifest = await (await page.request.get('/manifest.json')).json();
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.sizes).toBe('512x512');
    }
    const icon = await page.request.get('/' + manifest.icons[0].src);
    expect(icon.status()).toBe(200);
  });

  test('vercel.json sends the security headers and mirrors the meta CSP', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const pages = cfg.headers.find(h => h.source === '/((?!api/).*)');
    const api   = cfg.headers.find(h => h.source === '/api/(.*)');
    const get = (rule, key) => rule.headers.find(h => h.key === key)?.value;

    expect(get(pages, 'X-Frame-Options')).toBe('DENY');
    expect(get(pages, 'X-Content-Type-Options')).toBe('nosniff');
    expect(get(pages, 'Referrer-Policy')).toBe('no-referrer');
    // HSTS is left to Vercel's default (max-age=63072000; includeSubDomains; preload).
    expect(get(pages, 'Strict-Transport-Security')).toBeUndefined();
    expect(get(api, 'Content-Security-Policy')).toContain("default-src 'none'");
    expect(get(api, 'Cache-Control')).toBe('no-store');

    // Every directive in the page's <meta> CSP must appear verbatim in the header CSP.
    const norm = csp => csp.split(';').map(d => d.trim().replace(/\s+/g, ' ')).filter(Boolean);
    const header = norm(get(pages, 'Content-Security-Policy'));
    const meta = norm(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'));
    for (const d of meta) expect(header, `header CSP missing: ${d}`).toContain(d);
    expect(header).toContain("frame-ancestors 'none'");

    // Header-only directives were removed from <meta> (browsers ignore them there).
    expect(meta.some(d => d.startsWith('frame-ancestors'))).toBe(false);
    await expect(page.locator('meta[http-equiv="X-Frame-Options"]')).toHaveCount(0);
  });

  test('viewport does not use viewport-fit=cover (iOS PWA bottom-gap regression)', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).not.toContain('viewport-fit');
  });

  test('recipe sheet leaves room above it and its close button stays reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#nb-cocktails').click();
    await page.locator('#cocktail-search').fill('margarita');
    await page.locator('#cocktail-list .drink-card').first().click();
    // Measure after the slide-up animation settles.
    await page.locator('#modal').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const sheet = await page.locator('#modal').boundingBox();
    expect(sheet.y).toBeGreaterThanOrEqual(48);           // clear of the status bar
    expect(sheet.y + sheet.height).toBeCloseTo(844, 0);   // reaches the bottom — no gap
    // Scroll to the end of the recipe: ✕ must still be on screen and close the sheet.
    await page.locator('#modal').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const close = page.locator('#modal-close-btn');
    const box = await close.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(sheet.y);
    expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + 80);
    await close.click();
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  });

  test('viewport allows pinch-zoom (WCAG 1.4.4)', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).not.toContain('user-scalable=no');
    expect(content).not.toContain('maximum-scale');
  });
});

test.describe('v3 Stitch redesign', () => {
  const stockAll = async page => {
    await page.evaluate(() => {
      const ov = {};
      for (const ing of allIngredients) ov[ing.id] = 'have';
      localStorage.setItem('mv_ing_overrides', JSON.stringify(ov));
    });
    await page.reload();
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
  };
  const stockNone = async page => {
    await page.evaluate(() => {
      const ov = {};
      for (const ing of allIngredients) ov[ing.id] = 'need';
      localStorage.setItem('mv_ing_overrides', JSON.stringify(ov));
    });
    await page.reload();
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
  };

  test('cards show "Can make now" when everything is in stock', async ({ page }) => {
    await stockAll(page);
    await page.locator('#nb-cocktails').click();
    const first = page.locator('#cocktail-list .drink-card').first();
    await expect(first.locator('.status-pill.can')).toHaveText('Can make now');
    await expect(first.locator('.dc-ledger')).toHaveClass(/full/);
  });

  test('cards show no stock status when the bar is empty', async ({ page }) => {
    await stockNone(page);
    await page.locator('#nb-cocktails').click();
    await expect(page.locator('#cocktail-list .drink-card').first()).toBeVisible();
    await expect(page.locator('#cocktail-list .status-pill')).toHaveCount(0);
  });

  test('toggling a bar ingredient updates card status without a reload', async ({ page }) => {
    await stockAll(page);
    await page.locator('#nb-bar').click();
    const pill = page.locator('.pill[data-ing-id]').first();
    await expect(pill).toHaveAttribute('aria-checked', 'true');
    await pill.click();
    await expect(pill).toHaveAttribute('aria-checked', 'false');
    await page.locator('#nb-cocktails').click();
    await expect(page.locator('#cocktail-list .status-pill.miss1, #cocktail-list .status-pill.missn').first()).toBeVisible();
  });

  test('"See what I can make" switches My bar to Ready to make', async ({ page }) => {
    await stockAll(page);
    await page.locator('#nb-bar').click();
    await expect(page.locator('#pour-ready')).not.toHaveText('0');
    await page.locator('#pour-card-cta').click();
    await expect(page.locator('#vault-make-panel')).toBeVisible();
    await expect(page.locator('[data-vault-mode="make"]')).toHaveClass(/active/);
  });

  test('Ready now shows a preview and "Show all" reveals every row', async ({ page }) => {
    await stockAll(page);
    await page.locator('#nb-bar').click();
    await page.locator('[data-vault-mode="make"]').click();
    const ready = page.locator('#vault-make-results [data-section="ready"]');
    const total = Number(await ready.locator('.lab-sec-count').textContent());
    expect(total).toBeGreaterThan(12);
    await expect(ready.locator('.lab-cocktail-card')).toHaveCount(12);
    const btn = ready.locator('[data-show-all="ready"]');
    await expect(btn).toHaveText(`Show all ${total}`);
    await btn.click();
    await expect(ready.locator('.lab-cocktail-card')).toHaveCount(total);
    await expect(ready.locator('[data-show-all]')).toHaveCount(0);
    // Leaving My bar collapses it again.
    await page.locator('#nb-home').click();
    await page.locator('#nb-bar').click();
    await expect(ready.locator('.lab-cocktail-card')).toHaveCount(12);
  });

  test('empty Ready to make offers a way back to the shelf', async ({ page }) => {
    await stockNone(page);
    await page.locator('#nb-bar').click();
    await page.locator('[data-vault-mode="make"]').click();
    await page.locator('#vault-make-results [data-goto-shelf]').click();
    await expect(page.locator('#vault-shelf-panel')).toBeVisible();
  });

  test('search clear button empties the search and restores the list', async ({ page }) => {
    await page.locator('#nb-cocktails').click();
    const total = await page.locator('#cocktail-list .drink-card').count();
    await page.locator('#cocktail-search').fill('negroni');
    const clear = page.locator('.search-clear[data-clear="cocktail-search"]');
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page.locator('#cocktail-search')).toHaveValue('');
    await expect(clear).toBeHidden();
    await expect(page.locator('#cocktail-list .drink-card')).toHaveCount(total);
  });

  test('only whitelisted drinks get a photo; others get a placeholder', async ({ page }) => {
    const withPhoto = await page.evaluate(() => cardHTML({ id: 'negroni', name: 'Negroni' }, ''));
    expect(withPhoto).toContain('src="assets/img/negroni.jpg"');
    const without = await page.evaluate(() => cardHTML({ id: 'not-a-drink', name: 'X' }, ''));
    expect(without).not.toContain('<img');
    expect(without).toContain('class="dc-media ph');
    const proto = await page.evaluate(() => cardHTML({ id: '__proto__', name: 'X' }, ''));
    expect(proto).not.toContain('<img');
    for (const src of await page.evaluate(() => [...new Set(Object.values(DRINK_PHOTOS))])) {
      expect((await page.request.get('/' + src)).status(), src).toBe(200);
    }
  });

  test('every photo is keyed to a real cocktail or mocktail id', async ({ page }) => {
    const orphans = await page.evaluate(() =>
      Object.keys(DRINK_PHOTOS).filter(id => !findDrink(id)));
    expect(orphans).toEqual([]);
  });

  test('recipe sheet flags ingredients that are not in the bar', async ({ page }) => {
    await stockAll(page);
    await page.locator('#nb-bar').click();
    await page.locator('.pill[data-ing-id]').first().click();   // one bottle out of stock
    await page.locator('#nb-cocktails').click();
    const partial = page.locator('#cocktail-list .drink-card:has(.status-pill.miss1)').first();
    await partial.click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#modal-ingredients tr.missing').first()).toBeVisible();
    await expect(page.locator('#modal-status .status-pill.miss1')).toBeVisible();
  });

  test('method steps use Roman numerals', async ({ page }) => {
    await page.locator('#nb-cocktails').click();
    await page.locator('#cocktail-search').fill('boulevardier');
    await page.locator('#cocktail-list .drink-card').first().click();
    await expect(page.locator('#modal-steps .step-num').first()).toHaveText('I');
  });

  test('desktop shows the nav as a left rail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const nav = await page.locator('#nav').boundingBox();
    expect(nav.x).toBe(0);
    expect(nav.height).toBeGreaterThan(700);
    await expect(page.locator('.rail-brand')).toBeVisible();
  });

  test('phone shows the nav as a bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const nav = await page.locator('#nav').boundingBox();
    expect(nav.y + nav.height).toBeGreaterThan(830);
    await expect(page.locator('.rail-brand')).toBeHidden();
  });

  test('photo privacy note names no AI model', async ({ page }) => {
    await expect(page.locator('.cam-privacy-note')).not.toContainText('Claude');
  });
});
