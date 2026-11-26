// Token Radar dashboard. Reads window.RADAR (data.js, written by main.ts). No network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, shortlistOnly: false, compare: [] };
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var statsCounted = false;
  var skipAnimation = false;

  // The shortlist survives reloads in this browser; it is a working list, not part of the board.
  var SHORTLIST_KEY = 'radar.shortlist.v1';
  function readShortlist() {
    try {
      var list = JSON.parse(window.localStorage.getItem(SHORTLIST_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (s) { return typeof s === 'string'; }) : [];
    } catch (err) { return []; }
  }
  var shortlist = readShortlist();
  function isShortlisted(slug) { return shortlist.indexOf(slug) >= 0; }
  function isCompared(slug) { return state.compare.indexOf(slug) >= 0; }
  function toggleShortlist(slug) {
    var at = shortlist.indexOf(slug);
    if (at >= 0) shortlist.splice(at, 1); else shortlist.push(slug);
    try { window.localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist)); } catch (err) { /* private mode: keep it for this visit */ }
    if (!dialog.open) { skipAnimation = true; render(); }
  }
  function toggleCompare(slug) {
    var at = state.compare.indexOf(slug);
    if (at >= 0) state.compare.splice(at, 1);
    else {
      if (state.compare.length >= 3) state.compare.shift();
      state.compare.push(slug);
    }
    writeHash();
    if (!dialog.open) { skipAnimation = true; render(); }
  }
  function rowBySlug(slug) {
    return DATA.rows.filter(function (r) { return r.slug === slug; })[0] || null;
  }
  function medianOf(values) {
    if (values.length === 0) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function countUp(node, target, format) {
    if (reduceMotion || !window.requestAnimationFrame) { node.textContent = format(target); return; }
    var start = null;
    var dur = 820;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = format(Math.round(target * eased));
      if (t < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = round4(1 + (growth / 100) * model.growth_weight);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = round4(model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * maturity));
  }
  function peerComps(row) {
    var cat = row.peer_category;
    return DATA.live.filter(function (l) {
      return cat !== null && l.category === cat && l.mcap_usd > 0 && l.tvl_usd > 0;
    }).map(function (l) {
      return { name: l.name, multiple: round4(l.mcap_usd / l.tvl_usd), mcap: l.mcap_usd, tvl: l.tvl_usd };
    }).sort(function (a, b) { return b.multiple - a.multiple; }).slice(0, 4);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('c')) {
      state.compare = params.get('c').split(',').filter(function (s) { return s && rowBySlug(s) !== null; }).slice(0, 3);
    }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    if (state.compare.length > 0) params.set('c', state.compare.join(','));
    var next = params.toString();
    var url = window.location.pathname + window.location.search + (next ? '#' + next : '');
    window.history.replaceState(null, '', url);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.shortlistOnly && !isShortlisted(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'peer') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function pickCell(r) {
    var saved = isShortlisted(r.slug);
    var comparing = isCompared(r.slug);
    return el('div', { class: 'pick-cell' },
      el('button', {
        type: 'button', class: 'pick-btn star', 'aria-pressed': saved ? 'true' : 'false',
        'aria-label': (saved ? 'Remove ' : 'Add ') + r.name + (saved ? ' from' : ' to') + ' the shortlist',
        title: saved ? 'Shortlisted: click to remove' : 'Save to the shortlist',
        onclick: function (e) { e.stopPropagation(); toggleShortlist(r.slug); },
        onkeydown: function (e) { e.stopPropagation(); }
      }, '\u2605'),
      el('button', {
        type: 'button', class: 'pick-btn cmp', 'aria-pressed': comparing ? 'true' : 'false',
        'aria-label': (comparing ? 'Remove ' : 'Add ') + r.name + (comparing ? ' from' : ' to') + ' the comparison',
        title: comparing ? 'In the comparison: click to remove' : 'Add to the comparison (up to 3)',
        onclick: function (e) { e.stopPropagation(); toggleCompare(r.slug); },
        onkeydown: function (e) { e.stopPropagation(); },
        html: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5.5h8"/><path d="M8 3l2.5 2.5L8 8"/><path d="M13.5 10.5h-8"/><path d="M8 8l-2.5 2.5L8 13"/></svg>'
      })
    );
  }

  function comparePanel() {
    var picked = state.compare.map(rowBySlug).filter(function (r) { return r !== null; });
    if (picked.length < 2) return null;
    var best = {
      tvl: Math.max.apply(null, picked.map(function (r) { return r.tvl_usd; })),
      peer: Math.max.apply(null, picked.map(function (r) { return r.peer_multiple; })),
      implied: Math.max.apply(null, picked.map(function (r) { return r.implied_value_usd; })),
      capital: Math.min.apply(null, picked.map(function (r) { return capitalFor(r); }))
    };
    var head = el('tr', null, el('th', { scope: 'col', text: 'Metric' }), picked.map(function (r) {
      return el('th', { scope: 'col' },
        el('div', { class: 'cmp-head' },
          el('button', { type: 'button', class: 'cmp-name', text: r.name, title: 'Open ' + r.name, onclick: function () { openDetail(r.slug); } }),
          el('button', {
            type: 'button', class: 'cmp-remove', 'aria-label': 'Remove ' + r.name + ' from the comparison', text: '\u00d7',
            onclick: function () { toggleCompare(r.slug); }
          })
        )
      );
    }));

    function line(label, cells) {
      return el('tr', null, el('th', { scope: 'row', text: label }), cells);
    }
    function cell(text, winning, extra) {
      return el('td', { class: (winning ? 'best' : '') + (extra ? ' ' + extra : '') }, text);
    }
    var body = el('tbody', null,
      line('Rank', picked.map(function (r) { return cell('#' + r.rank); })),
      line('Category', picked.map(function (r) { return cell(r.category || 'Other'); })),
      line('TVL', picked.map(function (r) { return cell(fmtUsd(r.tvl_usd), r.tvl_usd === best.tvl); })),
      line('7d growth', picked.map(function (r) { return cell(fmtPct(r.change_7d), false, r.change_7d >= 0 ? 'pos' : 'neg'); })),
      line('Age no token', picked.map(function (r) { return cell(fmtAge(r.age_days)); })),
      line('Peer multiple', picked.map(function (r) { return cell(r.peer_multiple.toFixed(2) + 'x', r.peer_multiple === best.peer); })),
      line('Implied value', picked.map(function (r) { return cell(fmtUsd(r.implied_value_usd), r.implied_value_usd === best.implied); })),
      line('First move', picked.map(function (r) { return cell(fmtUsd(capitalFor(r)) + ' / ' + holdDaysFor(r.age_days) + 'd', capitalFor(r) === best.capital); })),
      line('Farm plan', picked.map(function (r) { return cell((r.farm_steps || []).length + ' steps'); }))
    );

    return el('section', { class: 'compare glass' },
      el('div', { class: 'compare-head' },
        el('div', null,
          el('h3', { text: 'Compare' }),
          el('p', { class: 'compare-note', text: 'Best value in each row is highlighted. Two or three at a time; the third pick drops the oldest.' })
        ),
        el('button', { class: 'close', type: 'button', text: 'Clear', onclick: function () { state.compare = []; skipAnimation = true; render(); } })
      ),
      el('div', { class: 'compare-scroll' },
        el('table', { class: 'compare-table' }, el('thead', null, head), body)
      )
    );
  }

  // The board stores the blended multiple (0.6 x peer + 0.4 x base). Undo the blend to show the
  // market's own mcap/TVL for the category, clamped the way the model clamps it.
  function unblend(multiple, model) {
    var raw = (multiple - (1 - model.peer_weight) * model.base_multiple) / model.peer_weight;
    return Math.min(model.peer_max, Math.max(model.peer_min, raw));
  }

  function categoryStats() {
    var groups = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.keys(groups).map(function (key) {
      var list = groups[key];
      var multiple = medianOf(list.map(function (r) { return r.peer_multiple; }));
      return {
        name: key,
        count: list.length,
        peers: unblend(multiple, DATA.model),
        blended: multiple,
        own: list.some(function (r) { return r.peer_category === key; }),
        implied: medianOf(list.map(function (r) { return r.implied_value_usd; })),
        tvl: list.reduce(function (sum, r) { return sum + r.tvl_usd; }, 0),
        best: list.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; })[0]
      };
    }).sort(function (a, b) {
      // Categories with their own live comparables first: their number is a measurement, the
      // market-wide fallback is one shared value and cannot separate them.
      if (a.own !== b.own) return a.own ? -1 : 1;
      return b.peers - a.peers || b.count - a.count || (a.name < b.name ? -1 : 1);
    });
  }

  function categoryPanel() {
    var stats = categoryStats();
    var maxPeer = stats.reduce(function (m, s) { return Math.max(m, s.peers); }, 0.01);
    var body = el('tbody');
    stats.forEach(function (s) {
      body.appendChild(el('tr', null,
        el('td', null, el('button', {
          type: 'button', class: 'cat-link', text: s.name,
          title: 'Show only ' + s.name + ' in the board',
          onclick: function () {
            state.category = s.name;
            state.shortlistOnly = false;
            state.tab = 'pre-token';
            render();
          }
        })),
        el('td', { class: 'num', text: String(s.count) }),
        el('td', { class: 'num' },
          s.own
            ? el('div', { class: 'peer-cell' },
                el('span', { class: 'peer-val', text: s.peers.toFixed(2) + 'x' }),
                el('span', { class: 'cat-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((s.peers / maxPeer) * 100)) + '%' }))
              )
            : el('div', { class: 'peer-cell' }, el('span', { class: 'peer-val none', text: 'market-wide' })),
          el('div', { class: 'peer-src', text: s.own
            ? (s.peers / DATA.model.base_multiple).toFixed(2) + '\u00d7 base'
            : 'no own comparables' })
        ),
        el('td', { class: 'num', text: fmtUsd(s.implied) }),
        el('td', { class: 'num', text: fmtUsd(s.tvl) }),
        el('td', { class: 'cat-best', text: s.best.name })
      ));
    });

    return el('section', { class: 'cat-panel glass' },
      el('h3', { text: 'Categories' }),
      el('h2', { text: 'Where the market pays the most per dollar of TVL', style: 'margin-top:8px;font-size:28px;letter-spacing:-0.03em;' }),
      el('p', { class: 'model-note', style: 'margin-top:10px;max-width:78ch;', text: 'What live tokens in each category trade at per dollar of TVL - the market number, unblended. The board itself softens it toward ' + DATA.model.base_multiple + ' before scoring (' + DATA.model.peer_weight + ' x peer + ' + (1 - DATA.model.peer_weight).toFixed(1) + ' x base), so a row\u2019s own multiple is closer to the base than this. Categories with fewer than ' + DATA.model.peer_min_samples + ' live comparables have no number of their own: they share the market-wide median, are marked, and are listed after the measured ones. Click a category to filter the board.' }),
      el('div', { class: 'cat-scroll' },
        el('table', { class: 'cat-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Rows' }),
            el('th', { scope: 'col', text: 'Market peer x' }),
            el('th', { scope: 'col', text: 'Median implied' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', class: 'cat-best', text: 'Top row' })
          )),
          body
        )
      )
    );
  }

  function topbar() {
    return el('header', { class: 'topbar glass' },
      el('div', { class: 'brand' },
        el('span', { class: 'signal', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'Token Radar' }),
          el('div', { class: 'brand-sub', text: 'Pre-token protocol intelligence' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill' }, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'pill' }, 'Model ', el('b', { text: DATA.model_version })),
        el('span', { class: 'pill', text: 'DefiLlama index' })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero glass' },
      el('div', { class: 'radar-sweep', 'aria-hidden': 'true' }),
      el('div', null,
        el('div', { class: 'kicker', text: 'Implied value watchlist' }),
        el('h1', { text: 'Find pre-token protocols before the market prices them.' }),
        el('p', { text: 'Every watchlist protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M TVL and no token is ranked here, plus ' + DATA.early_size + ' early protocols below that floor. Implied value is a model estimate from TVL, peer mcap/TVL multiples, 7d growth, and age without a token.' })
      ),
      el('div', { class: 'stats-grid' },
        statCard('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'required floor', DATA.watchlist_size, function (n) { return n + ' / ' + n; }),
        statCard('Rows scored', String(DATA.board_size), 'pre-token protocols', DATA.board_size, null),
        statCard('Early radar', String(DATA.early_size), 'below floor', DATA.early_size, null),
        statCard('Live set aside', String(DATA.live_size), 'already have token', DATA.live_size, null)
      )
    );
  }
  function statCard(label, value, note, countTo, format) {
    var b = el('b', { text: value });
    if (!statsCounted && typeof countTo === 'number') {
      countUp(b, countTo, format || function (n) { return String(n); });
    }
    return el('div', { class: 'stat' },
      el('span', { text: label }),
      b,
      el('small', { text: note })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category, or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });

    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });

    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });

    var short = el('button', {
      type: 'button',
      'aria-pressed': state.shortlistOnly ? 'true' : 'false',
      title: 'Show only the protocols you saved',
      onclick: function () {
        state.shortlistOnly = !state.shortlistOnly;
        if (state.shortlistOnly) state.tab = 'pre-token';
        render();
      }
    }, '\u2605 Shortlist (' + shortlist.length + ')');

    return el('section', { class: 'controls glass' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'status-wrap' }, el('span', { class: 'label', text: 'Your list' }), el('div', { class: 'tabs' }, short)),
      el('div', { class: 'status-wrap' }, el('span', { class: 'label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live))
    );
  }

  function metaLine(list) {
    var shown = state.tab === 'pre-token' ? list.length + ' rows shown' : DATA.live.length + ' live-token protocols';
    var note = state.tab === 'pre-token' ? 'Select a row to inspect model and farm plan' : 'Live tokens are comparables, not ranked pre-token targets';
    if (state.shortlistOnly) note = 'Your shortlist only: ' + shortlist.length + ' saved';
    else if (state.tab === 'pre-token' && state.compare.length >= 2) note = state.compare.length + ' selected to compare';
    return el('div', { class: 'meta-line' },
      el('span', null, el('strong', { text: shown }), ' · ' + note),
      el('span', { text: 'Sorted by ' + state.sort + (state.dir < 0 ? ' ↓' : ' ↑') })
    );
  }

  function sortHeader(key, label, cls) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      } },
        label,
        active ? el('span', { class: 'sort-mark', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'board-panel glass' },
        el('div', { class: 'empty' },
          el('h2', { text: 'No protocol matches that filter' }),
          el('p', { text: 'Try clearing search or choosing another category/chain.' }),
          el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.shortlistOnly = false; writeHash(); render(); } })
        )
      );
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd || 0); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank-cell', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name-cell' },
          el('b', { text: r.name }),
          el('span', { text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num age-col', text: fmtAge(r.age_days) }),
        el('td', { class: 'num peer peer-col', title: 'Market mcap per $1 TVL for comparable live tokens', text: r.peer_multiple.toFixed(2) + 'x' }),
        el('td', null, el('div', { class: 'implied-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'move-col' }, el('div', { class: 'move-cell', title: 'Capital and hold time from this row\u2019s farm plan' },
          el('b', { text: fmtUsd(capitalFor(r)) }),
          el('span', { text: holdDaysFor(r.age_days) + 'd hold' })
        )),
        el('td', { class: 'pick-col' }, pickCell(r))
      );
      if (i < 24 && !reduceMotion && !skipAnimation) {
        tr.className = 'row-in';
        tr.style.animationDelay = (i * 18) + 'ms';
      }
      tbody.appendChild(tr);
    });

    return el('div', { class: 'board-panel glass' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. Implied value is a model estimate, not a market price.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age', 'age-col'),
            sortHeader('peer', 'Peer x', 'peer-col'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', class: 'move-col', text: 'First move' }),
            el('th', { scope: 'col', class: 'pick-col', text: 'Pick' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status-pill live', text: 'live' })),
        el('td', null, el('div', { class: 'name-cell' }, el('b', { text: r.name }), el('span', { text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status-pill live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'board-panel glass' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'live-table' },
          el('caption', { text: 'Live-token protocols are set aside from pre-token ranking. Their market caps are observed, not modeled.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'model-panel glass' },
      el('h3', { text: 'Model' }),
      el('h2', { text: 'How implied value is computed', style: 'margin-top:8px;font-size:28px;letter-spacing:-0.03em;' }),
      el('div', { class: 'model-grid' },
        el('div', { class: 'formula' },
          el('div', null, el('span', { class: 'hl', text: 'peer' }), ' = clamp(median(mcap_usd / tvl_usd of live tokens in category), ', String(m.peer_min), ', ', String(m.peer_max), ')'),
          el('div', null, el('span', { class: 'hl', text: 'multiple' }), ' = ', String(m.peer_weight), ' × peer + ', String(round4(1 - m.peer_weight)), ' × ', String(m.base_multiple)),
          el('div', null, el('span', { class: 'hl', text: 'implied' }), ' = round(tvl × multiple × (1 + clamp(change_7d, ', String(m.growth_floor), ', ', String(m.growth_cap), ') / 100 × ', String(m.growth_weight), ') × (', String(m.maturity_floor), ' + min(age_days, ', String(m.maturity_days), ') / ', String(m.maturity_days), ' × ', String(m.maturity_range), '))')
        ),
        el('p', { class: 'model-note' },
          el('strong', { text: 'Same arithmetic in board and UI. ' }),
          'The dashboard recomputes each row from snapshot inputs and checks the value carried by board.json. Peer multiple comes from live-token mcap/TVL comparables in the same category (fallback: all live tokens). Unknown age uses ', String(m.unknown_age_days), ' days. This is an estimate, not a price or promise.'
        )
      )
    );
  }

  // A rank under the board's own ordering: implied value first, then slug, with this row replaced.
  function rankAmong(implied, slug) {
    var better = 0;
    DATA.rows.forEach(function (r) {
      if (r.slug === slug) return;
      if (r.implied_value_usd > implied || (r.implied_value_usd === implied && r.slug < slug)) better++;
    });
    return better + 1;
  }
  function impliedFrom(tvl, multiple, growthMult, maturityMult) {
    return Math.max(1, Math.round(tvl * multiple * growthMult * maturityMult));
  }
  function signedPct(v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'; }
  function moveText(from, to) {
    if (to === from) return 'rank unchanged';
    var delta = from - to;
    return 'rank ' + (delta > 0 ? 'up ' + delta + ' to #' + to : 'down ' + -delta + ' to #' + to);
  }

  function whySection(row) {
    var m = DATA.model;
    var mult = row.peer_multiple;
    var gm = row.growth_multiplier;
    var mm = row.maturity_multiplier;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var baseValue = row.tvl_usd * m.base_multiple;
    var peerLift = mult / m.base_multiple;

    var parts = [
      { name: 'Peer multiple', lift: peerLift, now: mult.toFixed(2) + 'x' },
      { name: '7d growth', lift: gm, now: fmtPct(row.change_7d) },
      { name: 'Maturity', lift: mm, now: fmtAge(row.age_days) }
    ].sort(function (a, b) { return Math.abs(b.lift - 1) - Math.abs(a.lift - 1); });
    var top = parts[0];

    var moves = [
      { name: 'TVL', now: fmtUsd(row.tvl_usd), effect: 'sets the scale', change: 'TVL 10% higher', implied: impliedFrom(row.tvl_usd * 1.1, mult, gm, mm) },
      { name: 'Peer multiple', now: mult.toFixed(2) + 'x', effect: signedPct(peerLift - 1) + ' vs base', change: 'peer multiple 10% higher', implied: impliedFrom(row.tvl_usd, round4(mult * 1.1), gm, mm) },
      { name: '7d growth', now: fmtPct(row.change_7d), effect: signedPct(gm - 1), change: growth >= m.growth_cap ? 'growth already at the ' + m.growth_cap + ' point cap' : 'growth 10 points higher', implied: impliedFrom(row.tvl_usd, mult, round4(1 + Math.min(m.growth_cap, growth + 10) / 100 * m.growth_weight), mm) },
      { name: 'Maturity', now: fmtAge(row.age_days), effect: signedPct(mm - 1), change: age >= m.maturity_days ? 'age already past the ' + Math.round(m.maturity_days / 365) + ' year maturity cap' : 'age one year older', implied: impliedFrom(row.tvl_usd, mult, gm, round4(m.maturity_floor + Math.min(age + 365, m.maturity_days) / m.maturity_days * m.maturity_range)) }
    ];
    moves.forEach(function (mv) { mv.rank = rankAmong(mv.implied, row.slug); });
    var most = moves.slice().sort(function (a, b) { return Math.abs(b.rank - row.rank) - Math.abs(a.rank - row.rank); })[0];

    var list = el('div', { class: 'why-list' });
    moves.forEach(function (mv) {
      var delta = row.rank - mv.rank;
      list.appendChild(el('div', { class: 'why-row' },
        el('div', { class: 'why-top' },
          el('b', { text: mv.name }),
          el('span', { class: 'why-now', text: mv.now }),
          el('span', { class: 'why-eff', text: mv.effect })
        ),
        el('div', { class: 'why-move' },
          mv.change + ': ' + fmtUsd(mv.implied) + ' implied, ',
          el('span', { class: 'why-rank' + (delta > 0 ? ' up' : delta < 0 ? ' down' : ''), text: moveText(row.rank, mv.rank) })
        )
      ));
    });

    var headline = 'TVL sets the base value at ' + fmtUsd(baseValue) + ' (TVL x ' + m.base_multiple + ' base multiple). ' +
      'The largest single adjustment is ' + top.name + ' at ' + signedPct(top.lift - 1) + '. ' +
      (Math.abs(most.rank - row.rank) === 0
        ? 'None of these one-at-a-time changes moves its rank.'
        : 'Its rank moves most with ' + most.name + ': ' + most.change + ' would put it ' + moveText(row.rank, most.rank).replace('rank ', '') + '.');

    return el('section', { class: 'section' },
      el('h3', { text: 'Why this rank' }),
      el('p', { class: 'detail-copy', text: headline }),
      list,
      el('p', { class: 'equation-note', text: 'Each line changes one factor and scores this row again against the other ' + (DATA.board_size - 1) + ' rows at their board values. A what-if for reading the board, not a change to board.json.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });
  dialog.addEventListener('click', function (e) {
    var rect = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) dialog.close();
  });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();

    var shell = el('div', { class: 'detail-shell glass' });
    shell.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'detail-kicker', text: 'Rank ' + row.rank + ' / ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    var shortButton = el('button', { type: 'button', class: 'btn', 'aria-pressed': isShortlisted(row.slug) ? 'true' : 'false', onclick: function () {
      toggleShortlist(row.slug);
      shortButton.textContent = isShortlisted(row.slug) ? '\u2605 Shortlisted' : '\u2606 Add to shortlist';
      shortButton.setAttribute('aria-pressed', isShortlisted(row.slug) ? 'true' : 'false');
    } }, isShortlisted(row.slug) ? '\u2605 Shortlisted' : '\u2606 Add to shortlist');
    var compareButton = el('button', { type: 'button', class: 'btn', 'aria-pressed': isCompared(row.slug) ? 'true' : 'false', onclick: function () {
      toggleCompare(row.slug);
      compareButton.textContent = isCompared(row.slug) ? 'In comparison' : 'Add to comparison';
      compareButton.setAttribute('aria-pressed', isCompared(row.slug) ? 'true' : 'false');
    } }, isCompared(row.slug) ? 'In comparison' : 'Add to comparison');
    shell.appendChild(el('div', { class: 'detail-actions' }, shortButton, compareButton));

    var recomputed = impliedOf(row, DATA.model);
    var checks = recomputed === row.implied_value_usd ? 'Matches board.json.' : 'Differs from board.json; data may be stale.';
    shell.appendChild(el('section', { class: 'section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'metrics' },
        metric('TVL', fmtUsd(row.tvl_usd)),
        metric('Peer multiple', row.peer_multiple.toFixed(2) + 'x'),
        metric('7d growth', fmtPct(row.change_7d)),
        metric('Age no token', fmtAge(row.age_days)),
        metric('Growth mult', String(row.growth_multiplier)),
        metric('Maturity mult', String(row.maturity_multiplier)),
        metric('Implied value', fmtUsd(row.implied_value_usd), true)
      ),
      el('p', { class: 'equation-note', text: DATA.model_version + ': ' + fmtUsd(row.tvl_usd) + ' × ' + row.peer_multiple.toFixed(2) + ' × ' + row.growth_multiplier + ' × ' + row.maturity_multiplier + ' = ' + fmtUsd(recomputed) + '. ' + checks + ' Estimate, not price.' })
    ));

    shell.appendChild(whySection(row));

    var comps = peerComps(row);
    var compSection = el('section', { class: 'section' },
      el('h3', { text: 'Comparable live tokens' }),
      el('p', { class: 'detail-copy', text: 'Peer multiple uses median mcap/TVL of ' + row.peer_samples + ' live-token protocols' + (row.peer_category ? ' in ' + row.peer_category : ' across snapshot') + ', softened ' + Math.round(DATA.model.peer_weight * 100) + '% toward base ' + DATA.model.base_multiple + '.' })
    );
    if (comps.length) {
      compSection.appendChild(el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { text: 'Live token' }), el('th', { text: 'TVL' }), el('th', { text: 'Mcap' }), el('th', { text: 'Mcap/TVL' }))),
        el('tbody', null, comps.map(function (c) {
          return el('tr', null,
            el('td', { text: c.name }),
            el('td', { class: 'num', text: fmtUsd(c.tvl) }),
            el('td', { class: 'num', text: fmtUsd(c.mcap) }),
            el('td', { class: 'num', text: c.multiple.toFixed(2) + 'x' })
          );
        }))
      ));
    } else {
      compSection.appendChild(el('p', { class: 'detail-copy', text: 'No same-category live comparables; model used all live-token protocols in snapshot.' }));
    }
    shell.appendChild(compSection);

    var steps = row.farm_steps || [];
    var planSection = el('section', { class: 'section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'detail-copy', text: 'These are the steps board.json carries for this row, in order.' })
    );
    if (steps.length === 0) {
      planSection.appendChild(el('p', { class: 'detail-copy', text: 'This row carries no farm steps in the board.' }));
    } else {
      planSection.appendChild(el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })));
    }
    shell.appendChild(planSection);

    dialog.textContent = '';
    dialog.appendChild(shell);
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    else if (!dialog.open) dialog.setAttribute('open', '');
  }

  function metric(label, value, total) {
    return el('div', { class: 'metric' + (total ? ' total' : '') },
      el('span', { text: label }),
      el('b', { text: value })
    );
  }

  function render() {
    var list = filteredRows();
    var shell = el('div', { class: 'shell' });
    shell.appendChild(topbar());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(metaLine(list));
    if (state.tab === 'pre-token') {
      var comparison = comparePanel();
      if (comparison) shell.appendChild(comparison);
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(categoryPanel());
      shell.appendChild(modelPanel());
    }
    app.textContent = '';
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    statsCounted = true;
    skipAnimation = false;
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row) openDetail(row.slug);
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
