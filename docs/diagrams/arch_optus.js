// LensS Collections Intelligence: technical architecture (SVG → PNG via sharp).
const fs = require('fs');
const sharp = require('sharp');

const W = 1920, H = 1160;
const NAVY = '#0B2545', NAVY2 = '#13315C', TEAL = '#0E9384', AQUA = '#25E2CC', INK = '#0F172A', SLATE = '#475569', MUTED = '#64748B';
const SOFT = '#F1F5F9', LINE = '#E2E8F0', TEALSOFT = '#E3F8F5', AMBER = '#B45309', AMBERSOFT = '#FFF7ED';
const FONT = 'Segoe UI, Calibri, Arial, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = [];
const add = (s) => P.push(s);

function wrap(text, size, width) {
  const max = Math.max(4, Math.floor(width / (size * 0.53)));
  const out = []; let line = '';
  for (const w of String(text).split(' ')) {
    if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}
const text = (x, y, s, size, color = INK, weight = 400, anchor = 'start') =>
  add(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`);
const lines = (x, y, arr, size, color = SLATE, weight = 400, lh = 1.3) => arr.forEach((l, i) => text(x, y + i * size * lh, l, size, color, weight));
const rect = (x, y, w, h, fill, stroke = 'none', r = 12, sw = 1.2, dash = '') =>
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);

// Card: title + wrapped body lines.
function card(x, y, w, h, title, body, opt = {}) {
  rect(x, y, w, h, opt.fill || SOFT, opt.stroke || LINE, 12, opt.sw || 1.2);
  text(x + 14, y + 25, title, opt.ts || 16, opt.tc || NAVY, 700);
  const bl = Array.isArray(body) ? body.flatMap((b) => wrap(b, opt.bs || 12.5, w - 28)) : wrap(body, opt.bs || 12.5, w - 28);
  lines(x + 14, y + 46, bl, opt.bs || 12.5, opt.bc || SLATE);
}
function chip(x, y, w, h, label, fill = '#FFFFFF', color = NAVY, stroke = LINE, size = 12.5, weight = 600) {
  rect(x, y, w, h, fill, stroke, h / 2, 1.2);
  text(x + w / 2, y + h / 2 + size * 0.36, label, size, color, weight, 'middle');
}
function arrow(x1, y1, x2, y2, label = '', color = TEAL, dx = 0, dy = -8) {
  add(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.4" marker-end="url(#ah)"/>`);
  if (label) {
    const mx = (x1 + x2) / 2 + dx, my = (y1 + y2) / 2 + dy;
    const w = label.length * 6.6 + 14;
    rect(mx - w / 2, my - 13, w, 20, '#FFFFFF', 'none', 10);
    text(mx, my + 1.5, label, 11.5, color, 700, 'middle');
  }
}

add(`<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${TEAL}"/></marker></defs>`);
add(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);

// ---- Title
text(50, 70, 'LensS Collections Intelligence for Optus: technical architecture', 36, NAVY, 700);
add(`<rect x="50" y="80" width="110" height="5" rx="2" fill="#FFCC00"/>`);
rect(1225, 30, 104, 28, '#E0F5F3', '#9ADCD6', 14, 1.2);
text(1225 + 52, 49, 'FOR OPTUS', 13, '#004D49', 800, 'middle');

text(50, 104, 'One Databricks App in front of governed data, Genie and AI models. Every back-end call runs as the app’s own service principal; people never touch the data.', 17, MUTED);

// ---- Column A: people and access
const ax = 50, aw = 300;
text(ax, 152, 'PEOPLE & ACCESS', 14, NAVY, 800);
card(ax, 166, aw, 118, 'Business users', ['Collections and contact-centre leaders and analysts in a browser.', 'Readers group (readers_group): Consumer access + CAN_USE on the app.']);
card(ax, 298, aw, 118, 'Demo givers', ['Group set in demo_givers_group: Workspace access, CAN_MANAGE (Start / Stop), read on the app code.']);
card(ax, 430, aw, 150, 'Databricks Apps proxy', ['Single sign-on (Entra ID).', 'Checks CAN_USE, adds x-forwarded-email.', 'One HTTPS address per app; one port inside.'], { fill: NAVY, stroke: NAVY, tc: '#FFFFFF', bc: '#C9DCE6' });

// ---- Column B: the app
const bx = 400, bw = 770, by = 140, bh = 600;
rect(bx, by, bw, bh, '#FFFFFF', NAVY, 20, 3);
rect(bx + 22, by - 16, 470, 32, NAVY, 'none', 16);
text(bx + 40, by + 6, 'LENSS APP', 15, AQUA, 800);
text(bx + 136, by + 6, 'Databricks App · Node.js + AppKit · one port', 15, '#FFFFFF', 600);
arrow(ax + aw, 505, bx, 505, 'HTTPS', TEAL, 0, -10);

// Web UI
text(bx + 24, by + 46, 'WEB UI', 13, NAVY, 800);
text(bx + 90, by + 46, 'public/ · HTML, JavaScript, CSS · runs in the browser', 12.5, MUTED);
const ui = ['Command Center', 'Explorer', 'Assistant', 'Observability (8)', 'Responsible AI'];
const uw = (bw - 48 - 4 * 10) / 5;
ui.forEach((u, i) => chip(bx + 24 + i * (uw + 10), by + 58, uw, 34, u, TEALSOFT, NAVY, '#BFE9E3', 13.5, 700));

// API routes
text(bx + 24, by + 128, 'API ROUTES', 13, NAVY, 800);
text(bx + 122, by + 128, 'server/routes · TypeScript · Express', 12.5, MUTED);
const api = [['/api/chat', 'questions, sessions'], ['/api/dashboard', 'Command Center figures, lists'], ['/api/explorer', 'filters, account records'], ['/api/evals · /api/ai', 'evaluations, transparency'], ['/api/cost', 'Databricks cost']];
api.forEach(([r, d], i) => {
  const x = bx + 24 + i * (uw + 10);
  rect(x, by + 140, uw, 62, SOFT, LINE, 10);
  text(x + 12, by + 162, r, 13, NAVY, 700);
  lines(x + 12, by + 182, wrap(d, 11.5, uw - 22), 11.5, SLATE);
});

// Assistant pipeline
text(bx + 24, by + 238, 'ASSISTANT PIPELINE', 13, NAVY, 800);
text(bx + 186, by + 238, 'every typed question, in order (server/lib)', 12.5, MUTED);
const steps = [['Guardrails', 'PII mask, injection, abuse, off-topic'], ['Router', 'data or guide · Quick or Deep · pushback, repeats'],
  ['Context', 'each engine gets only the turns it missed'], ['Cache', 'exact + similar questions'],
  ['Genie', 'Quick = chat · Deep = agent mode'], ['Checks', 'figures reconciled · AI judge · output guardrails']];
const sw = (bw - 48 - 5 * 12) / 6;
steps.forEach(([t, d], i) => {
  const x = bx + 24 + i * (sw + 12);
  rect(x, by + 250, sw, 104, i === 4 ? TEAL : '#FFFFFF', i === 4 ? TEAL : TEAL, 10, 1.6);
  text(x + 10, by + 274, `${i + 1}  ${t}`, 13, i === 4 ? '#FFFFFF' : NAVY, 700);
  lines(x + 10, by + 296, wrap(d, 11.5, sw - 18), 11.5, i === 4 ? '#E6FFFB' : SLATE);
  if (i < steps.length - 1) add(`<path d="M${x + sw + 1},${by + 302} l10,0" stroke="${TEAL}" stroke-width="2" marker-end="url(#ah)"/>`);
});
text(bx + 24, by + 378, 'Then: follow-up suggestions · trace + usage log · streamed to the browser as server-sent events', 12.5, SLATE);

// Cross-cutting services
text(bx + 24, by + 416, 'ALSO IN THE APP', 13, NAVY, 800);
const cross = [['Platform guide', 'answers "how do I…" about LensS itself'], ['Business rules', 'thresholds read live from qry_rules'],
  ['Evaluations', 'accuracy, guardrail, policy, routing suites'], ['Idle stop', 'stops itself when unused (60 min in org)'], ['Notifications', 'answer-ready alerts, PDF export, voice']];
cross.forEach(([t, d], i) => {
  const x = bx + 24 + i * (uw + 10);
  rect(x, by + 428, uw, 82, SOFT, LINE, 10);
  text(x + 12, by + 450, t, 13, NAVY, 700);
  lines(x + 12, by + 470, wrap(d, 11.5, uw - 22), 11.5, SLATE);
});
rect(bx + 24, by + 522, bw - 48, 64, AMBERSOFT, '#FED7AA', 10);
text(bx + 40, by + 545, 'App identity: the app’s service principal', 13.5, AMBER, 700);
lines(bx + 40, by + 565, ['Reads gold (SELECT) · runs Genie (CAN_RUN) · queries models (CAN_QUERY) · uses Lakebase', '· stops itself (CAN_MANAGE on its own app) · no keys in code'], 11.5, '#7C2D12', 400, 1.3);

// ---- Column C: Databricks services
const cx = 1330, cw = 540;
text(cx, 152, 'DATABRICKS SERVICES', 14, NAVY, 800);
const svc = [
  ['Genie Agent: Optus Collections (query engine)', 'Natural language → SQL over 14 gold sources and the metric view. Defined in code: instructions with rule values filled in, 29 example queries, Optus’s 12 sample questions as benchmarks.', TEAL],
  ['Model Serving (foundation models)', 'Llama 3.3 70B: router, guardrails, follow-ups (org) · GPT-OSS: answer judge · GTE Large: embeddings for the semantic cache. Smaller models on the personal workspace.', null],
  ['Lakebase (Postgres)', 'Database chatapp-optus: sessions, messages, usage & audit log, answer cache, cache versions, evaluation cases and runs.', null],
  ['SQL warehouse (serverless)', 'Runs Genie’s SQL and the app’s dashboard, Explorer and cost queries.', null],
  ['Unity Catalog', 'Governed data: gold certified views, metric views, rules; plus system.billing / system.query behind the cost view.', null],
];
const sh = [118, 118, 104, 82, 104];
let sy = 166;
svc.forEach(([t, d, hl], i) => {
  card(cx, sy, cw, sh[i], t, d, hl ? { fill: TEAL, stroke: TEAL, tc: '#FFFFFF', bc: '#E6FFFB', bs: 13 } : { bs: 13 });
  svc[i].y = sy; sy += sh[i] + 14;
});
// App → services
arrow(bx + bw, svc[0].y + 55, cx, svc[0].y + 55, 'questions');
arrow(bx + bw, svc[1].y + 55, cx, svc[1].y + 55, 'AI calls');
arrow(bx + bw, svc[2].y + 50, cx, svc[2].y + 50, 'state');
arrow(bx + bw, svc[3].y + 40, cx, svc[3].y + 40, 'SQL');
// Genie → warehouse → UC (inside the column, on the right edge)
const gx = cx + cw - 30;
add(`<path d="M${gx},${svc[0].y + sh[0]} L${gx},${svc[3].y - 2}" stroke="${NAVY2}" stroke-width="2" stroke-dasharray="6 5" fill="none" marker-end="url(#ah)"/>`);
text(gx - 8, svc[1].y + sh[1] + 9, 'Genie SQL', 11.5, NAVY2, 700, 'end');
arrow(cx + cw / 2, svc[3].y + sh[3], cx + cw / 2, svc[4].y, '');

// ---- Bottom: data pipeline and deploy
const py = 770;
rect(50, py, 1820, 360, '#FFFFFF', LINE, 18, 1.5);
text(74, py + 34, 'DATA PIPELINE (MEDALLION, IN UNITY CATALOG)', 14, NAVY, 800);
const med = [['Source', 'Optus demo workbook v2 (Excel, 4 sheets): 15,000 accounts × 12 months'], ['Bronze', 'raw tables, as received; N/A and None kept as text'], ['Silver', 'typed account-months, flags 1 / 0 / NULL, primary key'],
  ['Gold', '11 certified views · 2 Command Center views · 1 metric view · 16 business rules + qry_rules · every view described'], ['Context', 'data dictionary, scenario guide, sample questions, known limits']];
const mw = 330, mg = 30;
med.forEach(([t, d], i) => {
  const x = 74 + i * (mw + mg) - (i === 4 ? 0 : 0);
  const fill = i === 3 ? NAVY : SOFT, tc = i === 3 ? '#FFFFFF' : NAVY, bc = i === 3 ? '#C9DCE6' : SLATE;
  rect(x, py + 50, mw, 100, fill, i === 3 ? NAVY : LINE, 12);
  text(x + 14, py + 76, t, 16, tc, 700);
  lines(x + 14, py + 98, wrap(d, 12.5, mw - 28), 12.5, bc);
  if (i < 3) arrow(x + mw + 2, py + 100, x + mw + mg - 2, py + 100, '');
});
text(74, py + 190, 'ONE-COMMAND DEPLOY  (deploy/deploy.py → Databricks CLI, everything as code)', 14, NAVY, 800);
const dep = ['schemas', 'ingest', 'context', 'transform', 'views', 'summary', 'genie', 'lakebase', 'app', 'smoke', 'routing'];
const dw = (1772 - 10 * 12) / 11;
dep.forEach((d, i) => chip(74 + i * (dw + 12), py + 204, dw, 36, `${i + 1}. ${d}`, i === 8 ? TEAL : TEALSOFT, i === 8 ? '#FFFFFF' : NAVY, i === 8 ? TEAL : '#BFE9E3', 13.5, 700));
lines(74, py + 268, [
  'app step: creates or updates the app, binds Genie, warehouse, Lakebase and models; grants the service principal its access; gives readers CAN_USE and demo givers CAN_MANAGE;',
  'shares the app code folder with those who can start it; creates the cost view; checks page scripts; syncs the code and deploys.  smoke and routing run only when asked (org).',
], 13, SLATE, 400, 1.45);
text(74, py + 336, 'Own app, schemas (optus_collections_*), Genie space and chat database, so it runs beside LensS Collections in the same workspace without touching it.', 13, MUTED);

text(50, 1150, 'LensS Collections Intelligence for Optus  ·  powered by Concentrix  ·  Concentrix Data & Analytics Practice', 13, MUTED);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>`;
fs.writeFileSync('D:/Optus_LensS_Collections/docs/LensS_Optus_Architecture.svg', svg);
sharp(Buffer.from(svg), { density: 192 }).png().toFile('D:/Optus_LensS_Collections/docs/LensS_Optus_Architecture.png')
  .then((i) => console.log('png', i.width, 'x', i.height)).catch((e) => { console.error(e); process.exit(1); });
