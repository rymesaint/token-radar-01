// Token Radar dashboard. Reads window.RADAR (data.js, written by main.ts). No network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var statsCounted = false;

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

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
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
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    var url = window.location.pathname + window.location.search + (next ? '#' + next : '');
    window.history.replaceState(null, '', url);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
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

    return el('section', { class: 'controls glass' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'status-wrap' }, el('span', { class: 'label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live))
    );
  }

  function metaLine(list) {
    var shown = state.tab === 'pre-token' ? list.length + ' rows shown' : DATA.live.length + ' live-token protocols';
    var note = state.tab === 'pre-token' ? 'Select a row to inspect model and farm plan' : 'Live tokens are comparables, not ranked pre-token targets';
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
          el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
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
        el('td', { class: 'status-col' }, el('span', { class: 'status-pill', text: 'no token' }))
      );
      if (i < 24 && !reduceMotion) {
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
            el('th', { scope: 'col', class: 'status-col', text: 'Status' })
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

    var steps = farmSteps(row);
    shell.appendChild(el('section', { class: 'section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));

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
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.textContent = '';
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    statsCounted = true;
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
