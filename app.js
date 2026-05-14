/* ═══════════════════════════════════════════════════════
   MIXOLOGY VAULT — app.js
   Tabs: Ingredients (5 cols) | Cocktails (9 cols)
═══════════════════════════════════════════════════════ */
'use strict';

// ── CONFIG ──────────────────────────────────────────────
const DATA_BASE = './'; // path prefix for JSON data files

// ── STATE ────────────────────────────────────────────────
let allIngredients    = [];
let allCocktails      = [];
let favourites        = new Set();
let activeFilter      = 'all';
let activeUnit        = 'oz';
let activeModalId     = null;
let chatHistory       = [];
let barActiveFilter   = 'all';

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
const VALID_SCREENS = new Set(['home','bar','cocktails','decide','ai']);
function switchScreen(id, btn) {
  if (!VALID_SCREENS.has(id)) return; // reject unknown screen IDs
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const sc = document.getElementById('screen-' + id);
  if (sc) sc.classList.add('active');
  if (btn?.classList) btn.classList.add('active');
  document.getElementById('scroll-area').scrollTop = 0;
  if (id === 'ai') checkApiKey();
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

// ── AI HELPERS ────────────────────────────────────────────
async function fetchWithRetry(fn, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (err.status === 429 && i < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      throw err;
    }
  }
}

// ── AI MIXOLOGIST ─────────────────────────────────────────
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
  document.getElementById('chat-input').value = el.textContent.trim();
  sendChat();
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = role === 'ai' ? `<strong>Mixologist</strong>${safeMarkup(text)}` : esc(text);
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
  // Keep last 20 messages to cap API cost + memory (10 exchanges)
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const loadEl = document.createElement('div');
  loadEl.className = 'msg ai';
  loadEl.innerHTML = `<strong>Mixologist</strong><div class="dots"><span></span><span></span><span></span></div>`;
  document.getElementById('chat-messages').appendChild(loadEl);
  loadEl.scrollIntoView({ behavior: 'smooth', block: 'end' });

  const haveItems = allIngredients
    .filter(i => getIngStatus(i) === 'have')
    .map(i => `${i.item}${i.brand ? ' (' + i.brand + ')' : ''}`)
    .join(', ');

  const systemPrompt = `You are an expert AI mixologist for "Mixology Vault", a personal home bar app. Available ingredients: ${haveItems || 'Empress 1908 Gin, Glenfiddich 12 Year, Kirkland Tequila Añejo, Monkey Shoulder, Cointreau, Angostura Bitters, Prosecco'}. Cocktails in the vault: ${allCocktails.map(c => c.name).join(', ')}. Be warm, specific, and confident. Give full recipes with measurements. Keep responses concise and elegant.`;

  try {
    const data = await fetchWithRetry(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: chatHistory,
        })
      });
      const json = await res.json();
      if (json.error) { const e = new Error(json.error.message || 'API error'); e.status = res.status; throw e; }
      return json;
    });
    const reply = data.content?.[0]?.text || 'Sorry, something went wrong. Try again.';
    chatHistory.push({ role: 'assistant', content: reply });
    loadEl.innerHTML = `<strong>Mixologist</strong>${safeMarkup(reply)}`;
    loadEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } catch (err) {
    loadEl.innerHTML = `<strong>Mixologist</strong>Connection issue — ${esc(err.message || 'check your API key and try again')}.`;
  }
  sendBtn.disabled = false;
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

  // AI screen — save API key
  document.getElementById('save-key-btn')?.addEventListener('click', saveApiKey);

  // AI screen — quick prompt chips
  document.querySelector('.suggest-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.suggest-chip');
    if (chip) quickPrompt(chip);
  });

  // AI screen — chat textarea auto-resize and Enter-to-send
  const chatInput = document.getElementById('chat-input');
  chatInput?.addEventListener('input', function() { autoResize(this); });
  chatInput?.addEventListener('keydown', chatKeydown);

  // AI screen — send button
  document.getElementById('send-btn')?.addEventListener('click', sendChat);

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

  // Load local JSON files in parallel
  [allIngredients, allCocktails] = await Promise.all([
    loadIngredients(),
    loadCocktails(),
  ]);

  renderHome();
  renderBar();
  renderCocktails('all', '');

  // Service Worker registration (moved here from inline script in HTML)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  }
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
  } else if (hash === '#ai') {
    switchScreen('ai', document.getElementById('nb-ai'));
  }
  if (hash) window.history.replaceState(null, '', './index.html');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().then(handleFragmentShortcut));
} else {
  init().then(handleFragmentShortcut);
}
