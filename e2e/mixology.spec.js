// @ts-check
const { test, expect } = require('@playwright/test');

// The photo feature calls a Vercel proxy (CAM_PROXY_URL). These tests only
// assert UI wiring — they never upload a photo, so no real proxy/Anthropic
// call is made.

test.beforeEach(async ({ page }) => {
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
  test('visible version label reads v2.0.0', async ({ page }) => {
    await expect(page.locator('#app-version')).toHaveText('v2.2.0');
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
