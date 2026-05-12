'use strict';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEYS = {
  ING_OVERRIDES: 'hb_ing_overrides',
  FAVOURITES:    'hb_favourites',
  UNIT:          'hb_unit',
};

// ─── State ────────────────────────────────────────────────────────────────────
let allIngredients   = [];
let allCocktails     = [];
let allMocktails     = [];
let favourites       = new Set();
let activeScreen     = 'home';
let activeFilter     = 'all';
let activeMocktailFilter = 'all';
let activeUnit       = localStorage.getItem(KEYS.UNIT) || 'oz';
let activeModalId    = null;
let activeModalType  = null;
let scrollPositions  = {};
let decidePool       = 'cocktails';
let decideMood       = null;
let decideSpirit     = 'any';
let todaysPick       = null;
const screenCache    = {};

// ─── Utility ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function safeJsonParse(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sanitiseIngredientOverrides(raw, ingredients) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const validIds    = new Set(ingredients.map(i => i.id));
  const validValues = new Set(['have', 'can-get']);
  const clean = {};
  for (const [k, v] of Object.entries(raw)) {
    if (validIds.has(k) && validValues.has(v)) clean[k] = v;
  }
  return clean;
}

function sanitiseFavourites(raw, cocktails, mocktails) {
  if (!Array.isArray(raw)) return [];
  const validIds = new Set([...cocktails, ...mocktails].map(d => d.id));
  return raw.filter(id => typeof id === 'string' && validIds.has(id));
}

// ─── Data Helpers ─────────────────────────────────────────────────────────────
function normaliseMood(m) {
  if (!m) return 'Chill';
  return m.trim() === 'Cozy' ? 'Cosy' : m.trim();
}

function resolveIngredient(name, ingredients) {
  const n = name.toLowerCase().trim();
  if (!n) return null;
  return ingredients.find(ing => {
    const iName  = ing.name.toLowerCase();
    const iBrand = (ing.brand || '').toLowerCase();
    return iName === n || (iBrand && iBrand === n) ||
           iName.includes(n) || n.includes(iName) ||
           (iBrand && iBrand.includes(n)) || (iBrand && n.includes(iBrand));
  }) ?? null;
}

function getEffectiveStatus(ingredient) {
  const overrides = safeJsonParse(localStorage.getItem(KEYS.ING_OVERRIDES), {});
  return overrides[ingredient.id] ?? ingredient.status;
}

function setIngredientStatus(id, newStatus) {
  const overrides = safeJsonParse(localStorage.getItem(KEYS.ING_OVERRIDES), {});
  overrides[id] = newStatus;
  safeSetItem(KEYS.ING_OVERRIDES, JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent('ingredientStatusChanged'));
}

function computeAvailability(drink, ingredients) {
  const missing = drink.ingredients
    .map(name => resolveIngredient(name, ingredients))
    .filter(ing => ing !== null && getEffectiveStatus(ing) === 'can-get')
    .map(ing => ing.name);
  return {
    state: missing.length === 0 ? 'ready'
         : missing.length === 1 ? 'almost'
         : 'needs-work',
    missingIngredients: missing,
  };
}

function getSpiritKey(drink) {
  const s = (drink.baseSpirit || '').toLowerCase();
  if (!s) return 'other';
  if (s.includes('gin'))                           return 'gin';
  if (s.includes('whisky') || s.includes('whiskey')) return 'whisky';
  if (s.includes('tequila'))                       return 'tequila';
  if (s.includes('rum'))                           return 'rum';
  if (s.includes('vodka'))                         return 'vodka';
  if (s.includes('campari'))                       return 'campari';
  if (s.includes('prosecco'))                      return 'prosecco';
  if (s.includes('amaretto'))                      return 'amaretto';
  return 'other';
}

function enrichDrink(drink, ingredients) {
  const avail    = computeAvailability(drink, ingredients);
  const spiritKey = getSpiritKey(drink);
  return {
    ...drink,
    mood:               normaliseMood(drink.mood),
    availabilityState:  avail.state,
    missingIngredients: avail.missingIngredients,
    spiritKey,
  };
}

function recomputeAllAvailability() {
  allCocktails = allCocktails.map(d => {
    const avail = computeAvailability(d, allIngredients);
    return { ...d, availabilityState: avail.state, missingIngredients: avail.missingIngredients };
  });
  allMocktails = allMocktails.map(d => {
    const avail = computeAvailability(d, allIngredients);
    return { ...d, availabilityState: avail.state, missingIngredients: avail.missingIngredients };
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortDrinks(drinks) {
  const stateOrder = { ready: 0, almost: 1, 'needs-work': 2 };
  return [...drinks].sort((a, b) => {
    const aFav = favourites.has(a.id) ? 0 : 1;
    const bFav = favourites.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    const aS = stateOrder[a.availabilityState] ?? 2;
    const bS = stateOrder[b.availabilityState] ?? 2;
    if (aS !== bS) return aS - bS;
    return a.name.localeCompare(b.name);
  });
}

// ─── Favourites ───────────────────────────────────────────────────────────────
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* QuotaExceededError — silent fail */ }
}

function saveFavourites(set) {
  safeSetItem(KEYS.FAVOURITES, JSON.stringify([...set]));
}

function toggleFav(id, type) {
  if (favourites.has(id)) {
    favourites.delete(id);
  } else {
    favourites.add(id);
  }
  saveFavourites(favourites);

  // Update all fav buttons for this drink in the current DOM
  document.querySelectorAll(`.fav-btn[data-id="${CSS.escape(id)}"]`).forEach(btn => {
    btn.textContent = favourites.has(id) ? '❤️' : '🤍';
    btn.setAttribute('aria-pressed', String(favourites.has(id)));
  });

  // Invalidate screen caches so next visit re-renders with updated sort
  delete screenCache['cocktails'];
  delete screenCache['mocktails'];
  delete screenCache['home'];
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function badgeText(drink) {
  if (drink.availabilityState === 'ready')  return 'Ready';
  if (drink.availabilityState === 'almost') return 'Need 1';
  return 'Need ' + drink.missingIngredients.length;
}

// ─── Lazy Image Loading ───────────────────────────────────────────────────────
let imgObserver;

function initImageObserver() {
  imgObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (!src) return;

      img.src = src;
      img.onload = () => {
        img.classList.add('loaded');
        const placeholder = img.nextElementSibling;
        if (placeholder && placeholder.classList.contains('card-img-placeholder')) {
          placeholder.style.opacity = '0';
        }
      };
      img.onerror = () => {
        img.remove();
      };
      imgObserver.unobserve(img);
    });
  }, { rootMargin: '100px' });
}

function observeImages(container) {
  if (!imgObserver) initImageObserver();
  container.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

// ─── Animation ────────────────────────────────────────────────────────────────
function animateCardsIn(cards) {
  cards.forEach((card, i) => {
    requestAnimationFrame(() => {
      setTimeout(() => card.classList.add('visible'), i * 80);
    });
  });
}

// ─── Filter Helpers ───────────────────────────────────────────────────────────
function matchesSpiritFilter(drink, filter) {
  if (filter === 'all') return true;
  const key = drink.spiritKey;
  if (filter === 'other') return !['gin','whisky','tequila','rum','vodka'].includes(key);
  return key === filter;
}

function matchesTagFilter(drink, filter) {
  if (filter === 'all') return true;
  return (drink.tags || []).some(t => t.toLowerCase() === filter.toLowerCase());
}

// ─── Card HTML ────────────────────────────────────────────────────────────────
function cardHTML(drink, type) {
  const isFav   = favourites.has(drink.id);
  const eyebrow = drink.baseSpirit || drink.baseIngredient || '';
  return `<div class="drink-card" data-id="${esc(drink.id)}" data-type="${esc(type)}" data-spirit="${esc(drink.spiritKey)}">
    <div class="card-img-wrap">
      <img class="card-img" data-src="./icons/${esc(drink.id)}.png" src="" alt="${esc(drink.name)}" loading="lazy">
      <div class="card-img-placeholder"></div>
    </div>
    <div class="card-body">
      <div class="card-eyebrow">${esc(eyebrow)}</div>
      <div class="card-name">${esc(drink.name)}</div>
      <div class="card-desc">${esc(drink.description || '')}</div>
      <div class="card-footer">
        <div class="card-badge badge-${esc(drink.availabilityState)}">${esc(badgeText(drink))}</div>
        <button class="fav-btn" data-id="${esc(drink.id)}" data-type="${esc(type)}"
                aria-label="Favourite ${esc(drink.name)}" aria-pressed="${isFav}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
    </div>
  </div>`;
}

function appendCards(container, drinks, type) {
  const frag = document.createDocumentFragment();
  drinks.forEach(d => {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(d, type);
    frag.appendChild(wrap.firstElementChild);
  });
  container.innerHTML = '';
  container.appendChild(frag);
  observeImages(container);
  animateCardsIn([...container.children]);
}

function wireCardArea(container) {
  container.addEventListener('click', e => {
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) {
      e.stopPropagation();
      toggleFav(favBtn.dataset.id, favBtn.dataset.type);
      return;
    }
    const card = e.target.closest('.drink-card');
    if (card) openModal(card.dataset.id, card.dataset.type);
  });
}

// ─── Screen Builder Dispatch ──────────────────────────────────────────────────
function buildScreen(id) {
  const el = document.createElement('div');
  el.className = 'screen';
  el.id = 'screen-' + id;
  if (id === 'home')      buildHomeScreen(el);
  if (id === 'cocktails') buildCocktailsScreen(el);
  if (id === 'mocktails') buildMocktailsScreen(el);
  if (id === 'decide')    buildDecideScreen(el);
  if (id === 'mybar')     buildMyBarScreen(el);
  return el;
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function pickTonight() {
  const ready  = allCocktails.filter(d => d.availabilityState === 'ready');
  const almost = allCocktails.filter(d => d.availabilityState === 'almost');
  const pool   = ready.length ? ready : almost.length ? almost : allCocktails;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function buildHomeScreen(el) {
  if (!todaysPick) todaysPick = pickTonight();
  const pick       = todaysPick;
  const signatures = sortDrinks(allCocktails.filter(d => (d.tags || []).includes('Signature')));

  el.innerHTML = `
    <div class="home-hero">
      <div class="home-greet">${esc(getGreeting())}</div>
      <div class="home-title">MixologyVault</div>
      <div class="home-subtitle">The Home Bar</div>
    </div>
    <div class="home-stats">
      <button class="stat-item" data-nav="mybar">
        <div class="stat-num">${allIngredients.length}</div>
        <div class="stat-lbl">Ingredients</div>
      </button>
      <button class="stat-item" data-nav="cocktails">
        <div class="stat-num">${allCocktails.length}</div>
        <div class="stat-lbl">Cocktails</div>
      </button>
      <button class="stat-item" data-nav="mocktails">
        <div class="stat-num">${allMocktails.length}</div>
        <div class="stat-lbl">Mocktails</div>
      </button>
      <button class="stat-item" data-nav="cocktails">
        <div class="stat-num">${favourites.size}</div>
        <div class="stat-lbl">Favourites</div>
      </button>
    </div>
    ${pick ? `
    <div class="home-section">
      <div class="section-header">
        <div class="section-title">Tonight&#x27;s Pick</div>
        <button class="shuffle-btn" id="shuffle-pick" aria-label="Shuffle tonight&#x27;s pick">&#x21BA; Shuffle</button>
      </div>
      <div class="tonight-card" id="tonight-card">${tonightCardHTML(pick)}</div>
    </div>` : ''}
    <div class="home-section">
      <div class="section-header">
        <div class="section-title">Signature Cocktails</div>
      </div>
      <div class="sig-scroll" id="sig-scroll">
        ${signatures.map(d => sigCardHTML(d)).join('')}
      </div>
    </div>
    <div class="home-cta">
      <button class="btn-primary" id="decide-cta">What should I drink?</button>
    </div>
  `;

  wireCardArea(el);
  observeImages(el);

  el.querySelector('.home-stats').addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (btn) switchScreen(btn.dataset.nav);
  });

  const shuffleBtn = el.querySelector('#shuffle-pick');
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', e => {
      e.stopPropagation();
      todaysPick = pickTonight();
      const tc = el.querySelector('#tonight-card');
      if (tc && todaysPick) {
        tc.innerHTML = tonightCardHTML(todaysPick);
        observeImages(tc);
      }
    });
  }

  el.querySelector('#decide-cta').addEventListener('click', () => switchScreen('decide'));
}

function tonightCardHTML(drink) {
  if (!drink) return '';
  const isFav = favourites.has(drink.id);
  return `<div class="tonight-inner drink-card" data-id="${esc(drink.id)}" data-type="cocktail" data-spirit="${esc(drink.spiritKey)}">
    <div class="tonight-img-wrap">
      <img class="card-img" data-src="./icons/${esc(drink.id)}.png" src="" alt="${esc(drink.name)}" loading="lazy">
      <div class="card-img-placeholder"></div>
    </div>
    <div class="tonight-info">
      <div class="card-eyebrow">${esc(drink.baseSpirit || '')}</div>
      <div class="tonight-name">${esc(drink.name)}</div>
      <div class="tonight-desc">${esc(drink.description || '')}</div>
      <div class="tonight-footer">
        <div class="card-badge badge-${esc(drink.availabilityState)}">${esc(badgeText(drink))}</div>
        <button class="fav-btn" data-id="${esc(drink.id)}" data-type="cocktail"
                aria-label="Favourite ${esc(drink.name)}" aria-pressed="${isFav}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
    </div>
  </div>`;
}

function sigCardHTML(d) {
  const isFav = favourites.has(d.id);
  return `<div class="sig-card drink-card" data-id="${esc(d.id)}" data-type="cocktail" data-spirit="${esc(d.spiritKey)}">
    <div class="card-img-wrap">
      <img class="card-img" data-src="./icons/${esc(d.id)}.png" src="" alt="${esc(d.name)}" loading="lazy">
      <div class="card-img-placeholder"></div>
    </div>
    <div class="card-body">
      <div class="card-name">${esc(d.name)}</div>
      <div class="card-footer">
        <div class="card-badge badge-${esc(d.availabilityState)}">${esc(badgeText(d))}</div>
        <button class="fav-btn" data-id="${esc(d.id)}" data-type="cocktail"
                aria-label="Favourite ${esc(d.name)}" aria-pressed="${isFav}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
    </div>
  </div>`;
}

// ─── Cocktails Screen ─────────────────────────────────────────────────────────
function buildCocktailsScreen(el) {
  const spirits      = ['all','gin','whisky','tequila','rum','vodka','other'];
  const spiritLabels = { all:'All', gin:'Gin', whisky:'Whisky', tequila:'Tequila', rum:'Rum', vodka:'Vodka', other:'Other' };

  el.innerHTML = `
    <div class="screen-header">
      <div class="page-title">Cocktails</div>
      <div class="search-wrap">
        <input type="search" id="cocktail-search" class="search-input"
               placeholder="Search cocktails…" aria-label="Search cocktails"
               autocomplete="off" spellcheck="false">
      </div>
    </div>
    <div class="filter-row" id="spirit-filter-row" role="group" aria-label="Filter by spirit">
      ${spirits.map(s => `<button class="filter-chip${s === activeFilter ? ' active' : ''}" data-filter="${s}">${esc(spiritLabels[s])}</button>`).join('')}
    </div>
    <div class="card-grid" id="cocktail-grid"></div>
  `;

  const grid        = el.querySelector('#cocktail-grid');
  const searchInput = el.querySelector('#cocktail-search');
  const filterRow   = el.querySelector('#spirit-filter-row');

  function renderList(filter, query) {
    let drinks = allCocktails.filter(d => matchesSpiritFilter(d, filter));
    const q    = (query || '').trim().toLowerCase();
    if (q) {
      drinks = drinks.filter(d =>
        d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
      );
    }
    drinks = sortDrinks(drinks);

    if (!drinks.length) {
      grid.innerHTML = `<div class="empty-state">
        <p>No cocktails match &#x201C;<strong>${esc(query || filter)}</strong>&#x201D;</p>
        <button class="btn-outline clear-filter-btn">Clear filter</button>
      </div>`;
      grid.querySelector('.clear-filter-btn').addEventListener('click', () => {
        activeFilter = 'all';
        filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
        searchInput.value = '';
        renderList('all', '');
      });
      return;
    }
    appendCards(grid, drinks, 'cocktail');
  }

  wireCardArea(grid);

  filterRow.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderList(activeFilter, searchInput.value);
  });

  let searchTimer = null;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderList(activeFilter, e.target.value), 250);
  });

  renderList(activeFilter, '');
}

// ─── Mocktails Screen ─────────────────────────────────────────────────────────
function buildMocktailsScreen(el) {
  const tagSet = new Set();
  allMocktails.forEach(d => (d.tags || []).forEach(t => tagSet.add(t)));
  const tags = ['all', ...tagSet];

  el.innerHTML = `
    <div class="screen-header">
      <div class="page-title">Mocktails</div>
    </div>
    <div class="filter-row" id="mocktail-filter-row" role="group" aria-label="Filter by tag">
      ${tags.map(t => `<button class="filter-chip${t === activeMocktailFilter ? ' active' : ''}" data-filter="${esc(t)}">${esc(t === 'all' ? 'All' : t)}</button>`).join('')}
    </div>
    <div class="card-grid" id="mocktail-grid"></div>
  `;

  const grid      = el.querySelector('#mocktail-grid');
  const filterRow = el.querySelector('#mocktail-filter-row');

  function renderList(filter) {
    const drinks = sortDrinks(allMocktails.filter(d => matchesTagFilter(d, filter)));

    if (!drinks.length) {
      grid.innerHTML = `<div class="empty-state">
        <p>No mocktails match <strong>${esc(filter)}</strong></p>
        <button class="btn-outline clear-filter-btn">Clear filter</button>
      </div>`;
      grid.querySelector('.clear-filter-btn').addEventListener('click', () => {
        activeMocktailFilter = 'all';
        filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
        renderList('all');
      });
      return;
    }
    appendCards(grid, drinks, 'mocktail');
  }

  wireCardArea(grid);

  filterRow.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    activeMocktailFilter = chip.dataset.filter;
    filterRow.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderList(activeMocktailFilter);
  });

  renderList(activeMocktailFilter);
}

// ─── Decide Screen ────────────────────────────────────────────────────────────
function buildDecideScreen(el) {
  const moods        = ['Bold','Chill','Energised','Fresh','Party','Romantic','Cosy','Curious'];
  const spiritKeys   = ['any','gin','whisky','tequila','rum','vodka','other'];
  const spiritLabels = { any:'Any', gin:'Gin', whisky:'Whisky', tequila:'Tequila', rum:'Rum', vodka:'Vodka', other:'Other' };

  el.innerHTML = `
    <div class="screen-header">
      <div class="page-title">Decide</div>
    </div>
    <div class="decide-section">
      <div class="decide-label">Mood</div>
      <div class="mood-grid" id="mood-grid">
        ${moods.map(m => `<button class="mood-btn${decideMood === m ? ' active' : ''}" data-mood="${esc(m)}">${esc(m)}</button>`).join('')}
      </div>
    </div>
    <div class="decide-section">
      <div class="decide-label">Spirit</div>
      <div class="filter-row" id="decide-spirit-row">
        ${spiritKeys.map(s => `<button class="filter-chip${decideSpirit === s ? ' active' : ''}" data-spirit="${s}">${esc(spiritLabels[s])}</button>`).join('')}
      </div>
    </div>
    <div class="decide-section">
      <div class="decide-label">Pool</div>
      <div class="pool-toggle" id="pool-toggle">
        <button class="pool-btn${decidePool === 'cocktails' ? ' active' : ''}" data-pool="cocktails">Cocktails</button>
        <button class="pool-btn${decidePool === 'mocktails' ? ' active' : ''}" data-pool="mocktails">Mocktails</button>
        <button class="pool-btn${decidePool === 'both' ? ' active' : ''}" data-pool="both">Both</button>
      </div>
    </div>
    <button class="btn-primary decide-go" id="decide-go">Find My Drink</button>
    <div id="decide-results"></div>
  `;

  const moodGrid  = el.querySelector('#mood-grid');
  const spiritRow = el.querySelector('#decide-spirit-row');
  const poolToggle = el.querySelector('#pool-toggle');
  const resultsEl = el.querySelector('#decide-results');

  moodGrid.addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn');
    if (!btn) return;
    const m = btn.dataset.mood;
    decideMood = decideMood === m ? null : m;
    moodGrid.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === decideMood));
  });

  spiritRow.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    decideSpirit = chip.dataset.spirit;
    spiritRow.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
  });

  poolToggle.addEventListener('click', e => {
    const btn = e.target.closest('.pool-btn');
    if (!btn) return;
    decidePool = btn.dataset.pool;
    poolToggle.querySelectorAll('.pool-btn').forEach(b => b.classList.toggle('active', b === btn));
  });

  el.querySelector('#decide-go').addEventListener('click', () => runDecide(resultsEl));

  wireCardArea(el);
}

function runDecide(resultsEl) {
  let pool = [];
  if (decidePool === 'cocktails' || decidePool === 'both') pool = [...allCocktails];
  if (decidePool === 'mocktails' || decidePool === 'both') pool = [...pool, ...allMocktails];

  if (decideSpirit !== 'any') {
    pool = pool.filter(d => {
      if (decideSpirit === 'other') return !['gin','whisky','tequila','rum','vodka'].includes(d.spiritKey);
      return d.spiritKey === decideSpirit;
    });
  }

  if (!pool.length) {
    resultsEl.innerHTML = `<div class="decide-empty">
      <p>Nothing matches — try adjusting your preferences</p>
      <button class="btn-outline" id="decide-reset">Reset</button>
    </div>`;
    resultsEl.querySelector('#decide-reset').addEventListener('click', () => {
      decideMood   = null;
      decideSpirit = 'any';
      decidePool   = 'cocktails';
      delete screenCache['decide'];
      switchScreen('decide');
    });
    return;
  }

  const stateScore  = { ready: 3, almost: 1, 'needs-work': 0 };
  const picks = [...pool]
    .map(d => {
      let score = 0;
      if (favourites.has(d.id)) score += 4;
      score += stateScore[d.availabilityState] ?? 0;
      if (decideMood && normaliseMood(d.mood) === decideMood) score += 2;
      score += Math.random() * 0.99;
      return { d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.d);

  const typeOf = d => d.baseIngredient !== undefined ? 'mocktail' : 'cocktail';
  const wrap = document.createElement('div');
  wrap.className = 'decide-results-grid';
  picks.forEach(d => {
    const div = document.createElement('div');
    div.innerHTML = cardHTML(d, typeOf(d));
    wrap.appendChild(div.firstElementChild);
  });

  resultsEl.innerHTML = '';
  resultsEl.appendChild(wrap);
  observeImages(wrap);
  animateCardsIn([...wrap.children]);
}

// ─── My Bar Screen ────────────────────────────────────────────────────────────
function buildMyBarScreen(el) {
  const catOrder = ['Spirits','Liqueurs','Bitters','Juices','Syrups','Garnishes','Wine','Top Up'];
  const catVars  = {
    Spirits: '--cat-spirits', Liqueurs: '--cat-liqueurs', Bitters: '--cat-bitters',
    Juices:  '--cat-juices',  Syrups: '--cat-syrups', Garnishes: '--cat-garnishes',
    Wine:    '--cat-wine',   'Top Up': '--cat-topup',
  };

  const groups = catOrder.map(cat => {
    const items = allIngredients.filter(i => i.category === cat);
    if (!items.length) return '';
    const varName = catVars[cat] || '--gold';
    return `<div class="ing-category">
      <div class="ing-cat-title" style="color:var(${varName})">${esc(cat)}</div>
      <div class="ing-list">${items.map(ing => ingRowHTML(ing)).join('')}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="screen-header">
      <div class="page-title">My Vault</div>
    </div>
    <div class="mybar-content">${groups}</div>
  `;

  el.addEventListener('click', e => {
    const toggle = e.target.closest('.ing-toggle');
    if (!toggle) return;
    const id        = toggle.dataset.id;
    const curStatus = toggle.dataset.status;
    const newStatus = curStatus === 'have' ? 'can-get' : 'have';

    setIngredientStatus(id, newStatus);

    toggle.dataset.status = newStatus;
    toggle.className      = 'ing-toggle status-' + newStatus;
    toggle.textContent    = newStatus === 'have' ? 'Have' : 'Can Get';

    const dot = toggle.closest('.ing-row')?.querySelector('.ing-status-dot');
    if (dot) dot.dataset.status = newStatus;
  });
}

function ingRowHTML(ing) {
  const status = getEffectiveStatus(ing);
  const label  = ing.brand || ing.name;
  const sub    = ing.name + (ing.notes ? ' · ' + ing.notes : '');
  return `<div class="ing-row">
    <div class="ing-info">
      <div class="ing-status-dot" data-status="${esc(status)}"></div>
      <div class="ing-details">
        <div class="ing-name">${esc(label)}</div>
        <div class="ing-sub">${esc(sub)}</div>
      </div>
    </div>
    <button class="ing-toggle status-${esc(status)}" data-id="${esc(ing.id)}" data-status="${esc(status)}"
            aria-label="Toggle status for ${esc(ing.name)}">
      ${status === 'have' ? 'Have' : 'Can Get'}
    </button>
  </div>`;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function switchScreen(id) {
  const scrollArea = document.getElementById('scroll-area');

  if (activeScreen) {
    scrollPositions[activeScreen] = scrollArea.scrollTop;
    const cur = document.getElementById('screen-' + activeScreen);
    if (cur) cur.remove();
  }

  activeScreen = id;

  if (!screenCache[id]) {
    screenCache[id] = buildScreen(id);
  }

  scrollArea.appendChild(screenCache[id]);
  scrollArea.scrollTop = scrollPositions[id] || 0;
  observeImages(screenCache[id]);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === id);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(id, type) {
  const drinks = type === 'mocktail' ? allMocktails : allCocktails;
  const drink  = drinks.find(d => d.id === id);
  if (!drink) return;

  activeModalId   = id;
  activeModalType = type;

  const content = document.getElementById('modal-content');
  content.innerHTML = buildModalContent(drink, type);

  const overlay = document.getElementById('modal-overlay');
  overlay.removeAttribute('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));

  history.pushState({ modal: true }, '', '#modal');

  wireModalEvents(content, drink, type);
  observeImages(overlay);
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => {
    overlay.setAttribute('hidden', '');
    document.getElementById('modal-content').innerHTML = '';
  }, { once: true });
  activeModalId   = null;
  activeModalType = null;
  if (location.hash === '#modal') history.back();
}

function buildModalContent(drink, type) {
  const isFav    = favourites.has(drink.id);
  const eyebrow  = drink.baseSpirit || drink.baseIngredient || '';
  const measures = activeUnit === 'oz' ? (drink.measurementsOz || []) : (drink.measurementsMl || []);

  const ingRows = (drink.ingredients || []).map((name, i) => {
    const resolved = resolveIngredient(name, allIngredients);
    const missing  = resolved ? getEffectiveStatus(resolved) === 'can-get' : false;
    const measure  = measures[i] || '';
    return `<div class="modal-ing-row${missing ? ' missing' : ''}">
      <div class="modal-ing-dot${missing ? ' missing' : ''}"></div>
      <div class="modal-ing-name">${esc(name)}</div>
      <div class="modal-ing-measure">${esc(measure)}</div>
      ${missing ? '<div class="modal-ing-cart">&#x1F6D2;</div>' : ''}
    </div>`;
  }).join('');

  const recipeLine = esc(drink.recipe || '').replace(/\n/g, '<br>');

  return `
    <div class="modal-img-wrap" data-spirit="${esc(drink.spiritKey)}">
      <img class="modal-img card-img" data-src="./icons/${esc(drink.id)}.png" src="" alt="${esc(drink.name)}" loading="lazy">
      <div class="card-img-placeholder"></div>
      <button class="modal-close" id="modal-close" aria-label="Close">&#x2715;</button>
      <button class="modal-fav fav-btn" data-id="${esc(drink.id)}" data-type="${esc(type)}"
              aria-label="Favourite ${esc(drink.name)}" aria-pressed="${isFav}">
        ${isFav ? '❤️' : '🤍'}
      </button>
    </div>
    <div class="modal-body">
      <div class="modal-eyebrow">${esc(eyebrow)}</div>
      <h2 class="modal-title">${esc(drink.name)}</h2>
      <div class="unit-toggle" id="unit-toggle">
        <button class="unit-btn${activeUnit === 'oz' ? ' active' : ''}" data-unit="oz">oz</button>
        <button class="unit-btn${activeUnit === 'ml' ? ' active' : ''}" data-unit="ml">ml</button>
      </div>
      <div class="modal-section-title">Ingredients</div>
      <div class="modal-ingredients">${ingRows}</div>
      <div class="modal-section-title">Recipe</div>
      <div class="modal-recipe">${recipeLine}</div>
      <details class="modal-accordion">
        <summary class="modal-accordion-trigger">History &amp; Description</summary>
        <div class="modal-accordion-body">
          ${drink.history ? `<p>${esc(drink.history)}</p>` : ''}
          ${drink.description ? `<p>${esc(drink.description)}</p>` : ''}
        </div>
      </details>
    </div>
  `;
}

function wireModalEvents(content, drink, type) {
  content.querySelector('#modal-close').addEventListener('click', closeModal);

  const favBtn = content.querySelector('.modal-fav');
  if (favBtn) {
    favBtn.addEventListener('click', () => toggleFav(drink.id, type));
  }

  const unitToggle = content.querySelector('#unit-toggle');
  if (unitToggle) {
    unitToggle.addEventListener('click', e => {
      const btn = e.target.closest('.unit-btn');
      if (!btn) return;
      activeUnit = btn.dataset.unit;
      safeSetItem(KEYS.UNIT, activeUnit);

      const measures = activeUnit === 'oz' ? (drink.measurementsOz || []) : (drink.measurementsMl || []);
      content.querySelectorAll('.modal-ing-measure').forEach((el, i) => {
        el.textContent = measures[i] || '';
      });
      unitToggle.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === activeUnit));
    });
  }
}

// ─── Ingredient Status Change Handler ────────────────────────────────────────
window.addEventListener('ingredientStatusChanged', () => {
  recomputeAllAvailability();

  document.querySelectorAll('.drink-card').forEach(card => {
    const id     = card.dataset.id;
    const drType = card.dataset.type;
    const drinks = drType === 'mocktail' ? allMocktails : allCocktails;
    const drink  = drinks.find(d => d.id === id);
    if (!drink) return;
    const badge = card.querySelector('.card-badge');
    if (badge) {
      badge.className   = 'card-badge badge-' + drink.availabilityState;
      badge.textContent = badgeText(drink);
    }
  });

  delete screenCache['cocktails'];
  delete screenCache['mocktails'];
});

// ─── App Height ───────────────────────────────────────────────────────────────
function setAppHeight() {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl = document.getElementById('loading-screen');
  const errorEl   = document.getElementById('error-screen');
  const appEl     = document.getElementById('app');

  loadingEl.removeAttribute('hidden');
  errorEl.setAttribute('hidden', '');
  appEl.setAttribute('hidden', '');

  try {
    const [cocktailsRaw, mocktailsRaw, ingredientsRaw] = await Promise.all([
      fetch('./cocktails.json').then(r => { if (!r.ok) throw new Error('fetch'); return r.json(); }),
      fetch('./mocktails.json').then(r => { if (!r.ok) throw new Error('fetch'); return r.json(); }),
      fetch('./ingredients.json').then(r => { if (!r.ok) throw new Error('fetch'); return r.json(); }),
    ]);

    allIngredients = ingredientsRaw;

    // Sanitise stored overrides against known IDs
    const rawOverrides   = safeJsonParse(localStorage.getItem(KEYS.ING_OVERRIDES), {});
    const cleanOverrides = sanitiseIngredientOverrides(rawOverrides, allIngredients);
    safeSetItem(KEYS.ING_OVERRIDES, JSON.stringify(cleanOverrides));

    allCocktails = cocktailsRaw.map(d => enrichDrink(d, allIngredients));
    allMocktails = mocktailsRaw.map(d => enrichDrink(d, allIngredients));

    // Sanitise and load favourites
    const rawFavs   = safeJsonParse(localStorage.getItem(KEYS.FAVOURITES), []);
    const cleanFavs = sanitiseFavourites(rawFavs, allCocktails, allMocktails);
    favourites = new Set(cleanFavs);

    loadingEl.setAttribute('hidden', '');
    appEl.removeAttribute('hidden');

    // Wire navigation
    document.getElementById('bottom-nav').addEventListener('click', e => {
      const btn = e.target.closest('.nav-btn');
      if (btn && btn.dataset.screen) switchScreen(btn.dataset.screen);
    });

    // Android back / modal dismiss
    window.addEventListener('popstate', () => {
      if (activeModalId !== null) closeModal();
    });

    // Close modal on backdrop tap
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });

    setAppHeight();
    window.addEventListener('resize',            setAppHeight, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300), { passive: true });

    // Passive touch listeners
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove',  () => {}, { passive: true });

    initImageObserver();
    switchScreen('home');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

  } catch {
    loadingEl.setAttribute('hidden', '');
    errorEl.removeAttribute('hidden');
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('retry-btn').addEventListener('click', init);
  init();
});
