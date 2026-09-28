'use strict';
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('  PASS', desc); pass++; }
  else      { console.error('  FAIL', desc); fail++; }
}

// ── JSON data loading ─────────────────────────────────────────────────────
const cocktails   = JSON.parse(fs.readFileSync(path.join(ROOT, 'cocktails.json'),   'utf8'));
const mocktails   = JSON.parse(fs.readFileSync(path.join(ROOT, 'mocktails.json'),   'utf8'));
const ingredients = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingredients.json'), 'utf8'));

console.log('Data loading');
assert('cocktails is array',   Array.isArray(cocktails) && cocktails.length > 0);
assert('mocktails is array',   Array.isArray(mocktails) && mocktails.length > 0);
assert('ingredients is array', Array.isArray(ingredients) && ingredients.length > 0);
// Counts are derived from the JSON files so adding drinks doesn't break tests.
console.log(`  (${cocktails.length} cocktails, ${mocktails.length} mocktails, ${ingredients.length} ingredients)`);

// ── Cocktail schema ───────────────────────────────────────────────────────
console.log('Cocktail schema');
cocktails.forEach(c => {
  assert('id: '          + c.id, typeof c.id === 'string' && c.id.length > 0);
  assert('name: '        + c.id, typeof c.name === 'string' && c.name.length > 0);
  assert('ingredients: ' + c.id, Array.isArray(c.ingredients));
  assert('measOz: '      + c.id, Array.isArray(c.measurementsOz));
  assert('measMl: '      + c.id, Array.isArray(c.measurementsMl));
});

// ── Mocktail schema ───────────────────────────────────────────────────────
console.log('Mocktail schema');
mocktails.forEach(m => {
  assert('id: '          + m.id, typeof m.id === 'string' && m.id.length > 0);
  assert('name: '        + m.id, typeof m.name === 'string' && m.name.length > 0);
  assert('ingredients: ' + m.id, Array.isArray(m.ingredients) && m.ingredients.length > 0);
  assert('measOz: '      + m.id, Array.isArray(m.measurementsOz));
  assert('measMl: '      + m.id, Array.isArray(m.measurementsMl));
  assert('recipe: '      + m.id, typeof m.recipe === 'string' && m.recipe.length > 0);
});

// ── Ingredient schema ─────────────────────────────────────────────────────
console.log('Ingredient schema');
const validStatuses = new Set(['have', 'can-get']);
const validCats     = new Set(['Spirits','Liqueurs','Bitters','Juices','Syrups','Garnishes','Wine','Top Up']);
ingredients.forEach(i => {
  assert('id: '       + i.id, typeof i.id === 'string' && i.id.length > 0);
  assert('name: '     + i.id, typeof i.name === 'string' && i.name.length > 0);
  assert('status: '   + i.id, validStatuses.has(i.status));
  assert('category: ' + i.id, validCats.has(i.category));
});

// ── Unique IDs ────────────────────────────────────────────────────────────
console.log('Unique IDs');
const cocktailIds = cocktails.map(c => c.id);
assert('no duplicate cocktail IDs', new Set(cocktailIds).size === cocktailIds.length);
const mocktailIds = mocktails.map(m => m.id);
assert('no duplicate mocktail IDs', new Set(mocktailIds).size === mocktailIds.length);
assert('cocktail/mocktail IDs disjoint', mocktailIds.every(id => !cocktailIds.includes(id)));
const ingIds = ingredients.map(i => i.id);
assert('no duplicate ingredient IDs', new Set(ingIds).size === ingIds.length);

// ── Data fixes ────────────────────────────────────────────────────────────
console.log('Data fixes');
const oldFashioned = cocktails.find(c => c.id === 'old-fashioned');
assert('old-fashioned exists',    oldFashioned !== undefined);
assert('cheery typo fixed',       oldFashioned && !oldFashioned.recipe.includes('cheery'));
assert('cherry present',          oldFashioned && oldFashioned.recipe.includes('cherry'));

// ── index.html security checks ────────────────────────────────────────────
console.log('index.html security');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert('no onclick handlers',     !html.includes('onclick='));
assert('no oninput handlers',     !html.includes('oninput='));
assert('no onkeydown handlers',   !html.includes('onkeydown='));
assert('no inline script blocks', !(/<script[^>]*>[\s\S]*?<\/script>/g.test(html.replace(/<script\s+src=/, 'EXTERNAL_SRC'))) );
assert('CSP script-src self',     html.includes("script-src 'self'"));
assert('no unsafe-inline in script-src', !html.match(/script-src[^;]*unsafe-inline/));
// Photo analysis goes through the Vercel proxy; the browser never talks to Anthropic
assert('connect-src vercel proxy', /connect-src[^;]*https:\/\/mixology-vault\.vercel\.app/.test(html));
assert('no direct anthropic in CSP', !html.includes('api.anthropic.com'));
assert('frame-ancestors none',    html.includes("frame-ancestors 'none'"));
assert('data-screen on nav-home', html.includes('data-screen="home"'));
assert('data-screen on nav-bar',  html.includes('data-screen="bar"'));
assert('data-screen on nav-decide', html.includes('data-screen="decide"'));
assert('data-screen on nav-cocktails', html.includes('data-screen="cocktails"'));
assert('data-screen on nav-mocktails', html.includes('data-screen="mocktails"'));
assert('no lab nav (screen removed)', !html.includes('data-screen="lab"'));
assert('stat pills have data-screen', html.includes('stat-pill--link" data-screen='));
assert('hero-brand-mark has id',  html.includes('id="hero-brand-mark"'));
assert('modal-close-btn has id',  html.includes('id="modal-close-btn"'));
assert('shuffle-btn has id',      html.includes('id="shuffle-btn"'));
assert('mocktail-search input',   html.includes('id="mocktail-search"'));
assert('mocktail-filter-row div', html.includes('id="mocktail-filter-row"'));
assert('mocktail-list div',       html.includes('id="mocktail-list"'));
assert('vault-make-results div',  html.includes('id="vault-make-results"'));
assert('single external script',  (html.match(/<script\s+src=/g) || []).length === 1);

// ── app.js code checks ────────────────────────────────────────────────────
console.log('app.js checks');
const appjs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert('no Google Sheet reference',    !appjs.includes('Google Sheet'));
assert('no SHEET_ID constant',         !appjs.includes('SHEET_ID'));
assert('no spreadsheets URL',          !appjs.includes('docs.google.com/spreadsheets'));
assert('reads cocktails.json',         appjs.includes("fetch(DATA_BASE + 'cocktails.json')"));
assert('reads ingredients.json',       appjs.includes("fetch(DATA_BASE + 'ingredients.json')"));
assert('reads mocktails.json',         appjs.includes("fetch(DATA_BASE + 'mocktails.json')"));
assert("esc escapes single quote",     appjs.includes("replace(/'/g,'&#x27;')"));
assert('safeMarkup defined',           appjs.includes('function safeMarkup'));
assert('VALID_SCREENS guard',          appjs.includes("VALID_SCREENS.has(id)"));
assert('Object.create(null) for safe', appjs.includes('Object.create(null)'));
assert('hero-brand-mark event wired',  appjs.includes("getElementById('hero-brand-mark')"));
assert('shuffle-btn event wired',      appjs.includes("getElementById('shuffle-btn')"));
assert('modal-close-btn event wired',  appjs.includes("getElementById('modal-close-btn')"));
assert('nav delegation wired',         appjs.includes("getElementById('nav')?.addEventListener('click'"));
assert('stat pills wired',             appjs.includes("querySelectorAll('.stat-pill--link[data-screen]')"));
assert('SW registration in init',      appjs.includes("serviceWorker.register('./sw.js')"));
// Screens: the Lab screen was removed; Mocktails is the 5th tab
assert('VALID_SCREENS includes mocktails', /VALID_SCREENS\s*=\s*new Set\([^)]*'mocktails'/.test(appjs));
assert('VALID_SCREENS excludes lab',   !/VALID_SCREENS\s*=\s*new Set\([^)]*'lab'/.test(appjs));
assert('renderMocktails defined',      appjs.includes('function renderMocktails'));
assert('mocktail-search wired',        appjs.includes("getElementById('mocktail-search')"));
assert('mocktail-list wired',          appjs.includes("getElementById('mocktail-list')"));
// Makeable-cocktail engine (My Vault "I can make" + camera)
assert('labScoreCocktail defined',     appjs.includes('function labScoreCocktail'));
assert('labBuildKeys defined',         appjs.includes('function labBuildKeys'));
assert('renderVaultMake defined',      appjs.includes('function renderVaultMake'));
assert('vault-make-results wired',     appjs.includes("getElementById('vault-make-results')"));
// Photo analysis via Vercel proxy — no Anthropic key or endpoint in the browser
assert('CAM_PROXY_URL is Vercel proxy', appjs.includes("CAM_PROXY_URL = 'https://mixology-vault.vercel.app/api/analyze'"));
assert('camera fetches via proxy',     appjs.includes('fetch(CAM_PROXY_URL'));
assert('no direct anthropic call',     !appjs.includes('api.anthropic.com'));
assert('no browser API key header',    !appjs.includes('x-api-key') && !appjs.includes('anthropic-dangerous-direct-browser-access'));

// ── sw.js checks ──────────────────────────────────────────────────────────
console.log('sw.js checks');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
assert('skipWaiting',   sw.includes('skipWaiting'));
assert('clients.claim', sw.includes('clients.claim'));
assert('caches mocktails.json', sw.includes('./mocktails.json'));
assert('bypasses proxy origin', sw.includes("'mixology-vault.vercel.app'"));

console.log('');
console.log('Integration Tests:', pass, 'passed,', fail, 'failed');
process.exit(fail > 0 ? 1 : 0);
