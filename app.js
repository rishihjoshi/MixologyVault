/* ═══════════════════════════════════════════════════════
   MIXOLOGY VAULT — app.js
   Tabs: Ingredients (5 cols) | Cocktails (9 cols)
═══════════════════════════════════════════════════════ */
'use strict';

// ── CONFIG ──────────────────────────────────────────────
const DATA_BASE = './'; // path prefix for JSON data files

// App version — bump this AND CACHE_NAME in sw.js together on every release.
const APP_VERSION = '2.1.0';

// ── STATE ────────────────────────────────────────────────
let allIngredients    = [];
let allCocktails      = [];
let favourites        = new Set();
let activeFilter      = 'all';
let activeUnit        = 'oz';
let activeModalId     = null;
let barActiveFilter   = 'all';
let vaultMode         = 'shelf';  // 'shelf' | 'make' — My Vault view toggle

// ── INGREDIENT OVERRIDES ─────────────────────────────────
// { [ingId]: 'have' | 'need' } — persisted to localStorage
let ingredientOverrides = {};

(function loadOverrides() {
  try {
    const s = localStorage.getItem('mv_ing_overrides');
    if (!s) return;
    const parsed = JSON.parse(s);
    // Validate: only accept plain objects with 'have'/'need' values
    // Rejects prototype pollution attempts (__proto__, constructor, etc.)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const safe = Object.create(null); // no prototype — immune to pollution
      for (const [k, v] of Object.entries(parsed)) {
        // Accept string slug keys only — guards against prototype pollution
        if (typeof k === 'string' && k.length > 0 && k.length <= 120 && /^[\w-]+$/.test(k) && (v === 'have' || v === 'need')) {
          safe[k] = v;
        }
      }
      ingredientOverrides = safe;
    }
  } catch (e) {}
})();

function saveOverrides() {
  try { localStorage.setItem('mv_ing_overrides', JSON.stringify(ingredientOverrides)); } catch (e) {}
}

function getIngStatus(ing) {
  if (ingredientOverrides[ing.id] !== undefined) return ingredientOverrides[ing.id];
  return ing.have ? 'have' : 'need';
}

// ── CATEGORY META ────────────────────────────────────────
const CAT_META = {
  'spirits':   { icon: '🥃', label: 'Spirits',   cls: 'cat-spirits'   },
  'liqueurs':  { icon: '🍶', label: 'Liqueurs',  cls: 'cat-liqueurs'  },
  'bitters':   { icon: '🌿', label: 'Bitters',   cls: 'cat-bitters'   },
  'juices':    { icon: '🍊', label: 'Juices',    cls: 'cat-juices'    },
  'syrups':    { icon: '🍯', label: 'Syrups',    cls: 'cat-syrups'    },
  'garnishes': { icon: '🌱', label: 'Garnishes', cls: 'cat-garnishes' },
  'wine':      { icon: '🍷', label: 'Wine',      cls: 'cat-wine'      },
  'top up':    { icon: '💧', label: 'Top Up',    cls: 'cat-topup'     },
};

const SPIRIT_FILTERS = [
  { key: 'all',     label: 'All',     icon: '🍸' },
  { key: 'gin',     label: 'Gin',     icon: '🌸' },
  { key: 'whisky',  label: 'Whisky',  icon: '🥃' },
  { key: 'tequila', label: 'Tequila', icon: '🌵' },
  { key: 'rum',     label: 'Rum',     icon: '🏝️' },
  { key: 'vodka',   label: 'Vodka',   icon: '🫙' },
  { key: 'other',   label: 'Other',   icon: '✨' },
];

// ── LOCAL JSON LOADERS ───────────────────────────────────
async function loadIngredients() {
  try {
    const res  = await fetch(DATA_BASE + 'ingredients.json');
    const data = await res.json();
    return data.map(ing => ({
      id:      ing.id,
      category: ing.category,
      item:    ing.name,                        // normalise to 'item' for rest of app
      brand:   ing.brand  || '',
      status:  ing.status,
      notes:   ing.notes  || '',
      have:    ing.status === 'have',
      canGet:  ing.status === 'can-get',
    }));
  } catch (e) {
    console.warn('Failed to load ingredients.json:', e.message);
    return [];
  }
}

async function loadCocktails() {
  try {
    const res  = await fetch(DATA_BASE + 'cocktails.json');
    const data = await res.json();
    return data.map(c => ({
      id:          c.id,
      name:        c.name,
      baseSpirit:  c.baseSpirit  || '',
      tag:         (c.tags || []).join(', '),
      ingredients: (c.ingredients     || []).join('\n'),
      measML:      (c.measurementsMl  || []).join('\n'),
      measOz:      (c.measurementsOz  || []).join('\n'),
      steps:       c.recipe      || '',
      history:     c.history     || '',
      description: c.description || '',
      spiritKey:   normaliseSpiritKey(c.baseSpirit),
    }));
  } catch (e) {
    console.warn('Failed to load cocktails.json:', e.message);
    return [];
  }
}

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

// ── CARD HTML ─────────────────────────────────────────────
function cardHTML(c, extraClass) {
  const isFav = favourites.has(c.id);
  return `<div class="drink-card ${extraClass || ''}" data-id="${c.id}">
    <button class="fav-btn ${isFav ? 'on' : ''}" data-id="${c.id}" aria-label="Favourite">${isFav ? '❤️' : '🤍'}</button>
    <div class="dc-name">${esc(c.name)}</div>
    ${c.baseSpirit  ? `<div class="dc-eyebrow">${esc(c.baseSpirit)}</div>` : ''}
    ${c.description ? `<div class="dc-desc">${esc(c.description)}</div>`  : ''}
    <div class="dc-tags">
      ${c.baseSpirit ? `<span class="dc-base">${esc(c.baseSpirit)}</span>` : ''}
      ${c.tag        ? `<span class="tag">${esc(c.tag)}</span>`           : ''}
    </div>
  </div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// safeMarkup: for AI replies — escape all HTML, then allow line breaks only.
// Never call .replace(newline, '<br>') on raw API text without escaping first.
function safeMarkup(s) {
  return esc(s).replace(/\n/g, '<br>');
}

// ── CARD CLICK DELEGATION ─────────────────────────────────
// FIX: containers are wired ONCE in init().
// FIX: pass the favBtn element directly — NOT the event object.
//      Using e.currentTarget in a delegated handler gives the
//      CONTAINER element, not the fav button, corrupting innerHTML.
function wireCardArea(el) {
  el.addEventListener('click', e => {
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) {
      e.stopPropagation();
      toggleFav(favBtn, favBtn.dataset.id);   // ← pass element, not event
      return;
    }
    const card = e.target.closest('.drink-card');
    if (card) openModal(card.dataset.id);
  });
}

// ── RENDER HOME ───────────────────────────────────────────
function renderHome() {
  // Featured pick
  if (allCocktails.length > 0) {
    const pick = allCocktails[Math.floor(Math.random() * allCocktails.length)];
    document.getElementById('featured-card').innerHTML = cardHTML(pick, 'hero-size featured');
  }

  // Signature cocktails
  const sigs  = allCocktails.filter(c => (c.tag || '').toLowerCase().includes('signature'));
  const sigEl = document.getElementById('home-signatures');
  sigEl.innerHTML = sigs.length > 0
    ? sigs.slice(0, 3).map(c => cardHTML(c, 'featured')).join('')
    : '<div class="empty"><div class="ei">✨</div>Add &#x27;Signature&#x27; to a cocktail&#x27;s tags in cocktails.json to feature it here.</div>';

  // Stats
  document.getElementById('count-ingredients').textContent = allIngredients.length;
  document.getElementById('count-cocktails').textContent   = allCocktails.length;
  document.getElementById('count-favourites').textContent  = favourites.size;
}

// ── RENDER MY VAULT ───────────────────────────────────────
function renderBar() {
  const container = document.getElementById('bar-sections');
  if (!container) return;

  // Badge counts (always off full list, ignoring active filter)
  const total     = allIngredients.length;
  const available = allIngredients.filter(i => getIngStatus(i) === 'have').length;
  const need      = allIngredients.filter(i => getIngStatus(i) === 'need').length;
  const elAll   = document.getElementById('bf-count-all');
  const elAvail = document.getElementById('bf-count-available');
  const elNeed  = document.getElementById('bf-count-need');
  if (elAll)   elAll.textContent   = total;
  if (elAvail) elAvail.textContent = available;
  if (elNeed)  elNeed.textContent  = need;

  // Filter
  let filtered = allIngredients;
  if (barActiveFilter === 'available') filtered = allIngredients.filter(i => getIngStatus(i) === 'have');
  else if (barActiveFilter === 'need') filtered = allIngredients.filter(i => getIngStatus(i) === 'need');

  // Group by category
  const groups = {};
  for (const ing of filtered) {
    const key = ing.category.toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(ing);
  }

  const ORDER   = ['spirits','liqueurs','bitters','juices','syrups','garnishes','wine','top up'];
  const allKeys = [...new Set([...ORDER, ...Object.keys(groups)])];

  let html = '';
  for (const key of allKeys) {
    if (!groups[key]?.length) continue;
    const meta  = CAT_META[key] || { icon: '📦', label: key, cls: 'cat-spirits' };
    const items = groups[key];
    html += `<div class="bar-category ${meta.cls}">
      <div class="cat-header">
        <div class="cat-icon">${meta.icon}</div>
        <div class="cat-label">${meta.label}</div>
        <div class="cat-count">${items.length} item${items.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="pill-grid">
        ${items.map(ing => {
          const isHave = getIngStatus(ing) === 'have';
          return `<button class="pill ${isHave ? 'have' : 'need-it'}" data-ing-id="${ing.id}"
            aria-label="${esc(ing.item)}: ${isHave ? 'available' : 'needed'}">
            <div class="pill-dot"></div>
            <span class="pill-name">${esc(ing.item)}</span>
            ${ing.brand ? `<span class="pill-brand">· ${esc(ing.brand)}</span>` : ''}
            <span class="pill-chk">${isHave ? '✓' : '+'}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  if (!html) {
    container.innerHTML = '<div class="empty"><div class="ei">📦</div>No ingredients match this filter.</div>';
    return;
  }

  container.innerHTML = html;

  // Wire pill toggle
  container.querySelectorAll('.pill[data-ing-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const id  = pill.dataset.ingId;
      const ing = allIngredients.find(x => x.id === id);
      if (!ing) return;
      ingredientOverrides[id] = getIngStatus(ing) === 'have' ? 'need' : 'have';
      saveOverrides();
      pill.style.transform = 'scale(0.93)';
      setTimeout(() => { pill.style.transform = ''; renderBar(); }, 130);
    });
  });
}

// ── RENDER COCKTAILS ──────────────────────────────────────
function buildFilterChips() {
  const row = document.getElementById('filter-row');
  row.innerHTML = SPIRIT_FILTERS.map(f =>
    `<button class="filter-chip ${f.key === 'all' ? 'active' : ''}" data-filter="${f.key}">
      <span class="chip-icon">${f.icon}</span>${f.label}
    </button>`).join('');

  row.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderCocktails(activeFilter, document.getElementById('cocktail-search').value);
  });
}

function renderCocktails(filterKey, search) {
  filterKey  = filterKey || 'all';
  const q    = (search || '').toLowerCase();
  let   list = allCocktails.filter(c => {
    if (!q) return true;
    return (c.name + ' ' + c.baseSpirit + ' ' + c.tag + ' ' + c.ingredients).toLowerCase().includes(q);
  });
  if (filterKey !== 'all') list = list.filter(c => c.spiritKey === filterKey);

  document.getElementById('cocktail-count').textContent = `${list.length} cocktail${list.length !== 1 ? 's' : ''}`;

  const el = document.getElementById('cocktail-list');
  el.innerHTML = list.length === 0
    ? '<div class="empty"><div class="ei">🍸</div>No cocktails found. Try a different filter.</div>'
    : list.map(c => cardHTML(c)).join('');
}

// ── FAVOURITES ────────────────────────────────────────────
// FIX: receives the button element directly (not the event).
//      Passing the event and using e.currentTarget gives the
//      delegated container, which would wipe all its innerHTML.
function toggleFav(btn, id) {
  if (favourites.has(id)) {
    favourites.delete(id);
    btn.textContent = '🤍';
    btn.classList.remove('on');
  } else {
    favourites.add(id);
    btn.textContent = '❤️';
    btn.classList.add('on');
    btn.style.transform = 'scale(1.4)';
    setTimeout(() => { btn.style.transform = ''; }, 300);
  }
  document.getElementById('count-favourites').textContent = favourites.size;
}

// ── MODAL ─────────────────────────────────────────────────
function openModal(id) {
  const c = allCocktails.find(x => x.id === id);
  if (!c) return;
  activeModalId = id;

  document.getElementById('modal-tag').textContent  = c.tag || '';
  document.getElementById('modal-name').textContent = c.name;
  document.getElementById('modal-base').textContent = c.baseSpirit || '—';

  const descEl = document.getElementById('modal-description');
  descEl.parentElement.style.display = c.description ? 'block' : 'none';
  descEl.textContent = c.description || '';

  const histEl = document.getElementById('modal-history');
  histEl.parentElement.style.display = c.history ? 'block' : 'none';
  histEl.textContent = c.history || '';

  activeUnit = 'oz';
  document.getElementById('unit-oz').classList.add('on');
  document.getElementById('unit-ml').classList.remove('on');

  renderModalIngredients(c);
  renderModalSteps(c);

  document.getElementById('modal-overlay').classList.add('open');
}

function renderModalIngredients(c) {
  const tbl       = document.getElementById('modal-ingredients');
  const ingLines  = splitLines(c.ingredients);
  const measLines = splitLines(activeUnit === 'ml' ? c.measML : c.measOz);

  if (!ingLines.length) {
    tbl.innerHTML = '<tr><td colspan="2" style="color:var(--muted);font-size:13px;padding:8px 0">See recipe steps below</td></tr>';
    return;
  }
  tbl.innerHTML = ingLines.map((ing, i) => `<tr>
    <td class="ing-meas">${esc(measLines[i] || '')}</td>
    <td class="ing-name">${esc(ing)}</td>
  </tr>`).join('');
}

function renderModalSteps(c) {
  const ol = document.getElementById('modal-steps');
  if (!c.steps) {
    ol.innerHTML = '<li class="step-item"><div class="step-text" style="color:var(--muted)">No steps recorded.</div></li>';
    return;
  }
  const steps = c.steps.split('\n').map(s => s.replace(/^\s*\d+[\.\)]\s*/, '').trim()).filter(Boolean);
  if (!steps.length) {
    ol.innerHTML = '<li class="step-item"><div class="step-text" style="color:var(--muted)">See ingredients above.</div></li>';
    return;
  }
  ol.innerHTML = steps.map((s, i) => `<li class="step-item">
    <div class="step-num">${i + 1}</div>
    <div class="step-text">${esc(s)}</div>
  </li>`).join('');
}

function splitLines(str) {
  return str ? str.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

function setUnit(u) {
  activeUnit = u;
  document.getElementById('unit-oz').classList.toggle('on', u === 'oz');
  document.getElementById('unit-ml').classList.toggle('on', u === 'ml');
  if (activeModalId !== null) {
    const c = allCocktails.find(x => x.id === activeModalId);
    if (c) renderModalIngredients(c);
  }
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay') || !e.target) {
    document.getElementById('modal-overlay').classList.remove('open');
    activeModalId = null;
  }
}

// ── NAVIGATION ────────────────────────────────────────────
const VALID_SCREENS = new Set(['home','bar','cocktails','decide']);
function switchScreen(id, btn) {
  if (!VALID_SCREENS.has(id)) return; // reject unknown screen IDs
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const sc = document.getElementById('screen-' + id);
  if (sc) sc.classList.add('active');
  if (btn?.classList) btn.classList.add('active');
  document.getElementById('scroll-area').scrollTop = 0;
}

// ── GREETING ──────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  document.getElementById('hero-greet').textContent =
    h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const tod = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late night';
  document.querySelectorAll('.tod-btn').forEach(b => b.classList.toggle('on', b.dataset.tod === tod));
}

// ── DECIDE ────────────────────────────────────────────────
function wireDecide() {
  document.getElementById('mood-grid')?.addEventListener('click', e => {
    const b = e.target.closest('.mood-btn'); if (!b) return;
    document.querySelectorAll('.mood-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  document.getElementById('decide-spirits')?.addEventListener('click', e => {
    const b = e.target.closest('.spirit-btn'); if (!b) return;
    document.querySelectorAll('.spirit-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  document.getElementById('tod-grid')?.addEventListener('click', e => {
    const b = e.target.closest('.tod-btn'); if (!b) return;
    document.querySelectorAll('.tod-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  const slider = document.getElementById('sweet-slider');
  const sMap   = { 1:'Dry / Bitter', 2:'Medium', 3:'Sweet' };
  slider?.addEventListener('input', function() {
    document.getElementById('sweet-val').textContent = sMap[this.value];
  });
}

function generateDrinks() {
  const btn = document.getElementById('gen-btn');
  btn.classList.add('shaking');
  setTimeout(() => btn.classList.remove('shaking'), 550);

  const spirit = document.querySelector('.spirit-btn.on')?.dataset.spirit || 'any';
  let pool = spirit !== 'any' ? allCocktails.filter(c => c.spiritKey === spirit) : [...allCocktails];
  if (!pool.length) pool = [...allCocktails];
  const picks = pool.sort(() => Math.random() - .5).slice(0, 3);

  const ra = document.getElementById('results-area');
  ra.style.display = 'block';
  const rl = document.getElementById('results-list');
  rl.innerHTML = '';
  picks.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(c, 'pour-in');
    const card = wrap.firstElementChild;
    if (!card) return;
    card.style.animationDelay = `${i * 0.12}s`;
    rl.appendChild(card);
  });
  ra.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── MAKEABLE-COCKTAIL ENGINE (My Vault "I can make" + camera) ─────
// Spirit-keyed gradient colours for the card accent strip
const LAB_SPIRIT_GRAD = {
  gin:     'linear-gradient(160deg, #7c3aed 0%, #a78bfa 100%)',
  whisky:  'linear-gradient(160deg, #c8850a 0%, #f0a830 100%)',
  tequila: 'linear-gradient(160deg, #16a34a 0%, #4ade80 100%)',
  rum:     'linear-gradient(160deg, #9f1239 0%, #e11d48 100%)',
  vodka:   'linear-gradient(160deg, #0284c7 0%, #38bdf8 100%)',
  other:   'linear-gradient(160deg, #3f3f3f 0%, #6b6b6b 100%)',
};

// ── Fuzzy ingredient matching ─────────────────────────────
// Builds an array of lowercase search keys for an ingredient from ingredients.json.
// Strategy: full name + brand (year/parenthetical stripped) so that cocktail
// ingredient lines like "Empress 1908 Gin", "Glenfiddich 12 Scotch", "Cointreau",
// "Angostura Bitters" all resolve to the correct ingredients.json entry.
function labBuildKeys(ing) {
  const keys = [];
  keys.push(ing.item.toLowerCase().trim());
  if (ing.brand) {
    const b = ing.brand
      .replace(/\s*[\(\[].*/, '')                      // strip "(Costco)", "[Dry/Blanc]"
      .replace(/\s+\d+\s*(years?|yr|year)\b.*/i, '')   // strip " 12 Year", " 12 years"
      .trim().toLowerCase();
    if (b.length >= 3) keys.push(b);
  }
  return keys;
}

// Returns true if a single cocktail ingredient line (e.g. "Angostura Bitters")
// is satisfied by a given ingredient from ingredients.json.
function labIngMatchesLine(ing, cocktailLine) {
  const line = cocktailLine.toLowerCase().trim();
  if (!line) return false;
  // Bidirectional: "angostura bitters".includes("angostura") ✓
  //                "american vodka".includes("vodka")        ✓ (key includes line)
  return labBuildKeys(ing).some(k => line.includes(k) || k.includes(line));
}

// Scores a cocktail against a set of selected ingredient objects.
// Returns { matched, total, score, detail } where detail is per-line hit info.
function labScoreCocktail(cocktail, selectedIngs) {
  const lines = splitLines(cocktail.ingredients);
  if (!lines.length) return null;
  let matched = 0;
  const detail = lines.map(line => {
    const hit = selectedIngs.some(ing => labIngMatchesLine(ing, line));
    if (hit) matched++;
    return { line, hit };
  });
  return { matched, total: lines.length, score: matched / lines.length, detail };
}

// ── My Vault "I can make" — score cocktails from available ingredients ──
function renderVaultMake() {
  const el = document.getElementById('vault-make-results');
  if (!el) return;

  const haves = allIngredients.filter(i => getIngStatus(i) === 'have');

  if (haves.length === 0) {
    el.innerHTML = `<div class="lab-empty">
      <div class="lab-empty-icon">🧪</div>
      <div class="lab-empty-title">Nothing marked available yet</div>
      <div class="lab-empty-sub">Mark ingredients as available in <strong>My shelf</strong> to see every cocktail you can make right now</div>
    </div>`;
    return;
  }

  // Score all cocktails against what's on the shelf, keep any with ≥1 match
  const scored = allCocktails
    .map(c => ({ c, r: labScoreCocktail(c, haves) }))
    .filter(x => x.r && x.r.matched > 0)
    .sort((a, b) => b.r.score - a.r.score || b.r.matched - a.r.matched);

  if (scored.length === 0) {
    el.innerHTML = `<div class="lab-empty">
      <div class="lab-empty-icon">🥃</div>
      <div class="lab-empty-title">No matches yet</div>
      <div class="lab-empty-sub">Mark a few more staples available — even one extra can unlock a dozen cocktails</div>
    </div>`;
    return;
  }

  const perfect = scored.filter(x => x.r.score === 1);
  const partial = scored.filter(x => x.r.score < 1);

  let html = `<div class="lab-results-hd">
    <span class="lab-results-count">${scored.length} cocktail${scored.length !== 1 ? 's' : ''} within reach</span>
    ${perfect.length ? `<span class="lab-perfect-badge">${perfect.length} you can make now</span>` : ''}
  </div>`;

  if (perfect.length) {
    html += `<div class="lab-result-section">
      <div class="lab-sec-label">✓ Can Make Now</div>
      <div class="lab-card-list">${perfect.map(x => labCardHTML(x.c, x.r)).join('')}</div>
    </div>`;
  }
  if (partial.length) {
    html += `<div class="lab-result-section">
      <div class="lab-sec-label">◑ Almost There</div>
      <div class="lab-card-list">${partial.slice(0, 18).map(x => labCardHTML(x.c, x.r)).join('')}</div>
    </div>`;
  }

  el.innerHTML = html;
}

function labCardHTML(cocktail, result) {
  const perfect = result.score === 1;
  const grad    = LAB_SPIRIT_GRAD[cocktail.spiritKey] || LAB_SPIRIT_GRAD.other;
  const diff    = result.total <= 2 ? 'Easy' : result.total <= 4 ? 'Medium' : 'Advanced';
  const diffCls = result.total <= 2 ? 'diff-easy' : result.total <= 4 ? 'diff-medium' : 'diff-hard';
  const pct     = Math.round(result.score * 100);
  const missing = result.detail.filter(d => !d.hit).map(d => d.line);
  const missingNote = !perfect && missing.length
    ? `<div class="lab-card-missing">Need: ${esc(missing.slice(0,2).join(', '))}${missing.length > 2 ? '…' : ''}</div>`
    : '';

  return `<div class="lab-cocktail-card${perfect ? ' perfect' : ''}" data-id="${esc(cocktail.id)}">
    <div class="lab-card-strip" style="background:${grad}"></div>
    <div class="lab-card-body">
      <div class="lab-card-top">
        <div class="lab-card-name">${esc(cocktail.name)}</div>
        <div class="lab-card-badge${perfect ? ' badge-perfect' : ' badge-partial'}">
          ${perfect ? '✓' : `${result.matched}/${result.total}`}
        </div>
      </div>
      ${cocktail.baseSpirit ? `<div class="lab-card-spirit">${esc(cocktail.baseSpirit)}</div>` : ''}
      ${cocktail.description ? `<div class="lab-card-desc">${esc(cocktail.description)}</div>` : ''}
      <div class="lab-card-footer">
        <span class="lab-diff ${diffCls}">${diff}</span>
        <div class="lab-match-bar"><div class="lab-match-fill" style="width:${pct}%"></div></div>
        <span class="lab-match-pct">${pct}%</span>
      </div>
      ${missingNote}
    </div>
  </div>`;
}

// ── VAULT ICON — UNLOCK ANIMATION ────────────────────────
function triggerVaultUnlock() {
  const icon = document.getElementById('vault-hero-icon');
  if (!icon) return;
  // Remove class first (force reflow so animation restarts if clicked rapidly)
  icon.classList.remove('unlocking');
  void icon.offsetWidth;
  icon.classList.add('unlocking');
  // Clean up after animation completes
  setTimeout(() => icon.classList.remove('unlocking'), 700);
}

// ── SNAP & SIP (CAMERA — lives inside the Decide tab's "By photo" panel) ──
// The photo is sent to a serverless proxy (Vercel) that holds the Anthropic
// key in its ANTHROPIC_API_KEY env var and forwards to Claude. The key is
// NEVER in the browser. Model + prompt are pinned server-side in api/analyze.js.
const CAM_PROXY_URL = 'https://mixology-vault.vercel.app/api/analyze';
const ALWAYS_PRESENT = [
  { item: 'Simple Syrup', category: 'syrups', id: '_simple-syrup', alwaysPresent: true,
    note: 'Use 1:1 sugar & hot water, or a sugar cube' },
  { item: 'Lemon Juice',  category: 'juices',  id: '_lemon-juice', alwaysPresent: true },
];

let camIdentifiedIngs = [];
let camRemovedIds     = new Set();
let camEditMode       = false;
let camCurrentFile    = null;
let camPreviewURL     = null;

function camHasKey() { return !!CAM_PROXY_URL; }

let camErrorTimer = null;
function camShowError(msg) {
  const el = document.getElementById('cam-error');
  el.textContent = msg;
  el.style.display = '';
  clearTimeout(camErrorTimer);
  camErrorTimer = setTimeout(() => { el.style.display = 'none'; }, 8000);
}

// Downscale the photo to a max 1568px long edge (Anthropic's recommended cap)
// and return base64 JPEG. Keeps the upload well under the proxy's ~4.5 MB body
// limit and cuts Claude token cost, without a visible quality hit.
function camFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1568;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataURL = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataURL.substring(dataURL.indexOf(',') + 1), mediaType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// POST the image to the Vercel proxy, which attaches the key and forwards to
// Anthropic. On success the proxy returns Claude's raw response JSON.
async function camCallClaude(base64, mediaType) {
  const resp = await fetch(CAM_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base64, mediaType }),
  });
  if (!resp.ok) {
    let msg = `Error ${resp.status}`;
    try { const j = await resp.json(); msg = j.error?.message || j.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return resp.json();
}

function camParseIngredients(apiResp) {
  try {
    const text  = apiResp?.content?.[0]?.text || '';
    // Greedy match captures the longest [...] span — Claude sometimes prefixes
    // its real answer with a short example array, and the real list is the one we want.
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => typeof x === 'string' && x.trim().length > 1 && x.trim().length < 80)
      .map(x => x.trim());
  } catch (_) {
    return [];
  }
}

function camBuildIngObjects(names) {
  const fromClaude = names.map(name => ({
    item:     name,
    category: 'spirits',
    id:       '_cam_' + name.toLowerCase().replace(/\W+/g, '-'),
  }));
  return [...ALWAYS_PRESENT, ...fromClaude];
}

function camActiveIngs() {
  return camIdentifiedIngs.filter(i => !camRemovedIds.has(i.id));
}

function camRenderChips() {
  const wrap = document.getElementById('cam-chips-wrap');
  if (!wrap) return;
  wrap.innerHTML = camIdentifiedIngs.map(ing => {
    const removed  = camRemovedIds.has(ing.id);
    const isAlways = !!ing.alwaysPresent;
    const removeX  = camEditMode && !isAlways
      ? `<span class="cam-chip-remove" data-cam-remove="${esc(ing.id)}">×</span>`
      : '';
    const alwaysCls = isAlways ? ' cam-chip--always' : '';
    const removeCls = removed  ? ' cam-chip--removed' : '';
    const note      = isAlways && ing.note
      ? `<span class="cam-chip-note" title="${esc(ing.note)}"> ✦</span>` : '';
    return `<button class="cam-chip${alwaysCls}${removeCls}" data-cam-id="${esc(ing.id)}">${esc(ing.item)}${note}${removeX}</button>`;
  }).join('');
}

function camRenderResults() {
  const active  = camActiveIngs();
  const scored  = allCocktails
    .map(c => { const r = labScoreCocktail(c, active); return r ? { c, r } : null; })
    .filter(x => x && x.r.matched > 0)
    .sort((a, b) => b.r.score - a.r.score);

  const perfect  = scored.filter(x => x.r.score === 1);
  const partial  = scored.filter(x => x.r.score <  1);

  const el = document.getElementById('cam-cocktail-results');
  if (!el) return;

  if (!scored.length) {
    el.innerHTML = `<div class="cam-empty">Couldn't match any cocktails — try adding more ingredients or retake with better lighting.</div>`;
    camRenderElevation([]);
    return;
  }

  let html = '';
  if (perfect.length) {
    html += `<div class="lab-results-hd"><span class="lab-rh-badge rh-can">✓ Can Make Now</span><span class="lab-rh-count">${perfect.length}</span></div>`;
    html += `<div class="lab-cards-grid">` + perfect.map(({ c }) => cardHTML(c, 'pour-in')).join('') + `</div>`;
  }
  if (partial.length) {
    html += `<div class="lab-results-hd" style="margin-top:18px"><span class="lab-rh-badge rh-almost">◐ Almost There</span><span class="lab-rh-count">${partial.length}</span></div>`;
    html += `<div class="lab-cards-grid">` + partial.slice(0, 20).map(({ c, r }) => {
      const pct = Math.round(r.score * 100);
      const grad = LAB_SPIRIT_GRAD[c.spiritKey] || LAB_SPIRIT_GRAD.other;
      return `<div class="lab-cocktail-card drink-card" data-id="${esc(String(c.id))}">
        <div class="lcc-accent" style="background:${grad}"></div>
        <div class="lcc-body">
          <div class="lcc-name">${esc(c.name)}</div>
          <div class="lcc-spirit">${esc(c.baseSpirit)}</div>
          <div class="lcc-bar">
            <div class="lcc-fill" style="width:${pct}%;background:${grad}"></div>
          </div>
          <div class="lcc-pct">${pct}% matched</div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }
  el.innerHTML = html;
  camRenderElevation(partial);
}

function camRenderElevation(partial) {
  const freq = new Map();
  for (const { r } of partial) {
    for (const { line, hit } of r.detail) {
      if (!hit) freq.set(line, (freq.get(line) || 0) + 1);
    }
  }
  const top3 = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const secEl = document.getElementById('cam-elevate-section');
  const listEl = document.getElementById('cam-elevate-list');
  if (!secEl || !listEl) return;

  if (!top3.length) { secEl.style.display = 'none'; return; }

  listEl.innerHTML = top3.map(([name, count]) =>
    `<div class="cam-elevate-item">
      <span class="cam-elevate-name">${esc(name)}</span>
      <span class="cam-elevate-count">+${count} cocktail${count > 1 ? 's' : ''}</span>
    </div>`
  ).join('');
  secEl.style.display = '';
}

function camToggleEditMode() {
  camEditMode = !camEditMode;
  document.getElementById('cam-edit-toggle').textContent = camEditMode ? 'Done' : 'Edit';
  document.getElementById('cam-add-row').style.display = camEditMode ? '' : 'none';
  camRenderChips();
  if (!camEditMode) camRenderResults();
}

function camHandleAddIngredient() {
  const input = document.getElementById('cam-add-input');
  const val   = input.value.trim();
  if (!val || val.length > 80) return;
  camIdentifiedIngs.push({
    item:     val,
    category: 'spirits',
    id:       '_cam_' + val.toLowerCase().replace(/\W+/g, '-') + '_' + Date.now(),
  });
  input.value = '';
  camRenderChips();
}

function camHandleFileChange(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    camShowError('Please select an image file.'); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    camShowError('Image is too large (max 5 MB). Try a lower-resolution photo.'); return;
  }

  if (camPreviewURL) URL.revokeObjectURL(camPreviewURL);
  camPreviewURL = URL.createObjectURL(file);
  camCurrentFile = file;

  const img = document.getElementById('cam-preview-img');
  img.src = camPreviewURL;
  img.style.display = '';
  document.getElementById('cam-placeholder').style.display = 'none';
  document.getElementById('cam-snap-label').textContent = 'Retake';
  document.getElementById('cam-analyse-btn').style.display = '';
  document.getElementById('cam-results-area').style.display = 'none';
  document.getElementById('cam-error').style.display = 'none';
}

async function camRunAnalysis() {
  if (!camCurrentFile) return;
  document.getElementById('cam-loading').style.display = '';
  document.getElementById('cam-analyse-btn').style.display = 'none';
  document.getElementById('cam-results-area').style.display = 'none';
  document.getElementById('cam-error').style.display = 'none';
  camEditMode = false;
  camRemovedIds = new Set();
  camIdentifiedIngs = [];

  try {
    const { base64, mediaType } = await camFileToBase64(camCurrentFile);
    const apiResp = await camCallClaude(base64, mediaType);
    const names   = camParseIngredients(apiResp);

    if (!names.length) {
      camShowError("Claude couldn't identify any ingredients — try a clearer photo with good lighting.");
      document.getElementById('cam-analyse-btn').style.display = '';
      return;
    }

    camIdentifiedIngs = camBuildIngObjects(names);
    camRenderChips();
    camRenderResults();
    document.getElementById('cam-results-area').style.display = '';
    if (document.getElementById('screen-decide').classList.contains('active')) {
      document.getElementById('cam-results-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    camShowError(err.message || 'Something went wrong. Please try again.');
    document.getElementById('cam-analyse-btn').style.display = '';
  } finally {
    document.getElementById('cam-loading').style.display = 'none';
  }
}

function camInit() {
  // No API key configured (local/dev, or before first deploy injects it):
  // show a graceful notice and skip wiring the capture UI.
  if (!camHasKey()) {
    const unavail = document.getElementById('decide-snap-unavailable');
    const main    = document.getElementById('cam-main');
    if (unavail) unavail.style.display = '';
    if (main)    main.style.display = 'none';
    return;
  }

  // Capture zone click → trigger file input (snap-btn stops propagation to avoid double-fire)
  document.getElementById('cam-capture-zone')?.addEventListener('click', () => {
    document.getElementById('cam-file-input').click();
  });
  document.getElementById('cam-snap-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('cam-file-input').click();
  });
  document.getElementById('cam-file-input')?.addEventListener('change', camHandleFileChange);

  // Analyse button
  document.getElementById('cam-analyse-btn')?.addEventListener('click', camRunAnalysis);

  // Edit mode toggle
  document.getElementById('cam-edit-toggle')?.addEventListener('click', camToggleEditMode);

  // Chip removal (delegation)
  document.getElementById('cam-chips-wrap')?.addEventListener('click', e => {
    const rmSpan = e.target.closest('[data-cam-remove]');
    if (rmSpan && camEditMode) {
      const id = rmSpan.dataset.camRemove;
      if (camRemovedIds.has(id)) camRemovedIds.delete(id);
      else camRemovedIds.add(id);
      camRenderChips();
      return;
    }
  });

  // Add ingredient
  document.getElementById('cam-add-confirm')?.addEventListener('click', camHandleAddIngredient);
  document.getElementById('cam-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') camHandleAddIngredient();
  });
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  setGreeting();
  wireDecide();
  buildFilterChips();

  // Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeModalId !== null) closeModal(null);
  });

  // ── Wire all event handlers (replaces inline onclick/oninput/onkeydown) ──

  // Hero brand mark unlock animation
  document.getElementById('hero-brand-mark')?.addEventListener('click', triggerVaultUnlock);

  // Home screen — stat pills navigate to bar/cocktails screens
  document.querySelectorAll('.stat-pill--link[data-screen]').forEach(pill => {
    pill.addEventListener('click', () => {
      const navBtn = pill.dataset.navBtn ? document.getElementById(pill.dataset.navBtn) : null;
      switchScreen(pill.dataset.screen, navBtn);
    });
  });

  // Home CTA — "What should I drink right now?"
  document.getElementById('home-cta')?.addEventListener('click', () => switchScreen('decide', null));

  // Shuffle tonight's pick
  document.getElementById('shuffle-btn')?.addEventListener('click', renderHome);

  // Generate drinks (Decide screen)
  document.getElementById('gen-btn')?.addEventListener('click', generateDrinks);

  // Decide mode toggle — "By mood" (manual picker) vs "By photo" (Snap flow)
  document.getElementById('decide-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-decide-mode]');
    if (!btn) return;
    const mode = btn.dataset.decideMode;
    document.querySelectorAll('.decide-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.decideMode === mode));
    document.getElementById('decide-mood-panel').style.display  = mode === 'mood'  ? '' : 'none';
    document.getElementById('decide-photo-panel').style.display = mode === 'photo' ? '' : 'none';
  });

  // ── My Vault: shelf / "I can make" toggle ─────────────────
  document.getElementById('vault-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-vault-mode]');
    if (!btn) return;
    vaultMode = btn.dataset.vaultMode;
    document.querySelectorAll('#vault-toggle .decide-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.vaultMode === vaultMode));
    document.getElementById('vault-shelf-panel').style.display = vaultMode === 'shelf' ? '' : 'none';
    document.getElementById('vault-make-panel').style.display  = vaultMode === 'make'  ? '' : 'none';
    if (vaultMode === 'make') renderVaultMake();
  });

  // "I can make" result cards → open recipe modal (delegated)
  document.getElementById('vault-make-results')?.addEventListener('click', e => {
    const card = e.target.closest('.lab-cocktail-card[data-id]');
    if (card) openModal(card.dataset.id);
  });

  // Bottom nav — delegate all nav-button clicks via data-screen attribute
  document.getElementById('nav')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-screen]');
    if (!btn) return;
    // Pass btn as the activatable nav button only if it has .nav-btn class
    const navBtn = btn.classList.contains('nav-btn') ? btn : null;
    switchScreen(btn.dataset.screen, navBtn);
  });

  // Modal — close on overlay backdrop click (not on modal content itself)
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('modal-close-btn')?.addEventListener('click', () => closeModal(null));

  // Modal — unit toggle
  document.getElementById('unit-oz')?.addEventListener('click', () => setUnit('oz'));
  document.getElementById('unit-ml')?.addEventListener('click', () => setUnit('ml'));

  // Cocktail search
  document.getElementById('cocktail-search')?.addEventListener('input', e => {
    renderCocktails(activeFilter, e.target.value);
  });

  // Bar filter tabs
  document.querySelectorAll('.bar-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bar-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      barActiveFilter = btn.dataset.barFilter;
      renderBar();
    });
  });

  // FIX: Wire all card containers ONCE here, not inside render functions.
  // Event delegation means the listener works for any dynamically inserted
  // child cards without needing to re-attach on every re-render.
  wireCardArea(document.getElementById('featured-card'));
  wireCardArea(document.getElementById('home-signatures'));
  wireCardArea(document.getElementById('cocktail-list'));
  wireCardArea(document.getElementById('results-list'));
  wireCardArea(document.getElementById('cam-cocktail-results'));

  // Load local JSON files in parallel
  [allIngredients, allCocktails] = await Promise.all([
    loadIngredients(),
    loadCocktails(),
  ]);

  renderHome();
  renderBar();
  renderCocktails('all', '');

  // My Vault "I can make" — initial render (now data is loaded)
  renderVaultMake();

  // Snap flow (lives inside Decide's "By photo" panel)
  camInit();

  // Visible app version (Home footer)
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = 'v' + APP_VERSION;

  registerServiceWorker();
}

// ── SERVICE WORKER + UPDATE FLOW ─────────────────────────
// New SW installs → "A new version is available" banner → user clicks Refresh →
// SKIP_WAITING → controllerchange → reload onto the fresh assets.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const showUpdateBanner = () => {
    document.getElementById('update-banner')?.classList.remove('hidden');
  };

  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Check for a new worker on load and whenever the tab regains focus.
    reg.update();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });

    if (reg.waiting) showUpdateBanner();

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });
  }).catch(err => console.warn('SW:', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  document.getElementById('btn-update-reload')?.addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });
  });
}

// ── PWA INSTALL PROMPT (Android A2HS) ────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window._installPrompt = e;
});

// ── FRAGMENT SHORTCUTS (manifest shortcuts deep-link) ────
function handleFragmentShortcut() {
  const hash = window.location.hash;
  if (hash === '#decide') {
    switchScreen('decide', document.getElementById('nav-decide'));
  }
  if (hash) window.history.replaceState(null, '', './index.html');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().then(handleFragmentShortcut));
} else {
  init().then(handleFragmentShortcut);
}
