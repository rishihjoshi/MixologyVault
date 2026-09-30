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
  // Past the 21+ age gate (covered separately in age-gate.spec.js).
  await page.addInitScript(() => localStorage.setItem('mv_age_ok', '21'));
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

// ── normaliseMood() — British spelling + legacy data shim ─
test.describe('normaliseMood()', () => {
  test('maps legacy "Cozy" → "Cosy"', async ({ page }) => {
    expect(await call(page, 'normaliseMood', 'Cozy')).toBe('Cosy');
  });

  test('leaves other moods untouched', async ({ page }) => {
    expect(await call(page, 'normaliseMood', 'Party')).toBe('Party');
    expect(await call(page, 'normaliseMood', 'Cosy')).toBe('Cosy');
  });

  test('null / empty → empty string', async ({ page }) => {
    expect(await call(page, 'normaliseMood', null)).toBe('');
    expect(await call(page, 'normaliseMood', '')).toBe('');
  });

  test('no live cocktail keeps the legacy "Cozy" spelling', async ({ page }) => {
    const stray = await page.evaluate(() =>
      allCocktails.filter(c => c.mood === 'Cozy').map(c => c.id));
    expect(stray).toEqual([]);
  });
});

// ── Cocktail catalog integrity ───────────────────────────
test.describe('cocktail catalog', () => {
  test('core classics are present', async ({ page }) => {
    const names = await page.evaluate(() => allCocktails.map(c => c.name));
    for (const classic of ['Daiquiri', 'Whiskey Sour', 'Manhattan', 'Southside', 'Gin Rickey', 'Corpse Reviver No. 2']) {
      expect(names, `missing ${classic}`).toContain(classic);
    }
  });

  test('every cocktail has aligned measurement arrays and a unique id', async ({ page }) => {
    const problems = await page.evaluate(() => {
      const seen = new Set();
      const bad = [];
      for (const c of allCocktails) {
        const n = c.ingredients ? c.ingredients.split('\n').filter(Boolean).length : 0;
        const ml = c.measML ? c.measML.split('\n').length : 0;
        const oz = c.measOz ? c.measOz.split('\n').length : 0;
        if (n && (ml !== n || oz !== n)) bad.push(c.id + ' (measurement mismatch)');
        if (seen.has(c.id)) bad.push(c.id + ' (duplicate id)');
        seen.add(c.id);
      }
      return bad;
    });
    expect(problems).toEqual([]);
  });

  test('every cocktail and mocktail lists at least one glass and a garnish array', async ({ page }) => {
    const bad = await page.evaluate(() => [...allCocktails, ...allMocktails]
      .filter(d => !Array.isArray(d.glasses) || d.glasses.length === 0 || !Array.isArray(d.garnishes)
        || [...d.glasses, ...d.garnishes].some(v => typeof v !== 'string' || !v.trim()))
      .map(d => d.id));
    expect(bad).toEqual([]);
  });
});

// ── serveOptionsHTML() — glass / garnish options line ────
test.describe('serveOptionsHTML()', () => {
  test('joins options with "or"', async ({ page }) => {
    const html = await call(page, 'serveOptionsHTML', ['Coupe', 'Rocks'], 'Any');
    expect(html).toBe('Coupe<span class="serve-or"> or </span>Rocks');
  });

  test('empty or missing list shows the fallback', async ({ page }) => {
    expect(await call(page, 'serveOptionsHTML', [], 'None')).toBe('<span class="serve-none">None</span>');
    expect(await call(page, 'serveOptionsHTML', undefined, 'Any')).toBe('<span class="serve-none">Any</span>');
  });

  test('escapes option text', async ({ page }) => {
    const html = await call(page, 'serveOptionsHTML', ['<img src=x>'], 'Any');
    expect(html).toBe('&lt;img src=x&gt;');
  });
});

// ── glassFor() — placeholder silhouette ──────────────────
test.describe('glassFor()', () => {
  test('uses the preferred glass when the data has one', async ({ page }) => {
    expect(await call(page, 'glassFor', { glasses: ['Rocks', 'Coupe'] })).toBe('rocks');
    expect(await call(page, 'glassFor', { glasses: ['Copper mug'] })).toBe('rocks');
    expect(await call(page, 'glassFor', { glasses: ['Collins'] })).toBe('highball');
    expect(await call(page, 'glassFor', { glasses: ['Wine glass'] })).toBe('highball');
    expect(await call(page, 'glassFor', { glasses: ['Nick & Nora'] })).toBe('coupe');
  });

  test('falls back to tags/name without glass data', async ({ page }) => {
    expect(await call(page, 'glassFor', { name: 'Gin Fizz', tag: '' })).toBe('highball');
    expect(await call(page, 'glassFor', { name: 'Tuxedo', tag: '' })).toBe('coupe');
  });
});

// ── camAvailable() — availability gate (proxy configured + online) ────
test.describe('camAvailable()', () => {
  test('true — proxy is configured and the (headless) browser is online', async ({ page }) => {
    expect(await call(page, 'camAvailable')).toBe(true);
  });

  test('false when the browser is offline', async ({ page }) => {
    const result = await page.evaluate(() => {
      const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
      const out = camAvailable();
      // Restore so we don't leak the override into other assertions.
      if (desc) Object.defineProperty(Navigator.prototype, 'onLine', desc);
      return out;
    });
    expect(result).toBe(false);
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

  test('escapes a malicious id so it cannot break out of data-id', async ({ page }) => {
    const html = await call(page, 'cardHTML',
      { id: '"><img src=x onerror=alert(1)>', name: 'Negroni' }, '');
    expect(html).toContain('data-id="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(html).not.toContain('<img src=x');
  });
});

// ── mocktailToCard() — normalize a raw mocktail record ───
test.describe('mocktailToCard()', () => {
  const raw = {
    id: 'virgin-mojito',
    name: 'Virgin Mojito',
    baseIngredient: 'Lime',
    tags: ['Classic', 'Refreshing'],
    ingredients: ['Lime', 'Mint', 'Soda'],
    measurementsMl: ['30 ml', '', '90 ml'],
    measurementsOz: ['1 oz', '', '3 oz'],
    recipe: '1. Muddle\n2. Top with soda',
    description: 'A zero-proof classic.',
    history: 'Cuban roots.',
  };

  test('maps baseIngredient → baseSpirit and flags isMocktail', async ({ page }) => {
    const c = await call(page, 'mocktailToCard', raw);
    expect(c.baseSpirit).toBe('Lime');
    expect(c.isMocktail).toBe(true);
    expect(c.spiritKey).toBeUndefined();
  });

  test('joins tags / ingredients / measurements and maps recipe → steps', async ({ page }) => {
    const c = await call(page, 'mocktailToCard', raw);
    expect(c.tag).toBe('Classic, Refreshing');
    expect(c.ingredients).toBe('Lime\nMint\nSoda');
    expect(c.measML).toBe('30 ml\n\n90 ml');
    expect(c.steps).toBe('1. Muddle\n2. Top with soda');
  });

  test('carries glasses / garnishes through, defaulting to empty arrays', async ({ page }) => {
    const c = await call(page, 'mocktailToCard', { ...raw, glasses: ['Highball'], garnishes: ['Mint sprig'] });
    expect(c.glasses).toEqual(['Highball']);
    expect(c.garnishes).toEqual(['Mint sprig']);
    const bare = await call(page, 'mocktailToCard', { id: 'x', name: 'Bare' });
    expect(bare.glasses).toEqual([]);
    expect(bare.garnishes).toEqual([]);
  });

  test('missing fields default to empty strings', async ({ page }) => {
    const c = await call(page, 'mocktailToCard', { id: 'x', name: 'Bare' });
    expect(c.baseSpirit).toBe('');
    expect(c.tag).toBe('');
    expect(c.ingredients).toBe('');
    expect(c.steps).toBe('');
    expect(c.isMocktail).toBe(true);
  });

  test('the live allMocktails is populated and every entry is a mocktail', async ({ page }) => {
    const info = await page.evaluate(() => ({
      count: allMocktails.length,
      allFlagged: allMocktails.every(m => m.isMocktail === true),
    }));
    expect(info.count).toBeGreaterThan(0);
    expect(info.allFlagged).toBe(true);
  });
});
