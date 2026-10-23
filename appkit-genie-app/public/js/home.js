// ---------------------------------------------------------------- Command Center
// The one-minute view of Optus collections for a collections leader, told as one story in five
// chapters: where promises to pay stand this month, why they break, how the contact centre is
// doing and what it does to promises, where the money is, and which customers need a different
// conversation (the Scenario_Guide's scenarios).
// The "why" with filters lives in the Explorer (explorer.js). Every figure comes from the certified
// views (no AI) and opens the accounts behind it. Each panel has an "Ask LensS" link that opens
// the assistant with the right question.

const hEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CUR = '$';
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

/** $1.01M, $232K, $940. Amounts are in Australian dollars (AUD). */
function money(v, digits = 1) {
  const n = num(v);
  if (n === null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return CUR + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return CUR + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return CUR + (n / 1e3).toFixed(a >= 1e5 ? 0 : digits) + 'K';
  return CUR + Math.round(n).toLocaleString('en-AU');
}
const pct = (v, d = 1) => (num(v) === null ? '—' : (num(v) * 100).toFixed(d) + '%');
const count = v => (num(v) === null ? '—' : Math.round(num(v)).toLocaleString('en-AU'));
/** Seconds of handle time: "530s". */
const secs = v => (num(v) === null ? '—' : `${Math.round(num(v))}s`);
/** A difference between two shares, in points: "+17.2 pts". */
const pts = (v, d = 1) => (num(v) === null ? '—' : `${num(v) >= 0 ? '+' : '−'}${Math.abs(num(v) * 100).toFixed(d)} pts`);
/** "1 October 2026" and "October 2026" from "2026-10-01". */
const asOfDate = d => { const x = d ? new Date(String(d).slice(0, 10) + 'T00:00:00') : null; return x && !isNaN(x) ? x.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; };
const monthLabel = d => { const x = d ? new Date(String(d).slice(0, 10) + 'T00:00:00') : null; return x && !isNaN(x) ? x.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : 'the latest month'; };

const ICONS = {
  cash: '<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  gap: '<path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  handshake: '<path d="M8 12l3 3 6-6"/><circle cx="12" cy="12" r="9"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.8"/>',
  promise: '<path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="5" y="11" width="14" height="10" rx="2"/>',
  spark: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>',
};
const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const askBtn = (q, mode = 'agent', label = 'Ask LensS') =>
  `<button class="ask-link" data-ask="${hEsc(q)}" data-mode="${mode}" title="${hEsc(q)}">${icon('spark', 'ico-xs')}${label}</button>`;

/** A panel: title, a one-line "so what", its Ask LensS question, and a body. */
function panel(id, title, sub, ask, body) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="panel-head"><div><h3>${hEsc(title)}</h3>${sub ? `<div class="panel-sub">${sub}</div>` : ''}</div>${ask ? askBtn(ask.q, ask.mode) : ''}</div><div class="panel-body">${body}</div>`;
}

/** A labelled horizontal bar; `scale` is the value that fills the track; `marker` draws a reference line. */
function bar(label, value, scale, shown, t = 'brand', sub = '', marker = null, markerTitle = 'Overall', cls = '') {
  const w = Math.max(0, Math.min(100, (num(value) / scale) * 100));
  return `<div class="hbar${cls ? ' ' + cls : ''}"><div class="hbar-top"><span class="hbar-label">${label}</span><span class="hbar-val">${shown}</span></div>
    <div class="hbar-track">${marker !== null ? `<span class="hbar-marker" style="left:${Math.min(100, (marker / scale) * 100)}%" title="${hEsc(markerTitle)}"></span>` : ''}<span class="hbar-fill t-${t}" style="width:${w.toFixed(1)}%"></span></div>
    ${sub ? `<div class="hbar-sub">${sub}</div>` : ''}</div>`;
}

function skeletons() {
  document.querySelectorAll('#tab-home .panel').forEach(p => { if (!p.innerHTML.trim()) p.innerHTML = '<div class="skel skel-h"></div><div class="skel"></div><div class="skel"></div><div class="skel short"></div>'; });
  const k = document.getElementById('execKpis');
  if (!k.innerHTML.trim()) k.innerHTML = Array.from({ length: 4 }, () => '<div class="xkpi skel-card"><div class="skel"></div><div class="skel skel-h"></div></div>').join('');
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  return window.userFirstName ? `${part}, ${window.userFirstName}` : part;
}
document.addEventListener('lenss:user', () => { const g = document.getElementById('heroGreeting'); if (g) g.textContent = greeting(); });

// ---------------------------------------------------------------- KPI dictionary
// One place that says what every figure means and how it is calculated (the "KPI Dict").
const KPI_DICT = [
  ['Latest month', 'The month the headline describes.', 'The latest monthly snapshot (1 October 2026). The data has 12 monthly snapshots, November 2025 to October 2026; "12 months" means all of them.'],
  ['Overdue accounts / balance', 'The book in arrears.', 'Accounts more than 0 days past due on the snapshot date, and their outstanding balance (AUD). Current accounts also carry a billed balance, which is not counted as overdue.'],
  ['Promises to pay (PTP)', 'Cash customers committed to.', 'Accounts that made a promise to pay in the month, and the amount promised.'],
  ['Broken-promise rate', 'The early-warning signal.', 'Broken promises ÷ promises made. Every promise has a recorded outcome, including the latest month\'s, which fall due after the snapshot date.'],
  ['Kept-promise rate', 'The inverse of the broken rate.', 'Kept promises ÷ promises made.'],
  ['Resolved first time (FCR)', 'Contact-centre effectiveness.', 'Contacted accounts whose issue was resolved on the first call ÷ contacted accounts. A transferred call is never FCR. Contact is recorded once per account per month.'],
  ['Transferred', 'Calls that needed a second agent.', 'Contacted accounts whose call was transferred ÷ contacted accounts.'],
  ['Called again (repeat)', 'Customers who had to come back.', 'Contacted accounts that called again within about 7 to 14 days (Optus\'s repeat-call flag) ÷ contacted accounts.'],
  ['Repeat after an unresolved call', 'Scenario 6, Repeat Caller Frustration.', 'Accounts that called again this month after a call last month that was not resolved first time.'],
  ['Average handle time', 'Effort per call.', 'Average handle time in seconds of contacted accounts. No cost per minute has been supplied, so no dollar cost is shown.'],
  ['Why promises break', 'Where to act.', 'The broken-promise rate of each segment over 12 months of promises. A factor makes a clear difference when its segments (30+ promises each) are at least 10 points apart (business rule driver_spread_pts); otherwise little difference. Observed, not causal.'],
  ['Credit band / days-past-due bucket', 'The bands used everywhere.', 'Credit score below 550, 550–649, 650–749, 750+. Days past due 1–30, 31–60, 61–90, 91+. Both come from the business rules.'],
  ['Scenarios 1–6', 'Optus\'s Scenario_Guide.', '1 Upgrade-but-Overdue: new product interest and more than 30 days past due. 2 High-Risk Porting Out: porting out with a credit score below 550. 3 Churn Risk at Renewal: 2+ missed payments in the renewal window. 4 FCR against kept promises. 5 Transfers and handle time. 6 Repeat calls after an unresolved call. Counts are at the latest snapshot.'],
];
function openKpiDict() {
  document.getElementById('kpiDictBody').innerHTML = `<p class="score-reason">Optus collections, 12 monthly snapshots (November 2025 to October 2026), amounts in Australian dollars. Every figure comes from certified views; no AI computes them.</p>
    <table class="mini kpi-table"><thead><tr><th>Metric</th><th>Why it matters</th><th>How it is calculated</th></tr></thead><tbody>
    ${KPI_DICT.map(([m, w, c]) => `<tr><td><b>${hEsc(m)}</b></td><td>${hEsc(w)}</td><td>${hEsc(c)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('kpiDict').showModal();
}
['kpiDictBtn', 'kpiDictBtn2'].forEach(id => document.getElementById(id)?.addEventListener('click', openKpiDict));
document.getElementById('kpiDictClose').addEventListener('click', () => document.getElementById('kpiDict').close());
document.getElementById('kpiDict').addEventListener('click', (e) => { if (e.target.id === 'kpiDict') e.target.close(); });
const setTake = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

/** Lets the browser paint before the next panel is built (a hidden tab doesn't paint, so it doesn't wait). */
const nextFrame = () => new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));

/** A threshold from gold.business_rules_config (sent with the summary), with the documented default until it arrives. */
const ruleVal = (s, name, fallback) => { const v = num(((s || {}).rules || {})[name]); return v === null ? fallback : v; };

/**
 * One story, top to bottom, each chapter answering one question and leading to the next:
 *   1. Where do promises stand? (hero)  2. Why do they break?  3. How is the contact centre doing?
 *   4. Where is the money?  5. Which customers need a different conversation?
 * Both requests start at once; the hero is drawn from the (small) summary first, then the
 * chapters follow in page order, one per frame.
 */
async function loadHome() {
  skeletons();
  const summaryReq = fetch('/api/dashboard/summary').then(r => r.json());
  const overviewReq = fetch('/api/dashboard/overview').then(r => r.json()).catch(() => ({}));
  // One panel's problem never blanks the page.
  const run = fn => { try { fn(); } catch (err) { console.error('Command Center panel failed', err); } };
  const summary = await summaryReq;
  run(() => renderHero(summary));
  const o = (await overviewReq) || {};
  const steps = [
    () => renderExecSummary(summary, o), () => renderDrivers(summary, o), () => renderContact(summary, o),
    () => renderMoney(summary, o), () => renderScenarios(summary, o), () => renderTopBroken(summary, o),
  ];
  for (const fn of steps) { run(fn); await nextFrame(); }
  // Then the other tabs load in the background while the browser is idle, so they open
  // instantly. The Command Center always comes first; the Assistant loads its own when idle.
  (window.requestIdleCallback || (f => setTimeout(f, 1000)))(() => {
    if (window.loadExplorer) window.loadExplorer();
    if (window.loadMonitoring) window.loadMonitoring({ maxAgeMs: 60_000 });
    // Observability's own areas too, so every pane is ready when opened (each refreshes again on open).
    if (window.loadEvals) window.loadEvals();
    if (window.loadResponsibleAi) window.loadResponsibleAi();
    if (window.loadCost) window.loadCost();
  }, { timeout: 3000 });
}

/** "close to", "above" or "below" a reference rate, within half a point. */
const versus = (v, ref) => { const d = num(v) - num(ref); return Math.abs(d) < 0.005 ? 'close to' : d > 0 ? 'above' : 'below'; };

/** The broken rate of one call outcome over 12 months (qry_fcr_vs_promises). */
const outcomeRow = (o, name) => (o.callOutcomes || []).find(r => r.Call_Outcome === name) || {};

/** 1. Where do promises stand this month? */
function renderHero(s) {
  document.getElementById('heroGreeting').textContent = greeting();
  const month = monthLabel(s.as_of);
  document.getElementById('heroSub').innerHTML = num(s.Promises) === null
    ? 'Some figures could not be loaded. Please refresh the page.'
    : `In ${hEsc(month)}, customers made <b>${count(s.Promises)}</b> promises to pay worth <b>${money(s.Promised_Amount)}</b>. ` +
      `<b>${count(s.Broken_Promises)}</b> were broken (<b>${pct(s.Broken_Rate)}</b>, ${money(s.Broken_Amount)}), ` +
      `${versus(s.Broken_Rate, s.Broken_Rate_12M)} the 12-month rate of ${pct(s.Broken_Rate_12M)}.`;
  const kept = num(s.Kept_Promises), broken = num(s.Broken_Promises), total = (kept || 0) + (broken || 0);
  document.getElementById('heroProgress').innerHTML = total ? `
    <div class="hp-track"><div class="hp-fill" style="width:${(100 * kept / total).toFixed(1)}%"></div></div>
    <div class="hp-legend"><span><b>${count(kept)}</b> kept (${money(s.Kept_Amount)}) · <b>${count(broken)}</b> broken (${money(s.Broken_Amount)})</span><span>${pct(kept / total, 0)} kept</span></div>` : '';
  const prior = num(s.Prior_Overdue_Balance);
  const change = prior ? (num(s.Overdue_Balance) - prior) / prior : null;
  document.getElementById('heroStats').innerHTML = [
    ['Overdue balance', money(s.Overdue_Balance), `${count(s.Overdue_Accounts)} accounts${change !== null ? ` · ${change >= 0 ? 'up' : 'down'} ${pct(Math.abs(change))} on last month` : ''}`, 'cash',
      viewBtn('overdue', 'View accounts', '', `Overdue accounts, ${month}`, true)],
    ['Promises broken', pct(s.Broken_Rate), `${count(s.Broken_Promises)} of ${count(s.Promises)} · last month ${pct(s.Prior_Broken_Rate)}`, 'promise',
      viewBtn('broken', 'View broken', '', `Broken promises, ${month}`, true)],
    ['Resolved first time (FCR)', pct(s.FCR_Rate), `of ${count(s.Contacts)} contacted · 12 months ${pct(s.FCR_Rate_12M)}`, 'check',
      viewBtn('unresolved', 'View unresolved', '', `Contacted but not resolved first time, ${month}`, true)],
    ['Called again after an unresolved call', count(s.Repeat_After_Unresolved), `this month · ${count(s.Repeat_After_Unresolved_12M)} over 12 months`, 'repeat',
      viewBtn('repeat_unresolved', 'View accounts', '', `Called again after an unresolved call, ${month}`, true)],
  ].map(([l, v, sub, ic, view]) => `<div class="hs"><div class="hs-ico">${icon(ic)}</div><div><div class="hs-l">${l}</div><div class="hs-v">${v}</div><div class="hs-s">${sub}</div>${view}</div></div>`).join('');
  // Timestamps come from the warehouse in UTC; shown in the viewer's local time.
  const when = (v) => { const d = v ? new Date(v.replace(' ', 'T') + 'Z') : null; return d && !isNaN(d) ? d.toLocaleString('en-AU') : v; };
  const after = num(s.Promises_Due_After_As_Of);
  document.getElementById('heroNote').innerHTML =
    (after ? `<div>All ${count(after)} of this month's promises fall due after ${hEsc(asOfDate(s.as_of))}. Their outcome is as recorded in the data, like every other month.</div>` : '') +
    (s.data_refreshed_at ? `<div class="hero-refresh">Data refreshed on ${when(s.data_refreshed_at)}</div>` : '');
}

/**
 * Executive summary: the five chapters in five plain lines, plus a bottom line. Written from the
 * same certified figures as the chapters, so it can't drift from them. Each line jumps to its chapter.
 */
function renderExecSummary(s, o) {
  if (!(o.drivers || []).length) return;   // the overview hasn't arrived yet: the skeleton stays
  const month = monthLabel(s.as_of);
  const fcr = outcomeRow(o, 'Resolved first time'), xfer = outcomeRow(o, 'Transferred');
  const strong = strongFactors(o.drivers);
  const top = strong[0];
  const exposure = o.exposure || [];
  const biggest = exposure.slice().sort((a, b) => num(b.Overdue_Balance) - num(a.Overdue_Balance))[0];
  const scen = o.scenarios || [];
  const sc = id => scen.find(r => String(r.Scenario_ID) === String(id)) || {};
  const largest = scen.slice().sort((a, b) => num(b.Accounts) - num(a.Accounts))[0];
  const spread = ruleVal(s, 'driver_spread_pts', 0.10);
  const gap = num(xfer.Broken_Rate) - num(fcr.Broken_Rate);
  document.getElementById('execSumBottom').innerHTML = `<span class="es-bl">Bottom line</span>` + hEsc(gap >= spread
    ? `Resolve the call first time and the promise is more likely to hold: ${pct(fcr.Broken_Rate)} of promises broke after a first-time resolution, ${pct(xfer.Broken_Rate)} after a transfer.`
    : `Promises break at ${pct(s.Broken_Rate_12M)} over the year; chapter 2 shows where.`);
  const rows = [
    ['ch1', 'Promises this month', `${count(s.Promises)} promises worth ${money(s.Promised_Amount)} in ${month}; ${count(s.Broken_Promises)} broken (${money(s.Broken_Amount)}), against ${pct(s.Broken_Rate_12M)} over 12 months.`,
      pct(s.Broken_Rate), 'broken', 'bad'],
    ['ch2', 'Why they break', top ? `${strong.map(f => f.factor.toLowerCase()).join(', ')} make a clear difference; the widest gap is ${top.factor.toLowerCase()}: ${pct(top.hi.Broken_Rate)} broken for ${top.hi.Segment.toLowerCase()} against ${pct(top.lo.Broken_Rate)} for ${top.lo.Segment.toLowerCase()}.` : 'No factor makes a clear difference.',
      top ? pts(top.spread, 0) : '—', top ? `${top.factor.toLowerCase()} gap` : '', 'warn'],
    ['ch3', 'Contact centre', `${pct(s.FCR_Rate)} resolved first time, ${pct(s.Transfer_Rate)} transferred and ${pct(s.Repeat_Rate)} called again in ${month}; a transferred call averages ${secs(xfer.Avg_Handle_Seconds)} against ${secs(fcr.Avg_Handle_Seconds)} when resolved first time.`,
      pct(s.FCR_Rate), 'resolved first time', 'brand'],
    ['ch4', 'Where the money is', `${money(s.Overdue_Balance)} overdue across ${count(s.Overdue_Accounts)} accounts${biggest ? `; the most, ${money(biggest.Overdue_Balance)} (${pct(biggest.Balance_Share, 0)}), is ${hEsc(biggest.DPD_Bucket)} days past due` : ''}.`,
      money(s.Overdue_Balance), 'overdue', 'brand'],
    ['ch5', 'Scenarios', `${count(sc(1).Accounts)} upgrade-but-overdue, ${count(sc(2).Accounts)} porting out with a low credit score, ${count(sc(3).Accounts)} chronic late payers at renewal and ${count(sc(6).Accounts)} repeat callers after an unresolved call.`,
      count(largest && largest.Accounts), largest ? largest.Scenario_Name.toLowerCase() : '', 'good'],
  ];
  document.getElementById('execSumList').innerHTML = rows.map(([id, label, line, fig, figLabel, tone], i) => `
    <li><a class="es-row" href="#${id}">
      <span class="es-n">${i + 1}</span>
      <span class="es-text"><span class="es-label">${hEsc(label)}</span><span class="es-line">${hEsc(line)}</span></span>
      <span class="es-fig es-${tone}"><b>${fig}</b><small>${hEsc(figLabel)}</small></span>
    </a></li>`).join('');
}

/** Factors grouped from qry_ptp_break_drivers: segments, spread, strength, highest and lowest segment. */
function factorsOf(drivers) {
  const m = new Map();
  for (const r of drivers || []) {
    if (!m.has(r.Factor)) m.set(r.Factor, { factor: r.Factor, order: num(r.Factor_Order), rows: [], spread: num(r.Factor_Spread_Pts), strength: r.Factor_Strength });
    m.get(r.Factor).rows.push(r);
  }
  return [...m.values()].map(f => {
    const ok = f.rows.filter(r => String(r.Meets_Min_Volume) === '1');
    const sorted = ok.slice().sort((a, b) => num(b.Broken_Rate) - num(a.Broken_Rate));
    return { ...f, hi: sorted[0], lo: sorted[sorted.length - 1] };
  });
}
const strongFactors = drivers => factorsOf(drivers).filter(f => f.strength === 'Clear difference' && f.hi && f.lo).sort((a, b) => b.spread - a.spread);

/** 2. Why do promises break? Every factor's broken rate by segment; clear differences first, flat ones together. */
function renderDrivers(s, o) {
  const all = factorsOf(o.drivers);
  if (!all.length) return;
  const strong = strongFactors(o.drivers);
  const flat = all.filter(f => !strong.includes(f)).sort((a, b) => a.order - b.order);
  const overall = num((o.drivers[0] || {}).Overall_Broken_Rate);
  const minP = ruleVal(s, 'min_segment_promises', 30);
  setTake('ch2Take', `Over 12 months, customers made <b>${count(s.Promises_12M)}</b> promises and <b>${pct(s.Broken_Rate_12M)}</b> were broken (${money(s.Broken_Amount_12M)}). ` +
    (strong.length ? `<b>${hEsc(strong.map(f => f.factor.toLowerCase()).join(', '))}</b> make a clear difference` : 'No factor makes a clear difference') +
    (flat.length ? `; ${hEsc(flat.map(f => f.factor.toLowerCase()).join(', '))} make little difference.` : '.') +
    ` These are observed differences, not proven causes.`);
  document.getElementById('drivers').innerHTML = strong.map(f => {
    const max = Math.max(...f.rows.map(r => num(r.Broken_Rate) || 0), overall || 0) * 1.08;
    const rows = f.rows.slice().sort((a, b) => (num(a.Segment_Order) - num(b.Segment_Order)) || String(a.Segment).localeCompare(String(b.Segment)));
    const body = rows.map(r => {
      const few = String(r.Meets_Min_Volume) !== '1';
      const d = num(r.Difference_vs_Overall);
      return bar(hEsc(r.Segment), num(r.Broken_Rate), max, pct(r.Broken_Rate), few ? 'brand' : d > 0.03 ? 'bad' : d < -0.03 ? 'good' : 'brand',
        `${count(r.Promises)} promises · ${money(r.Broken_Amount)} broken${few ? ` · fewer than ${count(minP)} promises, not ranked` : ''} ` +
        viewBtn('segment_broken', 'View broken', `${f.factor}|${r.Segment}`, `Broken promises: ${f.factor.toLowerCase()} ${r.Segment}, 12 months`, true),
        overall, `Overall ${pct(overall)}`, few ? 'muted-row' : '');
    }).join('');
    return `<div class="card panel driver-card"><div class="panel-head"><div><h3>${hEsc(f.factor)}</h3>
        <div class="panel-sub"><span class="strength clear">Clear difference · ${pts(f.spread, 0).replace('+', '')}</span> ${pct(f.hi.Broken_Rate)} broken for <b>${hEsc(f.hi.Segment)}</b>, ${pct(f.lo.Broken_Rate)} for <b>${hEsc(f.lo.Segment)}</b></div></div>
        ${askBtn(`Why do promises to pay break more often for some ${f.factor.toLowerCase()} segments, and what should we do about it?`, 'agent')}</div>
      <div class="panel-body">${body}<div class="panel-note">The line marks the overall broken rate (${pct(overall)}), 12 months of promises.</div></div></div>`;
  }).join('');
  panel('pnlFlat', 'Factors that make little difference', `Their segments' broken rates are within ${pts(ruleVal(s, 'driver_spread_pts', 0.10), 0).replace('+', '')} of each other: knowing them doesn't tell you which promises will break.`,
    { q: 'Do product, state, porting status, contract renewal or new product interest affect whether promises to pay are broken?', mode: 'chat' },
    `<div class="flat-list">${flat.map(f => `<div class="flat-item"><b>${hEsc(f.factor)}</b><span>${f.lo ? `${pct(f.lo.Broken_Rate)} to ${pct(f.hi.Broken_Rate)} broken across ${count(f.rows.length)} segments` : 'Too few promises to compare'}</span>
      <div class="card-btns">${f.hi ? viewBtn('segment_broken', `View ${f.hi.Segment}`, `${f.factor}|${f.hi.Segment}`, `Broken promises: ${f.factor.toLowerCase()} ${f.hi.Segment}, 12 months`, true) : ''}</div></div>`).join('') || '<div class="empty-note">Every factor makes a clear difference.</div>'}</div>`);
}

/** 3. How is the contact centre doing, and what does it do to promises? (Scenarios 4, 5 and 6.) */
function renderContact(s, o) {
  const month = monthLabel(s.as_of);
  const fcr = outcomeRow(o, 'Resolved first time'), xfer = outcomeRow(o, 'Transferred'), unres = outcomeRow(o, 'Not resolved, not transferred');
  setTake('ch3Take', `In ${hEsc(month)}, <b>${pct(s.FCR_Rate)}</b> of the ${count(s.Contacts)} contacted customers were resolved first time (${pct(s.FCR_Rate_12M)} over 12 months), ` +
    `<b>${pct(s.Transfer_Rate)}</b> were transferred and <b>${pct(s.Repeat_Rate)}</b> called again. ` +
    (num(fcr.Broken_Rate) !== null ? `How the call goes shows up in promises: <b>${pct(xfer.Broken_Rate)}</b> of promises made after a transfer broke, and ${pct(unres.Broken_Rate)} after an unresolved call, against <b>${pct(fcr.Broken_Rate)}</b> after a first-time resolution.` : ''));
  const card = (ic, label, value, sub, why, t, view = '') => `
    <div class="xkpi${t ? ' x-' + t : ''}" title="${hEsc(why)}">
      <div class="xkpi-top">${icon(ic, 'ico-sm')}<span>${label}</span></div>
      <div class="xkpi-v">${value}</div>
      <div class="xkpi-s">${sub}</div>
      <div class="xkpi-why">${hEsc(why)}</div>${view}
    </div>`;
  document.getElementById('execKpis').innerHTML = [
    card('check', 'Resolved first time (FCR)', pct(s.FCR_Rate), `last month ${pct(s.Prior_FCR_Rate)} · 12 months ${pct(s.FCR_Rate_12M)}`, 'Contacted customers resolved on the first call', null,
      viewBtn('unresolved', 'View unresolved', '', `Contacted but not resolved first time, ${month}`, true)),
    card('transfer', 'Transferred', pct(s.Transfer_Rate), `last month ${pct(s.Prior_Transfer_Rate)} · 12 months ${pct(s.Transfer_Rate_12M)}`, 'Contacted customers whose call was transferred', 'warn',
      viewBtn('transferred', 'View accounts', '', `Transferred calls, ${month}`, true)),
    card('repeat', 'Called again (repeat)', pct(s.Repeat_Rate), `last month ${pct(s.Prior_Repeat_Rate)} · 12 months ${pct(s.Repeat_Rate_12M)}`, 'Called again within about 7 to 14 days', 'warn',
      viewBtn('repeat', 'View accounts', '', `Called again, ${month}`, true)),
    card('clock', 'Average handle time', secs(s.Avg_Handle_Seconds), `last month ${secs(s.Prior_Avg_Handle_Seconds)} · 12 months ${secs(s.Avg_Handle_Seconds_12M)}`, 'Average handle time of contacted customers, in seconds', null,
      viewBtn('contacted', 'View accounts', '', `Contacted customers, ${month}`, true)),
  ].join('');

  // Scenario 4: the call outcome against promises.
  const outcomes = o.callOutcomes || [];
  const maxB = Math.max(...outcomes.map(r => num(r.Broken_Rate) || 0), 0.01) * 1.08;
  const overall = num((o.drivers || [])[0]?.Overall_Broken_Rate);
  panel('pnlFcr', 'Scenario 4 · Resolved first time, kept more often', 'Promises broken by how that month\'s call went, 12 months',
    { q: 'Compare promise-kept rates between calls resolved first time and transferred calls, and what that means for the contact centre.', mode: 'agent' },
    outcomes.map(r => bar(hEsc(r.Call_Outcome), num(r.Broken_Rate), maxB, pct(r.Broken_Rate),
      r.Call_Outcome === 'Resolved first time' ? 'good' : r.Call_Outcome === 'No contact' ? 'brand' : 'bad',
      `${count(r.Promises)} promises · promised in ${pct(r.Promise_Rate, 0)} of these months ` +
      viewBtn('segment_broken', 'View broken', `Call outcome|${r.Call_Outcome}`, `Broken promises after: ${r.Call_Outcome.toLowerCase()}, 12 months`, true),
      overall, `Overall ${pct(overall)}`)).join('') +
    `<div class="panel-note">"No contact" means no call was recorded that month; the data doesn't say how those promises were made. Observed, not a controlled experiment.</div>`);

  // Scenario 5: transfers and handle time.
  const nonXfer = outcomes.filter(r => r.Call_Outcome === 'Resolved first time' || r.Call_Outcome === 'Not resolved, not transferred');
  const w = nonXfer.reduce((a, r) => a + num(r.Account_Months), 0);
  const ahtOther = w ? nonXfer.reduce((a, r) => a + num(r.Avg_Handle_Seconds) * num(r.Account_Months), 0) / w : null;
  const states = o.transferByState || [];
  const xferHours = states.reduce((a, r) => a + num(r.Transferred_Handle_Hours), 0);
  const cost = states.reduce((a, r) => a + (num(r.Transferred_Handle_Cost) || 0), 0);
  const hasCost = states.some(r => num(r.Transferred_Handle_Cost) !== null);
  const maxT = Math.max(...states.map(r => num(r.Transfer_Rate) || 0), 0.01) * 1.08;
  panel('pnlTransfer', 'Scenario 5 · Transfers take longer', `A transferred call averages <b>${secs(xfer.Avg_Handle_Seconds)}</b> against ${secs(ahtOther)} for the rest: <b>${count(xferHours)}</b> hours of handle time on transferred calls over 12 months${hasCost ? ` (${money(cost)})` : ''}.`,
    { q: 'Which states and products have the most transfers and the longest handle times?', mode: 'chat' },
    states.map(r => bar(hEsc(r.State), num(r.Transfer_Rate), maxT, pct(r.Transfer_Rate), 'warn',
      `${count(r.Transfers)} of ${count(r.Contacts)} calls · ${count(r.Transferred_Handle_Hours)} hours ` +
      viewBtn('transferred_state', 'View', r.State, `Transferred calls in ${r.State}, 12 months`, true))).join('') +
    `<div class="panel-note">${hasCost ? 'Cost uses the handle_cost_per_minute business rule.' : 'Shown in hours: no cost per minute of handle time has been supplied, so no dollar cost is shown.'} Transfer rates differ little by state.</div>`);

  // Scenario 6: repeat calls by last month's outcome.
  const rep = o.repeat || [];
  const maxR = Math.max(...rep.map(r => num(r.Repeat_Rate) || 0), 0.01) * 1.08;
  const bad = rep.find(r => r.Prior_Month_Outcome === 'Not resolved last month') || {};
  const good = rep.find(r => r.Prior_Month_Outcome === 'Resolved first time last month') || {};
  panel('pnlRepeat', 'Scenario 6 · Unresolved calls come back', `Customers whose call last month was not resolved called again <b>${pct(bad.Repeat_Rate)}</b> of the time, against ${pct(good.Repeat_Rate)} after a first-time resolution.`,
    { q: 'Which customers called again after an unresolved call this month, and what do they have in common?', mode: 'agent' },
    rep.map(r => bar(hEsc(r.Prior_Month_Outcome), num(r.Repeat_Rate), maxR, pct(r.Repeat_Rate),
      r.Prior_Month_Outcome === 'Not resolved last month' ? 'bad' : r.Prior_Month_Outcome === 'Resolved first time last month' ? 'good' : 'brand',
      `${count(r.Repeat_Calls)} repeat calls of ${count(r.Contacts)} contacts` +
      (r.Prior_Month_Outcome === 'Not resolved last month' ? ' ' + viewBtn('repeat_unresolved_12m', 'View', '', 'Called again after an unresolved call, 12 months', true) : ''))).join('') +
    `<div class="panel-note">Contacted customers over 12 months, by how their call went the month before.</div>`);
}

/** 4. Where is the money? Overdue balance by days past due, and the 12-month trend. */
function renderMoney(s, o) {
  const month = monthLabel(s.as_of);
  const rows = o.exposure || [];
  const prior = num(s.Prior_Overdue_Balance);
  const late = rows.filter(r => num(r.DPD_Bucket_Order) >= 3);
  const lateShare = late.reduce((a, r) => a + num(r.Balance_Share), 0);
  setTake('ch4Take', `<b>${money(s.Overdue_Balance)}</b> is overdue across <b>${count(s.Overdue_Accounts)}</b> accounts in ${hEsc(month)}` +
    (prior ? ` (${money(prior)} the month before)` : '') + `, of ${money(s.Total_Balance)} owed across all ${count(s.Accounts)} accounts. ` +
    (late.length ? `<b>${pct(lateShare, 0)}</b> of the overdue balance is more than ${count(ruleVal(s, 'dpd_bucket_2_max', 60))} days past due.` : ''));
  const colors = ['#0E8F80', '#0B6E99', '#D97706', '#DC2626'];
  const stack = `<div class="stack">${rows.map((r, i) => `<span style="width:${(100 * num(r.Balance_Share)).toFixed(2)}%;background:${colors[i % colors.length]}" title="${hEsc(r.DPD_Bucket)} days: ${money(r.Overdue_Balance)} (${pct(r.Balance_Share)})">${num(r.Balance_Share) > 0.08 ? pct(r.Balance_Share, 0) : ''}</span>`).join('')}</div>`;
  const table = `<table class="mini risk-table"><thead><tr><th>Days past due</th><th>Accounts</th><th>Overdue</th><th>Share</th><th>Promises</th><th>Broken</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><span class="dot" style="background:${colors[i % colors.length]}"></span>${hEsc(r.DPD_Bucket)} days</td><td>${count(r.Accounts)}</td><td>${money(r.Overdue_Balance)}</td><td>${pct(r.Balance_Share)}</td><td>${count(r.Promises)}</td><td>${pct(r.Broken_Rate, 0)}</td><td>${viewBtn('bucket', 'View', r.DPD_Bucket, `${r.DPD_Bucket} days past due, ${month}`, true)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${count(rows.reduce((a, r) => a + num(r.Accounts), 0))}</td><td>${money(rows.reduce((a, r) => a + num(r.Overdue_Balance), 0))}</td><td>100%</td><td>${count(rows.reduce((a, r) => a + num(r.Promises), 0))}</td><td></td><td></td></tr></tbody></table>`;
  panel('pnlExposure', 'Overdue balance by days past due', `${hEsc(month)}, overdue accounts`,
    { q: 'How is the overdue balance spread across days-past-due buckets, and where are promises breaking most?', mode: 'chat' },
    stack + `<div class="table-scroll flat">${table}</div>`);
  renderTrend(o, 'Overdue_Balance');
}

const TREND = {
  Overdue_Balance: { label: 'Overdue balance', fmt: v => money(v), axis: v => money(v, 0) },
  Broken_Rate: { label: 'Broken-promise rate', fmt: v => pct(v), axis: v => pct(v, 0) },
  Promised_Amount: { label: 'Amount promised', fmt: v => money(v), axis: v => money(v, 0) },
  FCR_Rate: { label: 'Resolved first time', fmt: v => pct(v), axis: v => pct(v, 0) },
  Transfer_Rate: { label: 'Transferred', fmt: v => pct(v), axis: v => pct(v, 0) },
  Repeat_Rate: { label: 'Called again', fmt: v => pct(v), axis: v => pct(v, 0) },
};
let trendChart = null;
function renderTrend(o, key) {
  const rows = o.trend || [];
  const t = TREND[key];
  const first = rows[0], last = rows[rows.length - 1];
  panel('pnlTrend', '12-month trend', first && last ? `${hEsc(t.label)}: ${t.fmt(first[key])} in ${hEsc(first.Snapshot_Month)}, ${t.fmt(last[key])} in ${hEsc(last.Snapshot_Month)}` : '',
    { q: `How has the ${t.label.toLowerCase()} changed month by month over the last 12 months?`, mode: 'chat' },
    `<div class="trend-ctl">${Object.entries(TREND).map(([k, v]) => `<button class="chip-btn${k === key ? ' on' : ''}" data-trend="${k}">${hEsc(v.label)}</button>`).join('')}</div>
     <div class="trend-cv"><canvas id="ccTrendChart" aria-label="${hEsc(t.label)} by month" role="img"></canvas></div>`);
  document.querySelectorAll('#pnlTrend [data-trend]').forEach(b => b.addEventListener('click', () => renderTrend(o, b.dataset.trend)));
  if (!window.Chart || !rows.length) return;
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('ccTrendChart'), {
    type: 'line',
    data: { labels: rows.map(r => r.Snapshot_Month), datasets: [{ label: t.label, data: rows.map(r => num(r[key])), borderColor: '#0B6E99', backgroundColor: 'rgba(11,110,153,.12)', fill: true, tension: .3, pointRadius: 3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${t.label}: ${t.fmt(c.parsed.y)}` } } },
      scales: { y: { ticks: { callback: v => t.axis(v) } } } },
  });
}

/** 5. Which customers need a different conversation? The Scenario_Guide's six scenarios. */
function renderScenarios(s, o) {
  const month = monthLabel(s.as_of);
  const scen = o.scenarios || [];
  const sc = id => scen.find(r => String(r.Scenario_ID) === String(id)) || {};
  const r = (n, f) => count(ruleVal(s, n, f));
  const fcr = outcomeRow(o, 'Resolved first time'), xfer = outcomeRow(o, 'Transferred');
  const xferHours = (o.transferByState || []).reduce((a, x) => a + num(x.Transferred_Handle_Hours), 0);
  setTake('ch5Take', `Optus's Scenario_Guide picks out four groups of accounts in ${hEsc(month)}, plus two contact-centre patterns (chapter 3). ` +
    `The largest is <b>${count(Math.max(...scen.map(x => num(x.Accounts) || 0), 0))}</b> accounts; an account can be in more than one.`);
  const asks = {
    1: `Which customers are interested in a new product but more than ${r('s1_min_dpd', 30)} days overdue, and how should we approach them?`,
    2: `Which customers are porting out with a credit score below ${r('s2_credit_below', 550)}, ranked by outstanding balance?`,
    3: `For customers with ${r('s3_min_missed_payments', 2)}+ missed payments entering renewal, what % broke their last promise to pay?`,
    6: 'Which customers called again after an unresolved call this month?',
  };
  const accountCard = id => {
    const x = sc(id);
    return `<div class="card scen"><div class="scen-n">Scenario ${id}</div><div class="scen-t">${hEsc(x.Scenario_Name || '')}</div>
      <div class="scen-v">${count(x.Accounts)}<small>accounts</small></div>
      <div class="scen-d">${hEsc(x.Business_Question || '')} They owe ${money(x.Total_Balance)}, ${money(x.Overdue_Balance)} overdue${num(x.Promises) ? `; ${pct(x.Broken_Rate, 0)} of their ${count(x.Promises)} promises this month broke` : ''}.</div>
      <div class="scen-f">${hEsc(x.Filter_Logic || '')}</div>
      <div class="card-btns">${viewBtn('scenario', 'View accounts', String(id), `Scenario ${id}: ${x.Scenario_Name}, ${month}`)}${askBtn(asks[id], 'chat')}</div></div>`;
  };
  const patternCard = (id, title, value, unit, desc, q) => `<div class="card scen"><div class="scen-n">Scenario ${id}</div><div class="scen-t">${hEsc(title)}</div>
      <div class="scen-v">${value}<small>${hEsc(unit)}</small></div><div class="scen-d">${desc}</div>
      <div class="card-btns"><a class="view-btn" href="#ch3">See chapter 3</a>${askBtn(q, 'agent')}</div></div>`;
  document.getElementById('scenarios').innerHTML = [
    accountCard(1), accountCard(2), accountCard(3),
    patternCard(4, 'Contact Center Efficiency vs Collections', pct(num(xfer.Broken_Rate) - num(fcr.Broken_Rate), 0).replace('%', ' pts'), 'more broken after a transfer',
      `${pct(fcr.Broken_Rate)} of promises broke after a first-time resolution, ${pct(xfer.Broken_Rate)} after a transfer (12 months).`,
      'Compare FCR rates against promise-kept rates: does agent quality drive recovery?'),
    patternCard(5, 'Transfer-Driven Cost Leakage', count(xferHours), 'hours on transferred calls',
      `Transferred calls average ${secs(xfer.Avg_Handle_Seconds)}; shown in hours because no cost per minute has been supplied.`,
      'Which states and products combine high transfer rates with long handle times, and where is the training opportunity?'),
    accountCard(6),
  ].join('');
}

/** The broken promises with the most at stake (qry_cc_top_broken_accounts). */
function renderTopBroken(s, o) {
  const rows = o.topBroken || [];
  const n = ruleVal(s, 'top_accounts', 100);
  const month = monthLabel(s.as_of);
  const body = `<div class="table-scroll flat"><table class="nice">
    <thead><tr><th>Account</th><th>State · product</th><th>Balance</th><th>Days overdue</th><th>Promised</th><th>Credit score</th><th>Call</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="mono">${hEsc(r.Account_ID)}</td><td>${hEsc(r.State)} <span class="muted">· ${hEsc(r.Product_Type)}</span></td>
      <td><b>${money(r.Outstanding_Balance)}</b></td><td>${count(r.Days_Past_Due)}</td>
      <td>${money(r.PTP_Amount)} <span class="muted">due ${hEsc(String(r.PTP_Due_Date || '').slice(0, 10))}</span></td>
      <td>${count(r.Credit_Score)}</td><td>${hEsc(r.Call_Outcome)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty-note">No broken promises this month.</td></tr>'}</tbody></table></div>`;
  panel('pnlTopBroken', `The ${count(n)} broken promises with the most at stake`, `${hEsc(month)}, largest outstanding balance first. The 8 largest are shown. ${viewBtn('top_broken', `View all ${count(n)}`, '', `Top ${count(n)} broken promises, ${month}`, true)}`,
    { q: `Show me the top ${count(n)} accounts by outstanding balance where the promise to pay was broken last month.`, mode: 'chat' }, body);
}

// ---------------------------------------------------------------- the accounts behind a figure
// Every card can show its accounts: the same rule as its number, at account level.
const LIST_RULES = {
  overdue: 'More than 0 days past due on the latest snapshot.',
  promises: 'Made a promise to pay in the latest month.',
  broken: 'Made a promise to pay in the latest month and broke it.',
  kept: 'Made a promise to pay in the latest month and kept it.',
  bucket: 'Overdue accounts in this days-past-due bucket, latest month.',
  contacted: 'Contacted in the latest month (one contact flag per account per month).',
  unresolved: 'Contacted in the latest month and not resolved on the first call.',
  transferred: 'Contacted in the latest month and transferred.',
  repeat: 'Called again within about 7 to 14 days, latest month.',
  repeat_unresolved: 'Called again this month after a call last month that was not resolved first time (Scenario 6).',
  scenario: 'Accounts in this scenario at the latest snapshot, using the thresholds in the business rules.',
  top_broken: 'Broken promises in the latest month, largest outstanding balance first.',
  segment_broken: 'Broken promises in this segment over 12 months (one row per account per month).',
  transferred_state: 'Transferred calls in this state over 12 months (one row per account per month).',
  repeat_unresolved_12m: 'Called again after an unresolved call the month before, over 12 months (one row per account per month).',
};
const viewBtn = (list, label, value = '', title = '', sm = false) =>
  `<button class="view-btn${sm ? ' sm' : ''}" data-accounts="${list}" data-value="${hEsc(value)}" data-title="${hEsc(title)}">${hEsc(label)}</button>`;
let acctRows = [];
function openAccounts(list, value, title) {
  return showAccountList({
    url: `/api/dashboard/accounts?list=${encodeURIComponent(list)}${value ? '&value=' + encodeURIComponent(value) : ''}`,
    title, rule: LIST_RULES[list] || '', file: `lenss-optus-${list}${value ? '-' + value.replace(/\W+/g, '-').toLowerCase() : ''}`,
  });
}
const flag = v => (v === null || v === undefined || v === '' ? null : String(v) === '1' || String(v).toLowerCase() === 'true');
/** The accounts window, shared by the Command Center and the Explorer (window.showAccountList). */
async function showAccountList({ url, title, rule, file }) {
  const dlg = document.getElementById('acctDialog');
  document.getElementById('acctTitle').textContent = title || 'Accounts';
  document.getElementById('acctRule').textContent = rule || '';
  document.getElementById('acctSum').textContent = 'Loading accounts…';
  document.getElementById('acctBody').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel short"></div>';
  document.getElementById('acctCsv').disabled = true;
  if (!dlg.open) dlg.showModal();
  let d;
  try {
    const r = await fetch(url);
    d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  } catch (err) {
    document.getElementById('acctSum').textContent = 'These accounts could not be loaded. Please try again.';
    document.getElementById('acctBody').innerHTML = '';
    return;
  }
  const t = d.totals || {};
  acctRows = d.rows || [];
  const months = d.period === '12m';
  document.getElementById('acctSum').innerHTML = (months
    ? `<b>${count(t.rows)}</b> account-months (${count(t.accounts)} accounts)`
    : `<b>${count(t.accounts)}</b> accounts · <b>${money(t.balance)}</b> balance · <b>${money(t.overdue_balance)}</b> overdue`) +
    (num(t.promised) ? ` · <b>${money(t.promised)}</b> promised` : '') + (num(t.broken_amount) ? ` · <b>${money(t.broken_amount)}</b> broken` : '') +
    (d.truncated ? ` <span class="muted">(the first ${count(acctRows.length)} are listed and exported)</span>` : '');
  const promise = r => (num(r.PTP_Amount) ? `${money(r.PTP_Amount)} <span class="muted">due ${hEsc(String(r.PTP_Due_Date || '').slice(0, 10))}${flag(r.Broken_PTP_Flag) ? ', broken' : flag(r.Broken_PTP_Flag) === false ? ', kept' : ''}</span>` : '<span class="muted">—</span>');
  document.getElementById('acctBody').innerHTML = `<table class="nice"><thead><tr><th>Account</th>${months ? '<th>Month</th>' : ''}<th>State · product</th><th>Credit</th><th>Balance</th><th>Days overdue</th>
      <th>Promise</th><th>Call</th><th>Handle time</th><th>Missed payments</th><th>Porting · renewal</th></tr></thead>
    <tbody>${acctRows.map(r => `<tr><td class="mono">${hEsc(r.Account_ID)}</td>${months ? `<td>${hEsc(r.Snapshot_Month)}</td>` : ''}
      <td>${hEsc(r.State)} <span class="muted">· ${hEsc(r.Product_Type)}</span></td><td>${count(r.Credit_Score)}</td>
      <td>${money(r.Outstanding_Balance)}</td><td>${count(r.Days_Past_Due)}</td><td>${promise(r)}</td>
      <td>${hEsc(r.Call_Outcome)}${flag(r.Repeat_Call_Flag) ? ' <span class="xp-tag warn">called again</span>' : ''}</td>
      <td>${num(r.Handle_Time_Seconds) === null ? '<span class="muted">—</span>' : secs(r.Handle_Time_Seconds)}</td><td>${count(r.Missed_Payments_L12M)}</td>
      <td>${hEsc(r.Porting_Status)}${flag(r.Contract_Renewal_Window_Flag) ? ' <span class="muted">· renewal</span>' : ''}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('acctCsv').disabled = !acctRows.length;
  document.getElementById('acctCsv').onclick = () => {
    const cols = ['Account_ID', 'Snapshot_Month', 'State', 'Product_Type', 'Credit_Score', 'Outstanding_Balance', 'Days_Past_Due', 'DPD_Bucket', 'PTP_Amount',
      'PTP_Due_Date', 'Broken_PTP_Flag', 'Call_Outcome', 'Repeat_Call_Flag', 'Handle_Time_Seconds', 'Missed_Payments_L12M', 'Porting_Status',
      'Contract_Renewal_Window_Flag', 'New_Product_Interest_Flag'];
    const cell = v => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [`# ${title}: ${rule || ''}`, cols.join(','), ...acctRows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${file || 'lenss-optus-accounts'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
window.showAccountList = showAccountList;
document.getElementById('acctClose').addEventListener('click', () => document.getElementById('acctDialog').close());
document.getElementById('acctDialog').addEventListener('click', (e) => { if (e.target.id === 'acctDialog') e.target.close(); });
document.getElementById('tab-home').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accounts]');
  if (b) openAccounts(b.dataset.accounts, b.dataset.value, b.dataset.title);
});

// The story bar follows the reader: the chapter in view is highlighted.
if (window.IntersectionObserver) {
  const links = [...document.querySelectorAll('.story-nav a')];
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const id = e.target.id === 'homeHero' ? 'ch1' : e.target.id;
    links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  ['homeHero', 'ch2', 'ch3', 'ch4', 'ch5'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}

loadHome().catch(err => {
  console.error('Command Center failed to load', err);
  document.getElementById('heroSub').textContent = 'Some figures could not be loaded. Please refresh the page.';
});
