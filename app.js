/* ═══════════════════════════════════════════════════════
   THE HOME BAR — app.js
   Google Sheet ID: 12_04glNgaHvxNXlybudwtI6uHHdnZtMJlbV_9wjFoXM
   Tabs: Ingredients (5 cols) | Cocktails (7+ cols)
═══════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ──────────────────────────────────────────────
const SHEET_ID = '12_04glNgaHvxNXlybudwtI6uHHdnZtMJlbV_9wjFoXM';

// ── STATE ────────────────────────────────────────────────
let allIngredients = [];   // parsed from Ingredients sheet
let allCocktails   = [];   // parsed from Cocktails sheet (array of objects with .id)
let favourites     = new Set();
let activeFilter   = 'all';
let activeUnit     = 'oz'; // 'oz' or 'ml'
let activeModalId  = null;
let chatHistory    = [];

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

// ── GOOGLE SHEET FETCH ───────────────────────────────────
async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.replace(/^[^(]+\(/, '').replace(/\);\s*$/, ''));
    return json.table;
  } catch (e) {
    console.warn(`Sheet fetch failed for "${sheetName}":`, e.message);
    return null;
  }
}

function cellVal(c) {
  if (!c) return '';
  return (c.v !== null && c.v !== undefined) ? String(c.v).trim() : '';
}

// ── PARSE INGREDIENTS ────────────────────────────────────
// Columns: Category | Item | Brand/Details | Status | Notes
function parseIngredients(table) {
  if (!table || !table.rows) return [];
  return table.rows
    .map((row, i) => {
      const c = row.c || [];
      const cat    = cellVal(c[0]);
      const item   = cellVal(c[1]);
      const brand  = cellVal(c[2]);
      const status = cellVal(c[3]);
      const notes  = cellVal(c[4]);
      if (!cat || !item) return null;
      return {
        id:       i,
        category: cat,
        item,
        brand,
        status,          // "✅ Have" | "🛒 Can Get"
        notes,
        have:     status.includes('Have'),
        canGet:   status.includes('Can'),
      };
    })
    .filter(Boolean);
}

// ── PARSE COCKTAILS ──────────────────────────────────────
// Columns: Cocktail Name | Base Spirit | Tag | Ingredients |
//          Measurements(ml) | Measurements(oz) | Recipe/Steps |
//          [History] | [Description]
function parseCocktails(table) {
  if (!table || !table.rows) return [];
  return table.rows
    .map((row, i) => {
      const c = row.c || [];
      const name        = cellVal(c[0]);
      const baseSpirit  = cellVal(c[1]);
      const tag         = cellVal(c[2]);
      const ingredients = cellVal(c[3]);
      const measML      = cellVal(c[4]);
      const measOz      = cellVal(c[5]);
      const steps       = cellVal(c[6]);
      const history     = cellVal(c[7]);
      const description = cellVal(c[8]);
      if (!name) return null;
      return {
        id: i,
        name,
        baseSpirit,
        tag,
        ingredients,   // newline-separated list of ingredient names
        measML,        // newline-separated ml measurements (parallel to ingredients)
        measOz,        // newline-separated oz measurements (parallel to ingredients)
        steps,         // full recipe steps text
        history,
        description,
        // Derived: normalised spirit key for filtering
        spiritKey: normaliseSpiritKey(baseSpirit),
      };
    })
    .filter(Boolean);
}

function normaliseSpiritKey(baseSpirit) {
  if (!baseSpirit) return 'other';
  const b = baseSpirit.toLowerCase();
  if (b.includes('gin'))     return 'gin';
  if (b.includes('whisky') || b.includes('whiskey') || b.includes('scotch') || b.includes('bourbon') || b.includes('malt') || b.includes('irish')) return 'whisky';
  if (b.includes('tequila') || b.includes('mezcal')) return 'tequila';
  if (b.includes('rum'))     return 'rum';
  if (b.includes('vodka'))   return 'vodka';
  return 'other';
}

// ── CARD HTML ─────────────────────────────────────────────
// Uses data-id to avoid any inline JSON / quote escaping issues
function cardHTML(c, extraClass) {
  extraClass = extraClass || '';
  const isFav = favourites.has(c.id);
  return `
    <div class="drink-card ${extraClass}" data-id="${c.id}">
      <button class="fav-btn ${isFav ? 'on' : ''}" data-id="${c.id}" aria-label="Favourite">
        ${isFav ? '❤️' : '🤍'}
      </button>
      <div class="dc-name">${esc(c.name)}</div>
      ${c.baseSpirit ? `<div class="dc-eyebrow">${esc(c.baseSpirit)}</div>` : ''}
      ${c.description ? `<div class="dc-desc">${esc(c.description)}</div>` : ''}
      <div class="dc-tags">
        ${c.baseSpirit ? `<span class="dc-base">${esc(c.baseSpirit)}</span>` : ''}
        ${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}
      </div>
    </div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DELEGATION: card clicks & fav clicks ─────────────────
function wireCardArea(el) {
  el.addEventListener('click', e => {
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) { e.stopPropagation(); toggleFav(e, parseInt(favBtn.dataset.id)); return; }
    const card = e.target.closest('.drink-card');
    if (card) openModal(parseInt(card.dataset.id));
  });
}

// ── RENDER HOME ───────────────────────────────────────────
function renderHome() {
  // Featured: pick a random cocktail from sheet
  if (allCocktails.length > 0) {
    const pick = allCocktails[Math.floor(Math.random() * allCocktails.length)];
    document.getElementById('featured-card').innerHTML = cardHTML(pick, 'hero-size featured');
    wireCardArea(document.getElementById('featured-card'));
  }

  // Signature cocktails: tag contains 'Signature'
  const sigs = allCocktails.filter(c => (c.tag || '').toLowerCase().includes('signature'));
  const sigEl = document.getElementById('home-signatures');
  if (sigs.length > 0) {
    sigEl.innerHTML = sigs.slice(0, 3).map(c => cardHTML(c, 'featured')).join('');
    wireCardArea(sigEl);
  } else {
    sigEl.innerHTML = '<div class="empty"><div class="ei">✨</div>Add cocktails with tag "Signature" in your Google Sheet</div>';
  }

  // Stats
  document.getElementById('count-ingredients').textContent = allIngredients.length;
  document.getElementById('count-cocktails').textContent   = allCocktails.length;
  document.getElementById('count-favourites').textContent  = favourites.size;
}

// ── RENDER MY BAR ─────────────────────────────────────────
function renderBar() {
  const container = document.getElementById('bar-sections');
  if (!container) return;

  // Group by category (case-insensitive)
  const groups = {};
  for (const ing of allIngredients) {
    const key = ing.category.toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(ing);
  }

  // Defined order
  const ORDER = ['spirits','liqueurs','bitters','juices','syrups','garnishes','wine','top up'];
  const allKeys = [...new Set([...ORDER, ...Object.keys(groups)])];

  let html = '';
  for (const key of allKeys) {
    if (!groups[key] || groups[key].length === 0) continue;
    const meta = CAT_META[key] || { icon: '📦', label: key, cls: 'cat-spirits' };
    const items = groups[key];
    html += `
      <div class="bar-category ${meta.cls}">
        <div class="cat-header">
          <div class="cat-icon">${meta.icon}</div>
          <div class="cat-label">${meta.label}</div>
          <div class="cat-count">${items.length} item${items.length > 1 ? 's' : ''}</div>
        </div>
        <div class="pill-grid">
          ${items.map(ing => `
            <div class="pill ${ing.have ? 'have' : ing.canGet ? 'can-get' : ''}">
              <div class="pill-dot"></div>
              <span class="pill-name">${esc(ing.item)}</span>
              ${ing.brand ? `<span class="pill-brand">· ${esc(ing.brand)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html || '<div class="empty"><div class="ei">📦</div>Could not load bar data. Make sure your Google Sheet is shared publicly.</div>';
}

// ── RENDER COCKTAILS ──────────────────────────────────────
function buildFilterChips() {
  const row = document.getElementById('filter-row');
  row.innerHTML = SPIRIT_FILTERS.map(f => `
    <button class="filter-chip ${f.key === 'all' ? 'active' : ''}" data-filter="${f.key}">
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
  filterKey = filterKey || 'all';
  const q = (search || '').toLowerCase();

  let list = allCocktails.filter(c => {
    if (!q) return true;
    return (c.name + ' ' + c.baseSpirit + ' ' + c.tag + ' ' + c.ingredients)
      .toLowerCase()
      .includes(q);
  });

  if (filterKey !== 'all') {
    list = list.filter(c => c.spiritKey === filterKey);
  }

  document.getElementById('cocktail-count').textContent =
    `${list.length} cocktail${list.length !== 1 ? 's' : ''}`;

  const el = document.getElementById('cocktail-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty"><div class="ei">🍸</div>No cocktails found. Try a different filter.</div>';
    return;
  }
  el.innerHTML = list.map(c => cardHTML(c)).join('');
  wireCardArea(el);
}

// ── FAVOURITES ────────────────────────────────────────────
function toggleFav(e, id) {
  const btn = e.currentTarget;
  if (favourites.has(id)) {
    favourites.delete(id);
    btn.textContent = '🤍';
    btn.classList.remove('on');
  } else {
    favourites.add(id);
    btn.textContent = '❤️';
    btn.classList.add('on');
    btn.style.transform = 'scale(1.4)';
    setTimeout(() => btn.style.transform = '', 300);
  }
  document.getElementById('count-favourites').textContent = favourites.size;
}

// ── MODAL ─────────────────────────────────────────────────
function openModal(id) {
  const c = allCocktails.find(x => x.id === id);
  if (!c) { console.warn('Cocktail not found:', id); return; }
  activeModalId = id;

  document.getElementById('modal-tag').textContent   = c.tag || '';
  document.getElementById('modal-name').textContent  = c.name;
  document.getElementById('modal-base').textContent  = c.baseSpirit || '—';

  // Description
  const descEl = document.getElementById('modal-description');
  if (c.description) {
    descEl.parentElement.style.display = 'block';
    descEl.textContent = c.description;
  } else {
    descEl.parentElement.style.display = 'none';
  }

  // History
  const histEl = document.getElementById('modal-history');
  if (c.history) {
    histEl.parentElement.style.display = 'block';
    histEl.textContent = c.history;
  } else {
    histEl.parentElement.style.display = 'none';
  }

  // Reset unit to oz
  activeUnit = 'oz';
  document.getElementById('unit-oz').classList.add('on');
  document.getElementById('unit-ml').classList.remove('on');

  // Render ingredient table and steps
  renderModalIngredients(c);
  renderModalSteps(c);

  document.getElementById('modal-overlay').classList.add('open');
}

function renderModalIngredients(c) {
  const tbl = document.getElementById('modal-ingredients');

  const ingLines  = splitLines(c.ingredients);
  const mlLines   = splitLines(c.measML);
  const ozLines   = splitLines(c.measOz);
  const measLines = activeUnit === 'ml' ? mlLines : ozLines;

  if (ingLines.length === 0) {
    tbl.innerHTML = '<tr><td colspan="2" style="color:var(--muted);font-size:13px;padding:8px 0">See recipe steps below</td></tr>';
    return;
  }

  tbl.innerHTML = ingLines.map((ing, i) => `
    <tr>
      <td class="ing-meas">${esc(measLines[i] || '')}</td>
      <td class="ing-name">${esc(ing)}</td>
    </tr>`).join('');
}

function renderModalSteps(c) {
  const ol = document.getElementById('modal-steps');
  if (!c.steps) { ol.innerHTML = '<li class="step-item"><div class="step-text" style="color:var(--muted)">No steps recorded.</div></li>'; return; }

  const steps = c.steps
    .split('\n')
    .map(s => s.replace(/^\s*\d+[\.\)]\s*/, '').trim())
    .filter(Boolean);

  if (steps.length === 0) {
    ol.innerHTML = '<li class="step-item"><div class="step-text" style="color:var(--muted)">See ingredients above.</div></li>';
    return;
  }

  ol.innerHTML = steps.map((s, i) => `
    <li class="step-item">
      <div class="step-num">${i + 1}</div>
      <div class="step-text">${esc(s)}</div>
    </li>`).join('');
}

function splitLines(str) {
  if (!str) return [];
  return str.split('\n').map(s => s.trim()).filter(Boolean);
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
function switchScreen(id, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const sc = document.getElementById('screen-' + id);
  if (sc) sc.classList.add('active');
  if (btn && btn.classList) btn.classList.add('active');

  document.getElementById('scroll-area').scrollTop = 0;
  if (id === 'ai') checkApiKey();
}

// ── GREETING ──────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  document.getElementById('hero-greet').textContent =
    h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  // Auto-select time of day on decide screen
  const tod = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late night';
  document.querySelectorAll('.tod-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.tod === tod));
}

// ── DECIDE ENGINE ─────────────────────────────────────────
function wireDecide() {
  // Mood
  document.getElementById('mood-grid')?.addEventListener('click', e => {
    const b = e.target.closest('.mood-btn'); if (!b) return;
    document.querySelectorAll('.mood-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  // Spirit
  document.getElementById('decide-spirits')?.addEventListener('click', e => {
    const b = e.target.closest('.spirit-btn'); if (!b) return;
    document.querySelectorAll('.spirit-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  // Time
  document.getElementById('tod-grid')?.addEventListener('click', e => {
    const b = e.target.closest('.tod-btn'); if (!b) return;
    document.querySelectorAll('.tod-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  // Sweetness slider
  const slider = document.getElementById('sweet-slider');
  const sMap   = { 1: 'Dry / Bitter', 2: 'Medium', 3: 'Sweet' };
  slider?.addEventListener('input', function() {
    document.getElementById('sweet-val').textContent = sMap[this.value];
  });
}

function generateDrinks() {
  const btn = document.getElementById('gen-btn');
  btn.classList.add('shaking');
  setTimeout(() => btn.classList.remove('shaking'), 550);

  const spirit = document.querySelector('.spirit-btn.on')?.dataset.spirit || 'any';
  const sweet  = parseInt(document.getElementById('sweet-slider')?.value || 2);

  let pool = [...allCocktails];
  if (spirit !== 'any') {
    pool = pool.filter(c => c.spiritKey === spirit);
  }
  if (!pool.length) pool = [...allCocktails];
  const picks = pool.sort(() => Math.random() - .5).slice(0, 3);

  const ra = document.getElementById('results-area');
  ra.style.display = 'block';
  const rl = document.getElementById('results-list');
  rl.innerHTML = '';
  picks.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(c, 'pour-in');
    const card = wrap.firstChild;
    card.style.animationDelay = `${i * 0.12}s`;
    rl.appendChild(card);
  });
  wireCardArea(rl);
  ra.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── AI BARTENDER ──────────────────────────────────────────
function checkApiKey() {
  const key = localStorage.getItem('anthropic_key');
  document.getElementById('apikey-banner').style.display = key ? 'none' : 'block';
}

function saveApiKey() {
  const val = document.getElementById('apikey-input').value.trim();
  if (!val.startsWith('sk-')) { alert('Please enter a valid Anthropic API key (starts with sk-)'); return; }
  localStorage.setItem('anthropic_key', val);
  document.getElementById('apikey-banner').style.display = 'none';
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function quickPrompt(el) {
  document.getElementById('chat-input').value = el.textContent;
  sendChat();
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = role === 'ai' ? `<strong>Bartender</strong>${text}` : esc(text);
  document.getElementById('chat-messages').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  const key = localStorage.getItem('anthropic_key');
  if (!key) { checkApiKey(); return; }

  input.value = '';
  input.style.height = 'auto';
  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const loadEl = document.createElement('div');
  loadEl.className = 'msg ai';
  loadEl.innerHTML = `<strong>Bartender</strong><div class="dots"><span></span><span></span><span></span></div>`;
  document.getElementById('chat-messages').appendChild(loadEl);
  loadEl.scrollIntoView({ behavior: 'smooth', block: 'end' });

  const haveItems = allIngredients.filter(i => i.have).map(i => `${i.item}${i.brand ? ' (' + i.brand + ')' : ''}`).join(', ');
  const cocktailNames = allCocktails.map(c => c.name).join(', ');
  const systemPrompt = `You are an expert home bartender AI. Available ingredients: ${haveItems || 'Empress 1908 Gin, Glenfiddich 12 Year, Kirkland Tequila Añejo, Monkey Shoulder, Cointreau, Angostura Bitters, Prosecco'}. Cocktails in the bar: ${cocktailNames}. Be warm, specific, confident. Give full recipes with measurements. Keep responses concise.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: chatHistory
      })
    });
    const data  = await res.json();
    const reply = data.content?.[0]?.text || 'Sorry, something went wrong. Try again.';
    chatHistory.push({ role: 'assistant', content: reply });
    loadEl.innerHTML = `<strong>Bartender</strong>${reply.replace(/\n/g, '<br>')}`;
    loadEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } catch (err) {
    loadEl.innerHTML = `<strong>Bartender</strong>Connection issue — check your API key and try again.`;
  }
  sendBtn.disabled = false;
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  setGreeting();
  wireDecide();
  buildFilterChips();

  // Wire search
  document.getElementById('cocktail-search')?.addEventListener('input', e => {
    renderCocktails(activeFilter, e.target.value);
  });

  // Fetch both sheets in parallel
  const [ingTable, cktTable] = await Promise.all([
    fetchSheet('Ingredients'),
    fetchSheet('Cocktails'),
  ]);

  allIngredients = parseIngredients(ingTable);
  allCocktails   = parseCocktails(cktTable);

  renderHome();
  renderBar();
  renderCocktails('all', '');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
