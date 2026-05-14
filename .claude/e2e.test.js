'use strict';
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('  PASS', desc); pass++; }
  else      { console.error('  FAIL', desc); fail++; }
}

// ── Load source files ─────────────────────────────────────────────────────
const html   = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appjs  = fs.readFileSync(path.join(ROOT, 'app.js'),     'utf8');
const sw     = fs.readFileSync(path.join(ROOT, 'sw.js'),      'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const cocktails   = JSON.parse(fs.readFileSync(path.join(ROOT, 'cocktails.json'),   'utf8'));
const ingredients = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingredients.json'), 'utf8'));

// ── PWA Shell Structure ───────────────────────────────────────────────────
console.log('PWA shell structure');
assert('manifest link present',         html.includes('rel="manifest"'));
assert('apple-mobile-web-app-capable',  html.includes('apple-mobile-web-app-capable'));
assert('theme-color meta',              html.includes('theme-color'));
assert('app.js is only script',         (html.match(/<script/g) || []).length === 1);
assert('no inline scripts',             !html.includes('<script>') && !html.includes('<script type='));
assert('viewport meta present',         html.includes('name="viewport"'));
assert('styles.css linked',             html.includes('href="styles.css"'));
assert('manifest.json linked',          html.includes('href="./manifest.json"'));
assert('sw.js registered in app.js',    appjs.includes("serviceWorker.register('./sw.js')"));
assert('sw skipWaiting',                sw.includes('skipWaiting'));
assert('sw clients.claim',              sw.includes('clients.claim'));

// ── CSP security ─────────────────────────────────────────────────────────
console.log('CSP security');
assert('CSP meta tag present',          html.includes('Content-Security-Policy'));
assert('script-src self only',          html.includes("script-src 'self'"));
assert('no unsafe-inline in script-src', !html.match(/script-src[^;]*unsafe-inline/));
assert('connect-src anthropic',         html.includes('https://api.anthropic.com'));
assert('frame-ancestors none',          html.includes("frame-ancestors 'none'"));
assert('object-src none',               html.includes("object-src 'none'"));
assert('default-src self',              html.includes("default-src 'self'"));
assert('X-Frame-Options DENY',          html.includes('X-Frame-Options') && html.includes('DENY'));
assert('no-referrer policy',            html.includes('no-referrer'));

// ── No inline event handlers ──────────────────────────────────────────────
console.log('No inline event handlers');
assert('no onclick=',   !html.includes('onclick='));
assert('no oninput=',   !html.includes('oninput='));
assert('no onkeydown=', !html.includes('onkeydown='));
assert('no onchange=',  !html.includes('onchange='));
assert('no onfocus=',   !html.includes('onfocus='));
assert('no onblur=',    !html.includes('onblur='));
assert('no onsubmit=',  !html.includes('onsubmit='));

// ── Five-screen navigation structure ─────────────────────────────────────
console.log('Five-screen navigation');
const screens = ['home','bar','cocktails','decide','ai'];
screens.forEach(s => {
  assert('screen-' + s + ' exists',         html.includes('id="screen-' + s + '"'));
  assert('nav data-screen=' + s,            html.includes('data-screen="' + s + '"'));
});
assert('nav element present',               html.includes('id="nav"'));
assert('5 nav buttons with data-screen',    (html.match(/data-screen="/g) || []).length >= 5);
assert('home screen is active by default',  html.includes('class="screen active" id="screen-home"'));

// ── Home screen flows ─────────────────────────────────────────────────────
console.log('Home screen flows');
assert('hero-brand-mark id',            html.includes('id="hero-brand-mark"'));
assert('shuffle-btn id',                html.includes('id="shuffle-btn"'));
assert('home-cta button',               html.includes('id="home-cta"'));
assert('stat pills with data-screen',   html.includes('stat-pill--link" data-screen='));
assert('ingredients pill → bar',        html.includes('data-screen="bar"') && html.includes('stat-pill--link'));
assert('cocktails pill → cocktails',    html.includes('data-screen="cocktails"') && html.includes('stat-pill--link'));
assert('hero-brand-mark wired in js',   appjs.includes("getElementById('hero-brand-mark')"));
assert('shuffle-btn wired in js',       appjs.includes("getElementById('shuffle-btn')"));
assert('home-cta wired in js',          appjs.includes("getElementById('home-cta')"));
assert('stat pills wired in js',        appjs.includes("querySelectorAll('.stat-pill--link[data-screen]')"));

// ── My Vault screen (bar) ─────────────────────────────────────────────────
console.log('My Vault screen');
assert('screen-bar exists',             html.includes('id="screen-bar"'));
assert('bar filter buttons',            html.includes('data-bar-filter="all"'));
assert('bar filter available',          html.includes('data-bar-filter="available"'));
assert('bar filter need',               html.includes('data-bar-filter="need"'));
assert('nav btn for bar has data-screen', html.includes('id="nb-bar" data-screen="bar"'));

// ── Cocktails screen ───────────────────────────────────────────────────────
console.log('Cocktails screen');
assert('cocktail-search input',         html.includes('id="cocktail-search"'));
assert('filter-row div',                html.includes('id="filter-row"'));
assert('cocktail-list div',             html.includes('id="cocktail-list"'));
assert('cocktail-count div',            html.includes('id="cocktail-count"'));

// ── Decide screen ─────────────────────────────────────────────────────────
console.log('Decide screen');
assert('mood-grid present',             html.includes('id="mood-grid"'));
assert('mood buttons with data-mood',   html.includes('data-mood='));
assert('sweet-slider present',          html.includes('id="sweet-slider"'));
assert('gen-btn present',               html.includes('id="gen-btn"'));
assert('results-area present',          html.includes('id="results-area"'));
assert('tod-grid present',              html.includes('id="tod-grid"'));
assert('spirit-btns present',           html.includes('id="decide-spirits"'));
assert('gen-btn wired in js',           appjs.includes("getElementById('gen-btn')"));

// ── AI screen & chat flow ─────────────────────────────────────────────────
console.log('AI screen');
assert('apikey-input present',          html.includes('id="apikey-input"'));
assert('save-key-btn id',               html.includes('id="save-key-btn"'));
assert('chat-messages div',             html.includes('id="chat-messages"'));
assert('chat-input textarea',           html.includes('id="chat-input"'));
assert('send-btn id',                   html.includes('id="send-btn"'));
assert('suggest-chips present',         html.includes('class="suggest-chips"'));
assert('suggest-chips wired in js',     appjs.includes("querySelector('.suggest-chips')"));
assert('save-key-btn wired in js',      appjs.includes("getElementById('save-key-btn')"));
assert('send-btn wired in js',          appjs.includes("getElementById('send-btn')"));
assert('chat-input wired in js',        appjs.includes("getElementById('chat-input')"));
assert('chatHistory capped at 20',      appjs.includes('chatHistory.length > 20'));
assert('fetchWithRetry used for API',   appjs.includes('fetchWithRetry'));
assert('dangerous-direct-browser-access header', appjs.includes('anthropic-dangerous-direct-browser-access'));

// ── Modal flow ─────────────────────────────────────────────────────────────
console.log('Modal flow');
assert('modal-overlay present',         html.includes('id="modal-overlay"'));
assert('modal-close-btn id',            html.includes('id="modal-close-btn"'));
assert('modal-name div',                html.includes('id="modal-name"'));
assert('modal-ingredients table',       html.includes('id="modal-ingredients"'));
assert('modal-steps list',              html.includes('id="modal-steps"'));
assert('unit-oz btn',                   html.includes('id="unit-oz"'));
assert('unit-ml btn',                   html.includes('id="unit-ml"'));
assert('modal-overlay wired in js',     appjs.includes("getElementById('modal-overlay')"));
assert('modal-close-btn wired in js',   appjs.includes("getElementById('modal-close-btn')"));
assert('unit-oz wired in js',           appjs.includes("getElementById('unit-oz')"));
assert('unit-ml wired in js',           appjs.includes("getElementById('unit-ml')"));
assert('nav delegation wired',          appjs.includes("getElementById('nav')?.addEventListener('click'"));

// ── Data integrity ────────────────────────────────────────────────────────
console.log('Data integrity');
assert('94 cocktails loaded',           cocktails.length === 94);
assert('28 ingredients loaded',         ingredients.length === 28);
assert('no duplicate cocktail IDs',     new Set(cocktails.map(c=>c.id)).size === 94);
assert('no duplicate ingredient IDs',   new Set(ingredients.map(i=>i.id)).size === 28);
assert('all cocktails have recipe',     cocktails.every(c => typeof c.recipe === 'string' && c.recipe.length > 0));
assert('all cocktails have ingredients',cocktails.every(c => Array.isArray(c.ingredients) && c.ingredients.length > 0));
assert('old-fashioned cheery typo fixed', (() => {
  const c = cocktails.find(c => c.id === 'old-fashioned');
  return c && !c.recipe.includes('cheery') && c.recipe.includes('cherry');
})());
assert('all ingredients have status',   ingredients.every(i => i.status === 'have' || i.status === 'can-get'));
assert('all ingredients have category', ingredients.every(i => typeof i.category === 'string' && i.category.length > 0));

// ── No legacy/stale code ──────────────────────────────────────────────────
console.log('No legacy code');
assert('no SHEET_ID constant',          !appjs.includes('SHEET_ID'));
assert('no Google Sheet reference',     !appjs.includes('Google Sheet'));
assert('no spreadsheets URL',           !appjs.includes('docs.google.com/spreadsheets'));
assert('reads cocktails.json',          appjs.includes("fetch(DATA_BASE + 'cocktails.json')"));
assert('reads ingredients.json',        appjs.includes("fetch(DATA_BASE + 'ingredients.json')"));

// ── Security: XSS guards ──────────────────────────────────────────────────
console.log('XSS guards');
assert('esc() escapes single quote',    appjs.includes("replace(/'/g,'&#x27;')"));
assert('safeMarkup defined',            appjs.includes('function safeMarkup'));
assert('VALID_SCREENS guard',           appjs.includes("VALID_SCREENS.has(id)"));
assert('Object.create(null) for overrides', appjs.includes('Object.create(null)'));

// ── CSS layout (mobile-first) ─────────────────────────────────────────────
console.log('CSS layout');
assert('safe-area-inset-bottom used',   styles.includes('safe-area-inset-bottom'));
assert('safe-area-inset-top used',      styles.includes('safe-area-inset-top'));
assert('#scroll-area no fixed height calc',
  !styles.match(/#scroll-area\s*\{[^}]*height:\s*calc\(var\(--app-h\)/s));

console.log('');
console.log('E2E Tests:', pass, 'passed,', fail, 'failed');
process.exit(fail > 0 ? 1 : 0);
