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
const mocktails   = JSON.parse(fs.readFileSync(path.join(ROOT, 'mocktails.json'),   'utf8')).catch ? [] :
                    JSON.parse(fs.readFileSync(path.join(ROOT, 'mocktails.json'),   'utf8'));
const ingredients = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingredients.json'), 'utf8'));

console.log('Data loading');
assert('cocktails is array',   Array.isArray(cocktails) && cocktails.length > 0);
assert('ingredients is array', Array.isArray(ingredients) && ingredients.length > 0);
assert('94 cocktails',         cocktails.length === 94);
assert('28 ingredients',       ingredients.length === 28);

// ── Cocktail schema ───────────────────────────────────────────────────────
console.log('Cocktail schema');
cocktails.forEach(c => {
  assert('id: '          + c.id, typeof c.id === 'string' && c.id.length > 0);
  assert('name: '        + c.id, typeof c.name === 'string' && c.name.length > 0);
  assert('ingredients: ' + c.id, Array.isArray(c.ingredients));
  assert('measOz: '      + c.id, Array.isArray(c.measurementsOz));
  assert('measMl: '      + c.id, Array.isArray(c.measurementsMl));
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
assert('connect-src anthropic',   html.includes('https://api.anthropic.com'));
assert('frame-ancestors none',    html.includes("frame-ancestors 'none'"));
assert('data-screen on nav-home', html.includes('data-screen="home"'));
assert('data-screen on nav-bar',  html.includes('data-screen="bar"'));
assert('data-screen on nav-decide', html.includes('data-screen="decide"'));
assert('data-screen on nav-cocktails', html.includes('data-screen="cocktails"'));
assert('data-screen on nav-ai',   html.includes('data-screen="ai"'));
assert('stat pills have data-screen', html.includes('stat-pill--link" data-screen='));
assert('hero-brand-mark has id',  html.includes('id="hero-brand-mark"'));
assert('modal-close-btn has id',  html.includes('id="modal-close-btn"'));
assert('shuffle-btn has id',      html.includes('id="shuffle-btn"'));
assert('save-key-btn has id',     html.includes('id="save-key-btn"'));
assert('single external script',  (html.match(/<script\s+src=/g) || []).length === 1);

// ── app.js code checks ────────────────────────────────────────────────────
console.log('app.js checks');
const appjs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert('no Google Sheet reference',    !appjs.includes('Google Sheet'));
assert('no SHEET_ID constant',         !appjs.includes('SHEET_ID'));
assert('no spreadsheets URL',          !appjs.includes('docs.google.com/spreadsheets'));
assert('reads cocktails.json',         appjs.includes("fetch(DATA_BASE + 'cocktails.json')"));
assert('reads ingredients.json',       appjs.includes("fetch(DATA_BASE + 'ingredients.json')"));
assert("esc escapes single quote",     appjs.includes("replace(/'/g,'&#x27;')"));
assert('safeMarkup defined',           appjs.includes('function safeMarkup'));
assert('VALID_SCREENS guard',          appjs.includes("VALID_SCREENS.has(id)"));
assert('Object.create(null) for safe', appjs.includes('Object.create(null)'));
assert('hero-brand-mark event wired',  appjs.includes("getElementById('hero-brand-mark')"));
assert('shuffle-btn event wired',      appjs.includes("getElementById('shuffle-btn')"));
assert('save-key-btn event wired',     appjs.includes("getElementById('save-key-btn')"));
assert('modal-close-btn event wired',  appjs.includes("getElementById('modal-close-btn')"));
assert('nav delegation wired',         appjs.includes("getElementById('nav')?.addEventListener('click'"));
assert('stat pills wired',             appjs.includes("querySelectorAll('.stat-pill--link[data-screen]')"));
assert('SW registration in init',      appjs.includes("serviceWorker.register('./sw.js')"));
assert('chatHistory capped at 20',     appjs.includes('chatHistory.length > 20'));
assert('fetchWithRetry for API',       appjs.includes('fetchWithRetry'));
assert('anthropic-dangerous-direct-browser-access', appjs.includes('anthropic-dangerous-direct-browser-access'));

// ── sw.js checks ──────────────────────────────────────────────────────────
console.log('sw.js checks');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
assert('skipWaiting',   sw.includes('skipWaiting'));
assert('clients.claim', sw.includes('clients.claim'));

console.log('');
console.log('Integration Tests:', pass, 'passed,', fail, 'failed');
process.exit(fail > 0 ? 1 : 0);
