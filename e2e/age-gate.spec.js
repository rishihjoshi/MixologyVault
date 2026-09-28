// @ts-check
const { test, expect } = require('@playwright/test');

// Fresh context per test (Playwright default), so localStorage starts empty.
test.describe('Age gate (21+)', () => {
  test('first visit shows the gate over the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#age-gate')).toBeVisible();
    await expect(page.locator('#age-gate-title')).toHaveText('Are you 21 or older?');
    await expect(page.locator('#age-gate-yes')).toBeFocused();
  });

  test('confirming 21+ hides the gate and is remembered', async ({ page }) => {
    await page.goto('/');
    await page.locator('#age-gate-yes').click();
    await expect(page.locator('#age-gate')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('mv_age_ok'))).toBe('21');
    await page.reload();
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
    await expect(page.locator('#age-gate')).toBeHidden();
  });

  test('under 21 is turned away and not remembered', async ({ page }) => {
    await page.goto('/');
    await page.locator('#age-gate-no').click();
    await expect(page.locator('#age-gate-denied')).toBeVisible();
    await expect(page.locator('#age-gate-ask')).toBeHidden();
    await expect(page.locator('#age-gate')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('mv_age_ok'))).toBeNull();
  });

  test('the gate blocks taps on the app underneath', async ({ page }) => {
    await page.goto('/');
    // A trial click fails (times out) when another element intercepts it.
    const clickable = await page.locator('#nb-cocktails')
      .click({ trial: true, timeout: 1000 })
      .then(() => true, () => false);
    expect(clickable).toBe(false);
  });
});
