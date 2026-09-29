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
  test('visible version label reads v2.5.0', async ({ page }) => {
    await expect(page.locator('#app-version')).toHaveText('v2.5.0');
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
