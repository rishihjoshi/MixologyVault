// @ts-check
const { test, expect } = require('@playwright/test');

// These tests run against the local checkout, where config.js ships an EMPTY
// window.ANTHROPIC_API_KEY — so the "By photo" flow shows its unavailable
// notice and never makes a real Anthropic API call.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for JSON data + first render.
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
});

test.describe('Snap tab + user API-key UI removed', () => {
  test('bottom nav has exactly 5 buttons and no Snap tab', async ({ page }) => {
    await expect(page.locator('#nav > button')).toHaveCount(5);
    await expect(page.locator('#nb-camera')).toHaveCount(0);
    await expect(page.locator('nav#nav')).not.toContainText('Snap');
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

  test('with no key configured, By photo shows the unavailable notice', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await expect(page.locator('#screen-decide')).toHaveClass(/active/);
    await page.locator('.decide-toggle-btn[data-decide-mode="photo"]').click();
    await expect(page.locator('#decide-snap-unavailable')).toBeVisible();
    await expect(page.locator('#cam-main')).toBeHidden();
  });

  test('By mood is the default panel', async ({ page }) => {
    await page.locator('#nav-decide').click();
    await expect(page.locator('#decide-mood-panel')).toBeVisible();
    await expect(page.locator('#decide-photo-panel')).toBeHidden();
  });
});

test.describe('Version functionality', () => {
  test('visible version label reads v2.0.0', async ({ page }) => {
    await expect(page.locator('#app-version')).toHaveText('v2.0.0');
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
    { btn: '#nav-decide', screen: '#screen-decide' },
    { btn: '#nb-lab', screen: '#screen-lab' },
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

  test('My Vault ingredient toggle persists an override', async ({ page }) => {
    await page.locator('#nb-bar').click();
    const pill = page.locator('.pill[data-ing-id]').first();
    await expect(pill).toBeVisible();
    await pill.click();
    const overrides = await page.evaluate(() => localStorage.getItem('mv_ing_overrides'));
    expect(overrides).not.toBeNull();
    expect(overrides).not.toEqual('{}');
  });
});
