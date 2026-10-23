// ---------------------------------------------------------------- Explorer
// The "why" behind the Command Center. Filters (month, product, state, credit score, days past
// due, missed payments, call outcome, porting, renewal window, new product interest) slice one
// governed view (gold.qry_account_month) with the same formulas as the Command Center, so with the
// latest month and no other filter every figure reconciles to it. Layer 1 is a dimension × measure
// slicer (click a bar to drill into it), then promises by call outcome and the 12-month trend of the
// view, then the account records behind the numbers. Every panel can hand its question, scoped to
// the current filters, to LensS. Uses the helpers in home.js.

(function setupExplorer() {
  const FILTERS = [
    ['month', 'Month', 'All 12 months'],
    ['product', 'Product', 'All products'],
    ['state', 'State', 'All states'],
    ['credit', 'Credit score', 'All credit scores'],
    ['bucket', 'Days past due', 'All'],
    ['missed', 'Missed payments (12 months)', 'All'],
    ['outcome', 'Call outcome', 'All call outcomes'],
    ['porting', 'Porting status', 'All'],
    ['renewal', 'Contract renewal window', 'All'],
    ['interest', 'New product interest', 'All'],
  ];
  const DIM_LABEL = Object.fromEntries(FILTERS.map(([k, l]) => [k, l]));
  const SLICE_DIMS = FILTERS.map(([k]) => k).filter(k => k !== 'month');
  const MEASURES = {
    overdue_balance: { label: 'Overdue balance', fmt: v => money(v), rate: false },
    broken_rate: { label: 'Broken-promise rate', fmt: v => pct(v), rate: true, good: false },
    promises: { label: 'Promises to pay', fmt: v => count(v), rate: false },
    broken_amount: { label: 'Amount broken', fmt: v => money(v), rate: false },
    fcr_rate: { label: 'Resolved first time (FCR)', fmt: v => pct(v), rate: true, good: true },
    transfer_rate: { label: 'Transferred', fmt: v => pct(v), rate: true, good: false },
    repeat_rate: { label: 'Called again (repeat)', fmt: v => pct(v), rate: true, good: false },
    avg_handle: { label: 'Average handle time', fmt: v => secs(v), rate: true, good: false },
    contact_rate: { label: 'Contacted', fmt: v => pct(v), rate: true },
    overdue_accounts: { label: 'Overdue accounts', fmt: v => count(v), rate: false },
    accounts: { label: 'Accounts', fmt: v => count(v), rate: false },
    avg_credit: { label: 'Average credit score', fmt: v => count(v), rate: true, good: true },
  };
  const PAGE = 12;

  const state = { filters: {}, dim: 'product', measure: 'broken_rate', view: 'bars', data: null, options: null,
    search: '', sort: 'overdue', page: 0, seq: 0, started: false };
  try {
    const saved = JSON.parse(localStorage.getItem('lenss.optus.explorer') || '{}');
    if (saved && typeof saved === 'object') Object.assign(state, { filters: saved.filters || {}, dim: saved.dim || 'product', measure: saved.measure || 'broken_rate' });
  } catch { /* ignore */ }
  if (!MEASURES[state.measure]) state.measure = 'broken_rate';
  if (!SLICE_DIMS.includes(state.dim)) state.dim = 'product';
  const remember = () => { try { localStorage.setItem('lenss.optus.explorer', JSON.stringify({ filters: state.filters, dim: state.dim, measure: state.measure })); } catch { /* ignore */ } };

  /** "for NBN, NSW, October 2026": the current filters in words, for questions and notes. */
  function scopeText() {
    return FILTERS.filter(([k]) => state.filters[k]).map(([k]) => (k === 'bucket' ? `${state.filters[k]} days past due`
      : k === 'credit' ? `credit score ${state.filters[k]}` : k === 'missed' ? `${state.filters[k]} missed payments`
        : k === 'outcome' ? `call outcome "${state.filters[k]}"` : state.filters[k])).join(', ');
  }
  const scoped = (q) => { const sc = scopeText(); return sc ? `${q.replace(/\?$/, '')} (for ${sc})?` : q; };
  const ask = (q, mode = 'agent') => ({ q: scoped(q), mode });
  const periodText = () => (state.filters.month ? state.filters.month : 'all 12 months');

  /**
   * "View" on any chart item: the accounts behind it, in the same window as the Command
   * Center. `seg` is the item's own filter (e.g. { product: 'NBN' }) or a promise/call stage;
   * the current filters still apply.
   */
  const xpView = (seg, title, label = 'View') =>
    `<button class="view-btn sm" data-xpview="${hEsc(JSON.stringify(seg))}" data-title="${hEsc(title)}">${hEsc(label)}</button>`;
  const STAGE_RULE = {
    overdue: 'overdue', promised: 'a promise to pay was made', broken: 'the promise was broken', kept: 'the promise was kept',
    contacted: 'contacted that month', resolved: 'resolved on the first call', transferred: 'the call was transferred',
    repeat: 'called again', repeat_unresolved: 'called again after an unresolved call the month before',
  };
  document.getElementById('tab-explorer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-xpview]');
    if (!b || !window.showAccountList) return;
    e.stopPropagation();
    const seg = JSON.parse(b.dataset.xpview);
    const merged = { ...state.filters, ...seg };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const words = [
      ...FILTERS.filter(([k]) => merged[k]).map(([k, l]) => `${l}: ${merged[k]}`),
      merged.stage ? `where ${STAGE_RULE[merged.stage] || merged.stage}` : '',
    ].filter(Boolean);
    window.showAccountList({
      url: '/api/explorer/accounts' + (qs ? '?' + qs : ''), title: b.dataset.title,
      rule: (merged.month ? '' : 'All 12 months, one row per account per month. ') + (words.length ? words.join(' · ') : 'Every account'),
      file: 'lenss-optus-explorer-' + (Object.values(seg).join('-').replace(/\W+/g, '-').toLowerCase() || 'accounts'),
    });
  });

  // ---- filters
  function buildSelects() {
    const o = state.options?.dims || {};
    document.getElementById('xpSelects').innerHTML = FILTERS.map(([k, label, all]) => `
      <div class="field"><label for="xpf-${k}">${hEsc(label)}</label>
        <select id="xpf-${k}" data-f="${k}"><option value="">${hEsc(all)}</option>
          ${(o[k] || []).map(v => `<option value="${hEsc(v)}"${state.filters[k] === v ? ' selected' : ''}>${hEsc(k === 'bucket' && v !== 'Current' ? v + ' days' : v)}</option>`).join('')}
        </select></div>`).join('');
  }
  function setFilter(k, v) {
    if (v) state.filters[k] = v; else delete state.filters[k];
    state.page = 0;
    remember();
    buildSelects();
    load();
  }
  document.getElementById('tab-explorer').addEventListener('change', (e) => {
    const el = e.target.closest('[data-f]');
    if (el && el.tagName === 'SELECT') setFilter(el.dataset.f, el.value);
  });
  /** Reset keeps the latest month, so the page reconciles to the Command Center. */
  const resetFilters = () => { state.filters = state.options?.latestMonth ? { month: state.options.latestMonth } : {}; };
  document.getElementById('xpReset').addEventListener('click', () => { resetFilters(); state.page = 0; state.search = ''; remember(); buildSelects(); load(); });
  document.getElementById('xpExport').addEventListener('click', exportCsv);

  function renderChips() {
    const chips = FILTERS.filter(([k]) => state.filters[k]).map(([k, l]) => [k, `${l}: ${state.filters[k]}`]);
    document.getElementById('xpChips').innerHTML = chips.length
      ? chips.map(([k, t]) => `<button class="xp-chip" data-clear="${k}" title="Remove this filter">${hEsc(t)} <span aria-hidden="true">×</span></button>`).join('')
        + `<button class="ask-link" data-ask="${hEsc(scoped('Why do promises break more or less often here than in the rest of the book, and what should we do?'))}" data-mode="agent">${icon('spark', 'ico-xs')}Ask LensS about this view</button>`
      : '<span class="muted">No filters: all 12 months of the whole book. Pick a filter, or click any bar below to drill in.</span>';
    document.querySelectorAll('#xpChips [data-clear]').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.clear, '')));
  }

  // ---- load
  async function load() {
    const my = ++state.seq;
    renderChips();
    document.getElementById('tab-explorer').classList.add('xp-loading');
    const qs = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v)).toString();
    try {
      const r = await fetch('/api/explorer/data' + (qs ? '?' + qs : ''));
      const d = await r.json();
      if (my !== state.seq) return;
      if (!r.ok) throw new Error(d.error || r.statusText);
      state.data = d;
      render();
    } catch (err) {
      if (my !== state.seq) return;
      console.error('Explorer failed to load', err);
      document.getElementById('xpMatch').textContent = 'Could not load. Please try again.';
      if (/Unknown /.test(String(err.message))) { resetFilters(); remember(); buildSelects(); }
    } finally {
      if (my === state.seq) document.getElementById('tab-explorer').classList.remove('xp-loading');
    }
  }

  function render() {
    const d = state.data;
    const t = d.totals || {};
    const b = d.book || {};
    const others = Object.keys(d.applied || {}).some(k => k !== 'month');
    document.getElementById('xpMatch').innerHTML = `${count(t.accounts)} accounts${others ? ` of ${count(b.accounts)}` : ''} · ${hEsc(periodText())}` +
      (num(t.overdue_balance) ? ` · ${money(t.overdue_balance)} overdue${num(t.months) > 1 ? ' a month on average' : ''}` : '');
    const steps = [renderKpis, renderSlicer, renderMoney, renderMix, renderOutcome, renderTrend, renderAccountsTable];
    steps.forEach(fn => { try { fn(d); } catch (err) { console.error('Explorer panel failed', fn.name, err); } });
    loadHeat();
  }

  // ---- filtered headline measures, compared with the whole book in the same period
  function renderKpis(d) {
    const t = d.totals || {};
    const b = d.book || {};
    const others = Object.keys(d.applied || {}).some(k => k !== 'month');
    const delta = (key, good) => {
      if (!others || num(t[key]) === null || num(b[key]) === null) return '';
      const diff = num(t[key]) - num(b[key]);
      // The whole book's figure, not a gap in "pts" (which reads as a percentage).
      const shown = key === 'avg_handle' ? secs(b[key]) : pct(b[key]);
      const better = good ? diff > 0 : diff < 0;
      return `<span class="xk-d ${Math.abs(diff) < 1e-9 ? '' : better ? 'up' : 'down'}">whole book ${shown}</span>`;
    };
    const share = (key) => (others && num(b[key]) ? `<span class="xk-d">${pct(num(t[key]) / num(b[key]), 1)} of the book</span>` : '');
    const several = num(t.months) > 1;
    const tiles = [
      ['Accounts', count(t.accounts), share('accounts')],
      [several ? 'Overdue accounts (monthly avg)' : 'Overdue accounts', count(t.overdue_accounts), share('overdue_accounts')],
      [several ? 'Overdue balance (monthly avg)' : 'Overdue balance', money(t.overdue_balance), share('overdue_balance')],
      ['Promises to pay', count(t.promises), `<span class="xk-d">${money(t.promised_amount)} promised</span>`],
      ['Broken-promise rate', pct(t.broken_rate), delta('broken_rate', false)],
      ['Amount broken', money(t.broken_amount), share('broken_amount')],
      ['Contacted', count(t.contacts), `<span class="xk-d">${pct(t.contact_rate)} of account-months</span>`],
      ['Resolved first time (FCR)', pct(t.fcr_rate), delta('fcr_rate', true)],
      ['Transferred', pct(t.transfer_rate), delta('transfer_rate', false)],
      ['Called again (repeat)', pct(t.repeat_rate), delta('repeat_rate', false)],
      ['Average handle time', secs(t.avg_handle), delta('avg_handle', false)],
      ['Repeat after an unresolved call', count(t.repeat_after_unresolved), ''],
    ];
    document.getElementById('xpKpis').innerHTML = tiles.map(([l, v, sub]) => `<div class="xk"><div class="xk-l">${l}</div><div class="xk-v">${v}</div>${sub || ''}</div>`).join('');
  }

  // ---- Layer 1: dimension × measure slicer
  function renderSlicer(d) {
    const el = document.getElementById('xpSlicer');
    const rows = (d.by[state.dim] || []).slice();
    const m = MEASURES[state.measure];
    const pv = (d.totals || {})[state.measure];
    const ordered = rows.some(r => r.ord !== null && r.ord !== undefined && r.ord !== 'NULL');
    if (!ordered) rows.sort((a, b) => num(b[state.measure]) - num(a[state.measure]));
    const max = Math.max(...rows.map(r => num(r[state.measure]) || 0), m.rate && num(pv) ? num(pv) : 0, 1e-9);
    const drillable = !state.filters[state.dim];
    const label = r => (state.dim === 'bucket' && r.k !== 'Current' ? `${r.k} days` : r.k);
    const toneOf = (v) => {
      if (!m.rate || m.good === undefined || num(pv) === null) return 'brand';
      const better = m.good ? v > num(pv) * 1.05 : v < num(pv) * 0.95;
      const worse = m.good ? v < num(pv) * 0.95 : v > num(pv) * 1.05;
      return better ? 'good' : worse ? 'bad' : 'brand';
    };
    const bars = rows.map(r => {
      const v = num(r[state.measure]) || 0;
      return `<button class="xs-row${drillable ? '' : ' static'}" ${drillable ? `data-drill="${hEsc(r.k)}" title="Filter to ${hEsc(label(r))}"` : ''}>
        <div class="xs-top"><span class="xs-name">${hEsc(label(r))}</span>
          <span class="xs-meta">${count(r.accounts)} accounts · ${count(r.promises)} promises · ${pct(r.broken_rate, 0)} broken · ${pct(r.fcr_rate, 0)} FCR</span>
          <b class="xs-val">${m.fmt(r[state.measure])}</b></div>
        <div class="hbar-track">${m.rate && num(pv) !== null ? `<span class="hbar-marker" style="left:${Math.min(100, (num(pv) / max) * 100).toFixed(1)}%" title="This view: ${m.fmt(pv)}"></span>` : ''}<span class="hbar-fill t-${toneOf(v)}" style="width:${Math.max(0.5, (v / max) * 100).toFixed(1)}%"></span></div>
      </button>`;
    }).join('');
    const table = `<div class="table-scroll flat"><table class="nice"><thead><tr><th>${hEsc(DIM_LABEL[state.dim])}</th><th>Accounts</th><th>Overdue</th><th>Promises</th><th>Broken</th><th>Amount broken</th><th>FCR</th><th>Transferred</th><th>Repeat</th><th>Handle time</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${hEsc(label(r))}</td><td>${count(r.accounts)}</td><td>${money(r.overdue_balance)}</td><td>${count(r.promises)}</td><td>${pct(r.broken_rate)}</td><td>${money(r.broken_amount)}</td><td>${pct(r.fcr_rate)}</td><td>${pct(r.transfer_rate)}</td><td>${pct(r.repeat_rate)}</td><td>${secs(r.avg_handle)}</td><td>${xpView({ [state.dim]: r.k }, `${label(r)}: accounts`)}</td></tr>`).join('')}</tbody></table></div>`;
    const best = rows.length ? rows.reduce((a, r) => (num(r[state.measure]) > num(a[state.measure]) ? r : a)) : null;
    const worst = rows.length ? rows.reduce((a, r) => (num(r[state.measure]) < num(a[state.measure]) ? r : a)) : null;
    el.innerHTML = `<div class="panel-head"><div><div class="xs-kicker">Layer 1 · dimension &amp; measure · ${hEsc(periodText())}</div><h3>Analytical exploration workspace</h3>
        <div class="panel-sub">${best && worst && rows.length > 1 ? `${hEsc(m.label)}: highest <b>${hEsc(label(best))}</b> (${m.fmt(best[state.measure])}), lowest <b>${hEsc(label(worst))}</b> (${m.fmt(worst[state.measure])})${m.rate && num(pv) !== null ? ` · this view ${m.fmt(pv)} (marker)` : ''}.` : ''}</div></div>
      <div class="xs-ctl">
        <label>Dimension <select id="xsDim">${SLICE_DIMS.map(k => `<option value="${k}"${k === state.dim ? ' selected' : ''}>${hEsc(DIM_LABEL[k])}</option>`).join('')}</select></label>
        <label>Measure <select id="xsMeasure">${Object.entries(MEASURES).map(([k, v]) => `<option value="${k}"${k === state.measure ? ' selected' : ''}>${hEsc(v.label)}</option>`).join('')}</select></label>
        <div class="seg-ctl xs-view"><button data-v="bars" class="${state.view === 'bars' ? 'on' : ''}" title="Bars">Bars</button><button data-v="table" class="${state.view === 'table' ? 'on' : ''}" title="Table">Table</button></div>
        ${askBtn(scoped(`Compare ${m.label.toLowerCase()} by ${DIM_LABEL[state.dim].toLowerCase()} and explain what drives the differences`), 'agent')}
      </div></div>
      <div class="panel-body">${rows.length ? (state.view === 'table' ? table : `<div class="xs-list">${bars}</div>`) : '<div class="empty-note">No accounts match these filters.</div>'}
      ${drillable && rows.length > 1 && state.view === 'bars' ? '<div class="panel-note">Click a bar to filter everything on this page to it.</div>' : ''}</div>`;
    el.querySelector('#xsDim').addEventListener('change', e => { state.dim = e.target.value; remember(); renderSlicer(state.data); renderMoney(state.data); renderMix(state.data); });
    el.querySelector('#xsMeasure').addEventListener('change', e => { state.measure = e.target.value; remember(); renderSlicer(state.data); });
    el.querySelectorAll('.xs-view button').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.v; renderSlicer(state.data); }));
    el.querySelectorAll('[data-drill]').forEach(b => b.addEventListener('click', () => setFilter(state.dim, b.dataset.drill)));
  }

  // ---- why: promises by call outcome in this view
  function renderOutcome(d) {
    const rows = d.by.outcome || [];
    const max = Math.max(...rows.map(r => num(r.broken_rate) || 0), 0.01) * 1.08;
    const overall = num((d.totals || {}).broken_rate);
    panel('xpOutcome', 'Promises broken by call outcome', `${hEsc(periodText())}: how that month's call went, against the promise made`,
      ask('Compare promise-kept rates between calls resolved first time and transferred calls', 'chat'),
      rows.map(r => bar(hEsc(r.k), num(r.broken_rate), max, pct(r.broken_rate),
        r.k === 'Resolved first time' ? 'good' : r.k === 'No contact' ? 'brand' : 'bad',
        `${count(r.promises)} promises · ${money(r.broken_amount)} broken ${xpView({ outcome: r.k, stage: 'broken' }, `Broken promises: ${r.k}`)}`,
        overall, `This view ${pct(overall)}`)).join('') || '<div class="empty-note">No promises in this view.</div>');
  }

  // ---- the 12-month trend of this view (every filter but the month)
  function renderTrend(d) {
    const rows = d.trend || [];
    const keys = [['broken_rate', 'Broken', v => pct(v, 0)], ['fcr_rate', 'FCR', v => pct(v, 0)], ['transfer_rate', 'Transferred', v => pct(v, 0)], ['repeat_rate', 'Repeat', v => pct(v, 0)]];
    const body = `<div class="table-scroll flat"><table class="mini"><thead><tr><th>Month</th><th>Overdue</th><th>Promises</th>${keys.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map(r => `<tr${state.filters.month === r.k ? ' class="hl"' : ''}><td>${hEsc(r.k)}</td><td>${money(r.overdue_balance)}</td><td>${count(r.promises)}</td>${keys.map(([k, , f]) => `<td>${f(r[k])}</td>`).join('')}
        <td>${xpView({ month: r.k }, `${r.k}: accounts`)}</td></tr>`).join('')}</tbody></table></div>`;
    panel('xpTrend', '12-month trend of this view', 'Every filter except the month; the selected month is highlighted',
      ask('How have the broken-promise rate and first contact resolution changed month by month', 'chat'),
      '<div class="xp-chart short"><canvas id="xpTrendChart" role="img" aria-label="Broken, FCR, transferred and repeat rates by month"></canvas></div>' + body);
    const colors = ['#DC2626', '#0E8F80', '#D97706', '#7C3AED'];
    chartIn('xpTrendChart', {
      type: 'line',
      data: { labels: rows.map(r => r.k), datasets: keys.map(([k, l], i) => ({ label: l, data: rows.map(r => num(r[k])), borderColor: colors[i], backgroundColor: colors[i], tension: .3, pointRadius: 2 })) },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${pct(c.parsed.y)}` } } },
        scales: { y: { min: 0, ticks: { callback: v => pct(v, 0) } } } },
    });
  }

  // ---- charts (Chart.js, loaded before the app); one instance per canvas, replaced on redraw
  const charts = {};
  function chartIn(id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const cv = document.getElementById(id);
    if (window.Chart && cv) charts[id] = new Chart(cv, cfg);
  }
  const dimLabel = (k) => (state.dim === 'bucket' && k !== 'Current' ? `${k} days` : k);
  const stacked = (fmt, max) => ({
    indexAxis: 'y', maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.x)}` } } },
    scales: { x: { stacked: true, ...(max ? { max } : {}), ticks: { callback: v => fmt(v) } }, y: { stacked: true } },
  });
  /** Rows of the slicer's dimension, in its natural order (or the most promised first). */
  const dimRows = (d) => {
    const rows = (d.by[state.dim] || []).slice();
    if (!rows.some(r => r.ord !== null && r.ord !== undefined && r.ord !== 'NULL')) rows.sort((a, b) => num(b.promised_amount) - num(a.promised_amount));
    return rows;
  };

  // ---- the promised money, kept and broken, by the slicer's dimension
  function renderMoney(d) {
    const rows = dimRows(d);
    const t = d.totals || {};
    panel('xpMoney', `Promised money: kept and broken, by ${DIM_LABEL[state.dim].toLowerCase()}`,
      `${hEsc(periodText())}: ${money(t.promised_amount)} promised, ${money(t.broken_amount)} of it broken (${pct(num(t.broken_amount) / num(t.promised_amount))})`,
      ask(`Where is the most promised money broken, by ${DIM_LABEL[state.dim].toLowerCase()}`, 'chat'),
      rows.length ? '<div class="xp-chart"><canvas id="xpMoneyChart" role="img" aria-label="Promised amount kept and broken"></canvas></div>' : '<div class="empty-note">No promises in this view.</div>');
    chartIn('xpMoneyChart', {
      type: 'bar',
      data: { labels: rows.map(r => dimLabel(r.k)), datasets: [
        { label: 'Kept', data: rows.map(r => (num(r.promised_amount) || 0) - (num(r.broken_amount) || 0)), backgroundColor: '#0E8F80' },
        { label: 'Broken', data: rows.map(r => num(r.broken_amount) || 0), backgroundColor: '#DC2626' },
      ] },
      options: stacked(v => money(v, 0)),
    });
  }

  // ---- how the month's contact went, by the slicer's dimension (shares of account-months, adding up to 100%)
  function renderMix(d) {
    const rows = dimRows(d);
    const part = (r) => {
      const n = num(r.account_months) || 0, c = num(r.contacts) || 0;
      const res = c * (num(r.fcr_rate) || 0), xf = c * (num(r.transfer_rate) || 0);
      return n ? [res / n, xf / n, Math.max(0, c - res - xf) / n, Math.max(0, n - c) / n] : [0, 0, 0, 0];
    };
    const parts = rows.map(part);
    const names = [['Resolved first time', '#0E8F80'], ['Transferred', '#D97706'], ['Left unresolved', '#DC2626'], ['No contact', '#CBD5E1']];
    panel('xpMix', `Call outcomes by ${DIM_LABEL[state.dim].toLowerCase()}`,
      `${hEsc(periodText())}: share of account-months by how that month's contact went (the four add up to 100%)`,
      ask(`Compare first contact resolution and transfers by ${DIM_LABEL[state.dim].toLowerCase()}`, 'chat'),
      rows.length ? '<div class="xp-chart"><canvas id="xpMixChart" role="img" aria-label="Call outcome mix"></canvas></div>' : '<div class="empty-note">No accounts in this view.</div>');
    chartIn('xpMixChart', {
      type: 'bar',
      data: { labels: rows.map(r => dimLabel(r.k)), datasets: names.map(([l, c], i) => ({ label: l, data: parts.map(p => p[i]), backgroundColor: c })) },
      options: stacked(v => pct(v, 0), 1),
    });
  }

  // ---- two dimensions at once: product by arrears stage (or any pair), coloured against this view
  const HEAT_MEASURES = {
    broken_rate: { label: 'Broken-promise rate', good: false, base: 'promises', unit: 'promises' },
    kept_rate: { label: 'Kept-promise rate', good: true, base: 'promises', unit: 'promises' },
    promise_rate: { label: 'Promise rate (promises ÷ account-months)', good: true, base: 'account_months', unit: 'account-months' },
    fcr_rate: { label: 'Resolved first time (FCR)', good: true, base: 'contacts', unit: 'contacts' },
    transfer_rate: { label: 'Transferred', good: false, base: 'contacts', unit: 'contacts' },
    repeat_rate: { label: 'Called again (repeat)', good: false, base: 'contacts', unit: 'contacts' },
    overdue_balance: { label: 'Overdue balance', amount: true },
  };
  const HEAT_DIMS = [...SLICE_DIMS, 'month'];
  const heat = { rows: 'product', cols: 'bucket', measure: 'broken_rate', seq: 0, data: null };
  try {
    const h = JSON.parse(localStorage.getItem('lenss.optus.heat') || '{}');
    if (HEAT_DIMS.includes(h.rows) && HEAT_DIMS.includes(h.cols) && h.rows !== h.cols) Object.assign(heat, { rows: h.rows, cols: h.cols });
    if (HEAT_MEASURES[h.measure]) heat.measure = h.measure;
  } catch { /* ignore */ }
  const rememberHeat = () => { try { localStorage.setItem('lenss.optus.heat', JSON.stringify({ rows: heat.rows, cols: heat.cols, measure: heat.measure })); } catch { /* ignore */ } };

  async function loadHeat() {
    const my = ++heat.seq;
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v)), rows: heat.rows, cols: heat.cols }).toString();
    try {
      const r = await fetch('/api/explorer/grid?' + qs);
      const d = await r.json();
      if (my !== heat.seq) return;
      if (!r.ok) throw new Error(d.error || r.statusText);
      heat.data = d;
      renderHeat();
    } catch (err) {
      if (my !== heat.seq) return;
      console.error('Explorer heatmap failed', err);
      panel('xpHeat', 'Two dimensions at once', 'Could not load. Please try again.', null, '');
    }
  }

  function renderHeat() {
    const cells = heat.data?.cells || [];
    const m = HEAT_MEASURES[heat.measure];
    const overall = num((state.data?.totals || {})[heat.measure]);
    const minP = 30;   // business rule min_segment_promises: fewer promises than this are faded
    const axis = (key, ordKey) => {
      const seen = new Map();
      cells.forEach(c => { if (!seen.has(c[key])) seen.set(c[key], num(c[ordKey])); });
      return [...seen.entries()].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0) || String(a[0]).localeCompare(String(b[0]))).map(([k]) => k);
    };
    const at = new Map(cells.map(c => [`${c.r}|${c.c}`, c]));
    // A row or column with no value for this measure (e.g. "Current" for promises: no promise is
    // made on an account that isn't overdue) is left out rather than shown as a line of dashes.
    const has = (c) => c && num(c[heat.measure]) !== null;
    const C0 = axis('c', 'c_ord'), R0 = axis('r', 'r_ord');
    const R = R0.filter(rk => C0.some(ck => has(at.get(`${rk}|${ck}`))));
    const C = C0.filter(ck => R.some(rk => has(at.get(`${rk}|${ck}`))));
    const label = (dim, k) => (dim === 'bucket' && k !== 'Current' ? `${k} days` : k);
    const maxAmt = Math.max(...cells.map(c => num(c.overdue_balance) || 0), 1);
    const tone = (v) => {
      if (m.amount || overall === null) return 'brand';
      const diff = v - overall;
      if (Math.abs(diff) < 0.05) return 'brand';
      return (m.good ? diff > 0 : diff < 0) ? 'good' : 'bad';
    };
    const stage = m.amount ? 'overdue' : m.base === 'promises' ? (heat.measure === 'kept_rate' ? 'kept' : 'broken') : m.base === 'contacts' ? 'contacted' : 'promised';
    const cellHtml = (rk, ck) => {
      const c = at.get(`${rk}|${ck}`);
      const v = c ? num(c[heat.measure]) : null;
      if (!c || v === null) return '<div class="heat-c empty">—<small>none</small></div>';
      const n = m.amount ? num(c.overdue_accounts) : num(c[m.base]);
      const few = num(c.promises) < minP && (m.base === 'promises' || m.base === 'account_months');
      const shown = m.amount ? money(v) : pct(v, 0);
      const sub = m.amount ? `${count(n)} accounts` : `${count(n)} ${m.unit}`;
      const style = m.amount ? ` style="opacity:${(0.35 + 0.65 * v / maxAmt).toFixed(2)}"` : '';
      const where = `${label(heat.rows, rk)} · ${label(heat.cols, ck)}`;
      return `<button class="heat-c t-${tone(v)}${few ? ' few' : ''}"${style} data-xpview="${hEsc(JSON.stringify({ [heat.rows]: rk, [heat.cols]: ck, stage }))}" data-title="${hEsc(where)}"
        title="${hEsc(`${where}: ${m.label.toLowerCase()} ${shown}, ${sub}${few ? ` (fewer than ${minP} promises: read with care)` : ''}. Click to see the accounts.`)}">${shown}<small>${sub}</small></button>`;
    };
    const opts = (cur, other) => HEAT_DIMS.filter(k => k !== other).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${hEsc(DIM_LABEL[k])}</option>`).join('');
    const legend = m.amount ? '<span class="t-brand">Darker is more overdue</span>'
      : `<span class="t-bad">Worse than this view by 5+ percentage points</span><span class="t-brand">Within 5 points of this view (${pct(overall)})</span><span class="t-good">Better by 5+ points</span>`;
    const body = R.length && C.length
      ? `<div class="table-scroll flat"><div class="heat xp-heat" style="--cols:${C.length};min-width:${130 + C.length * 72}px">
          <div></div>${C.map(ck => `<div class="heat-h">${hEsc(label(heat.cols, ck))}</div>`).join('')}
          ${R.map(rk => `<div class="heat-r">${hEsc(label(heat.rows, rk))}</div>${C.map(ck => cellHtml(rk, ck)).join('')}`).join('')}
        </div></div>
        <div class="heat-legend">${legend}<span class="plain">faded: fewer than ${minP} promises · click a cell to see its accounts</span></div>`
      : '<div class="empty-note">No accounts match these filters.</div>';
    panel('xpHeat', `${m.label} by ${DIM_LABEL[heat.rows].toLowerCase()} and ${DIM_LABEL[heat.cols].toLowerCase()}`,
      `${hEsc(periodText())}${scopeText() ? `, ${hEsc(scopeText())}` : ''}. Each cell is coloured against this view's overall figure.`,
      ask(`Where is the ${m.label.toLowerCase()} worst by ${DIM_LABEL[heat.rows].toLowerCase()} and ${DIM_LABEL[heat.cols].toLowerCase()}, and what should we do about it`, 'agent'),
      `<div class="xs-ctl xh-ctl">
         <label>Rows <select id="xhRows">${opts(heat.rows, heat.cols)}</select></label>
         <label>Columns <select id="xhCols">${opts(heat.cols, heat.rows)}</select></label>
         <label>Measure <select id="xhMeasure">${Object.entries(HEAT_MEASURES).map(([k, v]) => `<option value="${k}"${k === heat.measure ? ' selected' : ''}>${hEsc(v.label)}</option>`).join('')}</select></label>
       </div>` + body);
    const el = document.getElementById('xpHeat');
    el.querySelector('#xhRows').addEventListener('change', e => { heat.rows = e.target.value; rememberHeat(); loadHeat(); });
    el.querySelector('#xhCols').addEventListener('change', e => { heat.cols = e.target.value; rememberHeat(); loadHeat(); });
    el.querySelector('#xhMeasure').addEventListener('change', e => { heat.measure = e.target.value; rememberHeat(); renderHeat(); });
  }

  // ---- Layer 2: account records
  const SORTS = {
    // An account's overdue balance is its balance when it is past due and $0 when current, so this
    // sort is "overdue accounts first, largest balance first"; the next ranks everyone by balance.
    overdue: ['Overdue first, largest balance', r => -num(r.Overdue_Balance) || -num(r.Outstanding_Balance) / 1e6],
    balance: ['Largest balance, all accounts', r => -num(r.Outstanding_Balance)],
    dpd: ['Days overdue', r => -num(r.Days_Past_Due)],
    promise: ['Promised', r => -(num(r.PTP_Amount) || 0)],
    credit: ['Credit score (lowest first)', r => num(r.Credit_Score)],
    handle: ['Handle time', r => -(num(r.Handle_Time_Seconds) || 0)],
  };
  function accountRows() {
    const q = state.search.trim().toLowerCase();
    const rows = (state.data?.accounts || []).filter(r => !q || [r.Account_ID, r.Product_Type, r.State, r.Call_Outcome, r.Porting_Status, r.DPD_Bucket, r.Snapshot_Month]
      .some(v => String(v || '').toLowerCase().includes(q)));
    const key = SORTS[state.sort][1];
    return rows.sort((a, b) => key(a) - key(b));
  }
  function renderAccountsTable(d) {
    const el = document.getElementById('xpAccounts');
    const all = accountRows();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    const rows = all.slice(state.page * PAGE, state.page * PAGE + PAGE);
    const total = num((d.totals || {}).account_months) || 0;
    const prom = r => (num(r.PTP_Flag) ? `${money(r.PTP_Amount)}${r.PTP_Due_Date ? ` <span class="muted">due ${hEsc(r.PTP_Due_Date)}</span>` : ''}${String(r.Broken_PTP_Flag) === '1' ? ' <span class="xp-tag bad">broken</span>' : ' <span class="xp-tag ok">kept</span>'}` : '<span class="muted">none</span>');
    const searchHad = document.activeElement && document.activeElement.id === 'xpSearch';
    el.innerHTML = `<div class="panel-head"><div><div class="xs-kicker">Layer 2 · account records</div><h3>Accounts behind the numbers</h3>
        <div class="panel-sub">${all.length < (d.accounts || []).length ? `${count(all.length)} of ` : ''}the ${count((d.accounts || []).length)} account-months with the most overdue${total > (d.accounts || []).length ? ` (of ${count(total)} in this view)` : ''}</div></div>
      <div class="xs-ctl">
        <input type="search" id="xpSearch" placeholder="Search account, product, state, call outcome" value="${hEsc(state.search)}" aria-label="Search accounts">
        <label>Sort <select id="xpSort">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div></div>
      <div class="panel-body"><div class="table-scroll flat"><table class="nice xp-acc">
        <thead><tr><th>Account</th><th>Month</th><th>State · product</th><th>Credit</th><th>Balance</th><th>Days overdue</th><th>Promise</th><th>Call</th><th>Missed payments</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td class="mono">${hEsc(r.Account_ID)}</td><td>${hEsc(r.Snapshot_Month)}</td>
          <td>${hEsc(r.State)} <span class="muted">· ${hEsc(r.Product_Type)}</span></td>
          <td><span class="xp-tag ${num(r.Credit_Score) < 550 ? 'bad' : num(r.Credit_Score) < 650 ? 'warn' : 'ok'}">${count(r.Credit_Score)}</span></td>
          <td>${money(r.Outstanding_Balance)}</td><td>${count(r.Days_Past_Due)}</td><td>${prom(r)}</td>
          <td>${hEsc(r.Call_Outcome)}${String(r.Repeat_Call_Flag) === '1' ? ' <span class="xp-tag warn">called again</span>' : ''}</td><td>${count(r.Missed_Payments_L12M)}</td>
          <td><button class="ask-link" data-ask="${hEsc(`Tell me about account ${r.Account_ID}: its promises to pay over 12 months, how its calls went, and its balance and days past due.`)}" data-mode="chat">${icon('spark', 'ico-xs')}Ask LensS</button></td></tr>`).join('')
          || '<tr><td colspan="10" class="empty-note">No accounts match.</td></tr>'}</tbody></table></div>
        <div class="xp-pager"><span>Showing ${all.length ? state.page * PAGE + 1 : 0} to ${Math.min(all.length, (state.page + 1) * PAGE)} of ${count(all.length)}</span>
          <span><button class="btn ghost" id="xpPrev" ${state.page ? '' : 'disabled'} aria-label="Previous page">‹</button> Page ${state.page + 1} of ${pages} <button class="btn ghost" id="xpNext" ${state.page < pages - 1 ? '' : 'disabled'} aria-label="Next page">›</button></span></div>
      </div>`;
    const s = el.querySelector('#xpSearch');
    s.addEventListener('input', () => { state.search = s.value; state.page = 0; renderAccountsTable(state.data); });
    if (searchHad) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    el.querySelector('#xpSort').addEventListener('change', e => { state.sort = e.target.value; state.page = 0; renderAccountsTable(state.data); });
    el.querySelector('#xpPrev').addEventListener('click', () => { state.page--; renderAccountsTable(state.data); });
    el.querySelector('#xpNext').addEventListener('click', () => { state.page++; renderAccountsTable(state.data); });
  }

  function exportCsv() {
    const rows = accountRows();
    if (!rows.length) return;
    const cols = ['Account_ID', 'Snapshot_Month', 'State', 'Product_Type', 'Credit_Score', 'Credit_Band', 'Outstanding_Balance', 'Overdue_Balance',
      'Days_Past_Due', 'DPD_Bucket', 'PTP_Flag', 'PTP_Amount', 'PTP_Due_Date', 'Broken_PTP_Flag', 'Call_Outcome', 'Repeat_Call_Flag',
      'Handle_Time_Seconds', 'Missed_Payments_L12M', 'Porting_Status', 'Contract_Renewal_Window_Flag', 'New_Product_Interest_Flag'];
    const cell = v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const sc = scopeText();
    const csv = [`# LensS Collections Explorer for Optus, ${periodText()}${sc ? `, filters: ${sc}` : ''}`, cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `lenss-optus-explorer-accounts${state.filters.month ? '-' + state.filters.month.replace(/\W+/g, '-').toLowerCase() : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- first open
  window.loadExplorer = async function loadExplorer() {
    if (state.started) return;
    state.started = true;
    document.querySelectorAll('#tab-explorer .panel').forEach(p => { if (!p.innerHTML.trim()) p.innerHTML = '<div class="skel skel-h"></div><div class="skel"></div><div class="skel"></div><div class="skel short"></div>'; });
    try {
      const r = await fetch('/api/explorer/options');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      state.options = await r.json();
      for (const k of Object.keys(state.filters)) {
        if (!(state.options.dims[k] || []).includes(state.filters[k])) delete state.filters[k];
      }
      // First visit: the latest month, so the Explorer opens on the same figures as the Command Center.
      let firstVisit = true;
      try { firstVisit = !localStorage.getItem('lenss.optus.explorer'); } catch { /* storage blocked: treat as a first visit */ }
      if (firstVisit && state.options.latestMonth) state.filters.month = state.options.latestMonth;
    } catch (err) {
      console.error('Explorer options failed', err);
      document.getElementById('xpMatch').textContent = 'The Explorer view is not available yet. Run the deploy\'s transform step.';
      state.started = false;
      return;
    }
    buildSelects();
    load();
  };
  /** Open the Explorer filtered to one value (used by the Command Center). */
  window.exploreBy = (k, v) => { state.filters = v ? { [k]: v } : {}; remember(); if (state.started) { buildSelects(); load(); } window.showTab && window.showTab('explorer'); };
})();
