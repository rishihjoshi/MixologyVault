// @ts-check
// Unit tests for the pure logic functions in app.js.
//
// app.js is a classic (non-module) script, so its top-level `function` decls
// are globals on `window`. We load the page once and call each function in the
// page context via page.evaluate() — testing them in isolation from the UI.

const { test, expect } = require('@playwright/test');

/** Run a pure function from app.js in the page and return its result. */
async function call(page, fnName, ...args) {
  return page.evaluate(
    ({ fnName, args }) => /** @type {any} */ (window)[fnName](...args),
    { fnName, args }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
});

// ── esc() — HTML escaping ────────────────────────────────
test.describe('esc()', () => {
  test('escapes the five HTML-significant characters', async ({ page }) => {
    expect(await call(page, 'esc', '&')).toBe('&amp;');
    expect(await call(page, 'esc', '<')).toBe('&lt;');
    expect(await call(page, 'esc', '>')).toBe('&gt;');
    expect(await call(page, 'esc', '"')).toBe('&quot;');
    expect(await call(page, 'esc', "'")).toBe('&#x27;');
  });

  test('escapes ampersand first (no double-encoding)', async ({ page }) => {
    expect(await call(page, 'esc', '<a>')).toBe('&lt;a&gt;');
    expect(await call(page, 'esc', 'Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  test('neutralizes a script-injection payload', async ({ page }) => {
    const out = await call(page, 'esc', '<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('coerces null / undefined / numbers to a safe string', async ({ page }) => {
    expect(await call(page, 'esc', null)).toBe('');
    expect(await call(page, 'esc', undefined)).toBe('');
    expect(await call(page, 'esc', 0)).toBe('');
    expect(await call(page, 'esc', 42)).toBe('42');
  });

  test('leaves ordinary text untouched', async ({ page }) => {
    expect(await call(page, 'esc', 'Negroni')).toBe('Negroni');
  });
});

// ── safeMarkup() — escape then allow <br> only ───────────
test.describe('safeMarkup()', () => {
  test('converts newlines to <br> after escaping', async ({ page }) => {
    expect(await call(page, 'safeMarkup', 'line1\nline2')).toBe('line1<br>line2');
  });

  test('escapes HTML before inserting <br> (no injected tags)', async ({ page }) => {
    const out = await call(page, 'safeMarkup', '<b>bad</b>\nok');
    expect(out).toBe('&lt;b&gt;bad&lt;/b&gt;<br>ok');
  });

  test('empty input yields empty string', async ({ page }) => {
    expect(await call(page, 'safeMarkup', '')).toBe('');
  });
});

// ── normaliseSpiritKey() — base spirit → key ─────────────
test.describe('normaliseSpiritKey()', () => {
  const cases = [
    ['Gin', 'gin'],
    ['London Dry Gin', 'gin'],
    ['Whisky', 'whisky'],
    ['Whiskey', 'whisky'],
    ['Scotch', 'whisky'],
    ['Bourbon', 'whisky'],
    ['Single Malt', 'whisky'],
    ['Irish Whiskey', 'whisky'],
    ['Tequila', 'tequila'],
    ['Mezcal', 'tequila'],
    ['White Rum', 'rum'],
    ['Vodka', 'vodka'],
    ['Cognac', 'other'],
    ['Brandy', 'other'],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" → ${expected}`, async ({ page }) => {
      expect(await call(page, 'normaliseSpiritKey', input)).toBe(expected);
    });
  }

  test('is case-insensitive', async ({ page }) => {
    expect(await call(page, 'normaliseSpiritKey', 'TEQUILA')).toBe('tequila');
  });

  test('null / empty → other', async ({ page }) => {
    expect(await call(page, 'normaliseSpiritKey', null)).toBe('other');
    expect(await call(page, 'normaliseSpiritKey', '')).toBe('other');
  });
});

// ── splitLines() — recipe / ingredient line splitting ────
test.describe('splitLines()', () => {
  test('splits on newlines, trims, drops blanks', async ({ page }) => {
    expect(await call(page, 'splitLines', '  a \n\n b  \n')).toEqual(['a', 'b']);
  });

  test('empty / null → []', async ({ page }) => {
    expect(await call(page, 'splitLines', '')).toEqual([]);
    expect(await call(page, 'splitLines', null)).toEqual([]);
  });

  test('single line with no newline', async ({ page }) => {
    expect(await call(page, 'splitLines', 'Gin')).toEqual(['Gin']);
  });
});

// ── labBuildKeys() — match keys for an ingredient ────────
test.describe('labBuildKeys()', () => {
  test('lowercases the item name', async ({ page }) => {
    expect(await call(page, 'labBuildKeys', { item: 'Angostura Bitters' }))
      .toEqual(['angostura bitters']);
  });

  test('adds the brand as a second key', async ({ page }) => {
    const keys = await call(page, 'labBuildKeys', { item: 'Gin', brand: 'Tanqueray' });
    expect(keys).toContain('gin');
    expect(keys).toContain('tanqueray');
  });

  test('strips parenthetical and year suffixes from brand', async ({ page }) => {
    const keys = await call(page, 'labBuildKeys', { item: 'Scotch', brand: 'Macallan 12 Year (Costco)' });
    expect(keys).toContain('macallan');
    expect(keys.some(k => k.includes('year') || k.includes('costco'))).toBe(false);
  });

  test('drops brands shorter than 3 chars', async ({ page }) => {
    const keys = await call(page, 'labBuildKeys', { item: 'Rum', brand: 'AB' });
    expect(keys).toEqual(['rum']);
  });
});

// ── labIngMatchesLine() — bidirectional matching ─────────
test.describe('labIngMatchesLine()', () => {
  test('matches when the recipe line contains the ingredient key', async ({ page }) => {
    expect(await call(page, 'labIngMatchesLine', { item: 'Angostura' }, 'Angostura Bitters')).toBe(true);
  });

  test('matches when the ingredient key contains the recipe line', async ({ page }) => {
    expect(await call(page, 'labIngMatchesLine', { item: 'American Vodka' }, 'Vodka')).toBe(true);
  });

  test('is case-insensitive', async ({ page }) => {
    expect(await call(page, 'labIngMatchesLine', { item: 'gin' }, 'GIN')).toBe(true);
  });

  test('empty line never matches', async ({ page }) => {
    expect(await call(page, 'labIngMatchesLine', { item: 'gin' }, '   ')).toBe(false);
  });

  test('unrelated ingredient does not match', async ({ page }) => {
    expect(await call(page, 'labIngMatchesLine', { item: 'Rum' }, 'Dry Vermouth')).toBe(false);
  });
});

// ── labScoreCocktail() — scoring against selected ings ───
test.describe('labScoreCocktail()', () => {
  test('returns null when the cocktail has no ingredient lines', async ({ page }) => {
    expect(await call(page, 'labScoreCocktail', { ingredients: '' }, [])).toBeNull();
  });

  test('perfect match → score 1', async ({ page }) => {
    const r = await call(page, 'labScoreCocktail',
      { ingredients: 'Gin\nTonic' },
      [{ item: 'Gin' }, { item: 'Tonic' }]);
    expect(r.matched).toBe(2);
    expect(r.total).toBe(2);
    expect(r.score).toBe(1);
  });

  test('partial match → fractional score with per-line detail', async ({ page }) => {
    const r = await call(page, 'labScoreCocktail',
      { ingredients: 'Gin\nTonic\nLime' },
      [{ item: 'Gin' }]);
    expect(r.matched).toBe(1);
    expect(r.total).toBe(3);
    expect(r.score).toBeCloseTo(1 / 3, 5);
    expect(r.detail.filter(d => d.hit)).toHaveLength(1);
    expect(r.detail.find(d => d.line === 'Gin').hit).toBe(true);
  });

  test('no match → score 0', async ({ page }) => {
    const r = await call(page, 'labScoreCocktail',
      { ingredients: 'Gin\nTonic' },
      [{ item: 'Rum' }]);
    expect(r.matched).toBe(0);
    expect(r.score).toBe(0);
  });
});

// ── camParseIngredients() — extract array from Claude reply
test.describe('camParseIngredients()', () => {
  const wrap = (text) => ({ content: [{ text }] });

  test('parses a clean JSON array', async ({ page }) => {
    const out = await call(page, 'camParseIngredients', wrap('["Gin","Cointreau"]'));
    expect(out).toEqual(['Gin', 'Cointreau']);
  });

  test('extracts the array even with prose around it', async ({ page }) => {
    const out = await call(page, 'camParseIngredients',
      wrap('Here is what I see: ["Rum","Lime"] — enjoy!'));
    expect(out).toEqual(['Rum', 'Lime']);
  });

  test('a single array embedded in prose is fully captured', async ({ page }) => {
    const out = await call(page, 'camParseIngredients',
      wrap('I can see these bottles: ["Tanqueray","Campari","Vermouth"] on the shelf.'));
    expect(out).toEqual(['Tanqueray', 'Campari', 'Vermouth']);
  });

  test('known limitation: two separate arrays with prose between → [] (greedy span is invalid JSON)', async ({ page }) => {
    const out = await call(page, 'camParseIngredients',
      wrap('Example: ["a"]. Actual: ["Tanqueray","Campari"]'));
    expect(out).toEqual([]);
  });

  test('filters non-strings and out-of-range lengths', async ({ page }) => {
    const long = 'x'.repeat(85);
    const out = await call(page, 'camParseIngredients',
      wrap(`["Gin", 5, "a", "  ", "${long}", "Rum"]`));
    expect(out).toEqual(['Gin', 'Rum']);
  });

  test('trims whitespace from names', async ({ page }) => {
    const out = await call(page, 'camParseIngredients', wrap('["  Gin  "]'));
    expect(out).toEqual(['Gin']);
  });

  test('no array in text → []', async ({ page }) => {
    expect(await call(page, 'camParseIngredients', wrap('I could not identify anything.'))).toEqual([]);
  });

  test('malformed JSON → []', async ({ page }) => {
    expect(await call(page, 'camParseIngredients', wrap('["Gin", "Rum"'))).toEqual([]);
  });

  test('a JSON object (not array) → []', async ({ page }) => {
    expect(await call(page, 'camParseIngredients', wrap('{"a":1}'))).toEqual([]);
  });

  test('missing / malformed response → []', async ({ page }) => {
    expect(await call(page, 'camParseIngredients', null)).toEqual([]);
    expect(await call(page, 'camParseIngredients', {})).toEqual([]);
    expect(await call(page, 'camParseIngredients', { content: [] })).toEqual([]);
  });
});

// ── camBuildIngObjects() — names → ingredient objects ────
test.describe('camBuildIngObjects()', () => {
  test('prepends the two always-present ingredients', async ({ page }) => {
    const out = await call(page, 'camBuildIngObjects', ['Gin']);
    expect(out).toHaveLength(3);
    expect(out[0].alwaysPresent).toBe(true);
    expect(out[1].alwaysPresent).toBe(true);
    expect(out[2].item).toBe('Gin');
  });

  test('empty names → only the always-present pair', async ({ page }) => {
    const out = await call(page, 'camBuildIngObjects', []);
    expect(out).toHaveLength(2);
    expect(out.every(i => i.alwaysPresent)).toBe(true);
  });

  test('slugifies the id from the name', async ({ page }) => {
    const out = await call(page, 'camBuildIngObjects', ['Angostura Bitters!']);
    const claude = out[out.length - 1];
    expect(claude.id).toBe('_cam_angostura-bitters-');
    expect(claude.category).toBe('spirits');
  });
});

// ── camHasKey() — availability gate (now proxy-based) ────
test.describe('camHasKey()', () => {
  test('true — the photo feature is available via the configured proxy', async ({ page }) => {
    expect(await call(page, 'camHasKey')).toBe(true);
  });

  test('CAM_PROXY_URL points at the Vercel proxy endpoint', async ({ page }) => {
    const url = await page.evaluate(() => CAM_PROXY_URL);
    expect(url).toContain('vercel.app/api/analyze');
  });
});

// ── cardHTML() — output escaping (security-relevant) ─────
test.describe('cardHTML()', () => {
  test('escapes a malicious cocktail name in the rendered card', async ({ page }) => {
    const html = await call(page, 'cardHTML',
      { id: 1, name: '<img src=x onerror=alert(1)>', baseSpirit: 'Gin' }, '');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  test('includes the cocktail id as a data attribute', async ({ page }) => {
    const html = await call(page, 'cardHTML', { id: 7, name: 'Negroni' }, 'pour-in');
    expect(html).toContain('data-id="7"');
    expect(html).toContain('pour-in');
  });
});
