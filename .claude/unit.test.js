'use strict';
let pass = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('  PASS', desc); pass++; }
  else      { console.error('  FAIL', desc); fail++; }
}

// ── esc() ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
console.log('esc()');
assert('escapes <',         esc('<b>') === '&lt;b&gt;');
assert('escapes "',         esc('"hi"') === '&quot;hi&quot;');
assert('escapes &',         esc('a&b') === 'a&amp;b');
assert("escapes '",         esc("it's") === 'it&#x27;s');
assert('null -> empty',     esc(null) === '');
assert('undefined safe',    esc(undefined) === '');

// ── safeMarkup() ─────────────────────────────────────────────────────────
function safeMarkup(s) { return esc(s).replace(/\n/g, '<br>'); }
console.log('safeMarkup()');
assert('escapes HTML then allows br', safeMarkup('<b>hi</b>\nnext') === '&lt;b&gt;hi&lt;/b&gt;<br>next');
assert('no XSS via newline',          !safeMarkup('<script>alert(1)</script>').includes('<script>'));

// ── normaliseSpiritKey() ──────────────────────────────────────────────────
function normaliseSpiritKey(b) {
  if (!b) return 'other';
  b = b.toLowerCase();
  if (b.includes('gin'))     return 'gin';
  if (b.includes('whisky') || b.includes('whiskey') || b.includes('scotch') || b.includes('bourbon') || b.includes('malt') || b.includes('irish')) return 'whisky';
  if (b.includes('tequila') || b.includes('mezcal')) return 'tequila';
  if (b.includes('rum'))   return 'rum';
  if (b.includes('vodka')) return 'vodka';
  return 'other';
}
console.log('normaliseSpiritKey()');
assert('gin',       normaliseSpiritKey('London Dry Gin') === 'gin');
assert('whisky',    normaliseSpiritKey('Scotch Whisky') === 'whisky');
assert('whiskey',   normaliseSpiritKey('Bourbon Whiskey') === 'whisky');
assert('scotch',    normaliseSpiritKey('Scotch') === 'whisky');
assert('tequila',   normaliseSpiritKey('Blanco Tequila') === 'tequila');
assert('mezcal',    normaliseSpiritKey('Mezcal') === 'tequila');
assert('rum',       normaliseSpiritKey('Dark Rum') === 'rum');
assert('vodka',     normaliseSpiritKey('Vodka') === 'vodka');
assert('empty',     normaliseSpiritKey('') === 'other');
assert('null',      normaliseSpiritKey(null) === 'other');
assert('other',     normaliseSpiritKey('Sake') === 'other');

// ── getIngStatus() ────────────────────────────────────────────────────────
function getIngStatus(ing, overrides) {
  if (overrides[ing.id] !== undefined) return overrides[ing.id];
  return ing.have ? 'have' : 'need';
}
console.log('getIngStatus()');
assert('have via override',   getIngStatus({ id:'a', have: false }, { a: 'have' }) === 'have');
assert('need via override',   getIngStatus({ id:'a', have: true  }, { a: 'need' }) === 'need');
assert('have via ing.have',   getIngStatus({ id:'a', have: true  }, {})             === 'have');
assert('need via ing.have=false', getIngStatus({ id:'a', have: false }, {})         === 'need');

// ── override validation (from loadOverrides logic) ─────────────────────────
function validateOverrides(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const safe = Object.create(null);
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k === 'string' && k.length > 0 && k.length <= 120 && /^[\w-]+$/.test(k) && (v === 'have' || v === 'need')) {
      safe[k] = v;
    }
  }
  return safe;
}
console.log('validateOverrides()');
assert('accepts valid entry',       validateOverrides({ 'ing-1': 'have' })['ing-1'] === 'have');
assert('rejects invalid value',     validateOverrides({ 'ing-1': 'owned' })['ing-1'] === undefined);
assert('rejects __proto__',         validateOverrides({ '__proto__': 'have' })['__proto__'] === undefined);
assert('constructor key safe (Object.create(null))', validateOverrides({ 'constructor': 'have' })['constructor'] === 'have');
assert('rejects long key',          validateOverrides({ ['x'.repeat(121)]: 'have' })[['x'.repeat(121)]] === undefined);
assert('null input -> {}',          Object.keys(validateOverrides(null)).length === 0);
assert('array input -> {}',         Object.keys(validateOverrides([])).length === 0);

// ── VALID_SCREENS guard ───────────────────────────────────────────────────
const VALID_SCREENS = new Set(['home','bar','cocktails','decide','ai']);
console.log('VALID_SCREENS');
assert('home valid',      VALID_SCREENS.has('home'));
assert('bar valid',       VALID_SCREENS.has('bar'));
assert('cocktails valid', VALID_SCREENS.has('cocktails'));
assert('decide valid',    VALID_SCREENS.has('decide'));
assert('ai valid',        VALID_SCREENS.has('ai'));
assert('mybar invalid',   !VALID_SCREENS.has('mybar'));
assert('unknown invalid', !VALID_SCREENS.has('unknown'));

// ── splitLines() ─────────────────────────────────────────────────────────
function splitLines(str) {
  return str ? str.split('\n').map(s => s.trim()).filter(Boolean) : [];
}
console.log('splitLines()');
assert('splits newlines',      splitLines('a\nb\nc').length === 3);
assert('trims whitespace',     splitLines('  a  \n  b  ')[0] === 'a');
assert('filters empty',        splitLines('a\n\nb').length === 2);
assert('null -> []',           splitLines(null).length === 0);
assert('empty -> []',          splitLines('').length === 0);

console.log('');
console.log('Unit Tests:', pass, 'passed,', fail, 'failed');
process.exit(fail > 0 ? 1 : 0);
