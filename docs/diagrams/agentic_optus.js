// LensS: governed, agentic architecture (layered request → response view), SVG → PNG via sharp.
const fs = require('fs');
const sharp = require('sharp');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Fa = require('react-icons/fa');

const W = 1920, H = 1160;
const NAVY = '#0B2545', NAVY2 = '#163A5F', TEAL = '#14B8A6', TEALD = '#0E9384', AMBER = '#F2B84B', AMBERD = '#B45309';
const MAGENTA = '#BE185D', INK = '#0F172A', SLATE = '#475569', MUTED = '#64748B', LINE = '#CBD5E1';
const FONT = 'Segoe UI, Calibri, Arial, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = [];
const add = (s) => P.push(s);
const text = (x, y, s, size, color = INK, weight = 400, anchor = 'start', extra = '') =>
  add(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`);
const rect = (x, y, w, h, fill, stroke = 'none', r = 10, sw = 1.5, dash = '') =>
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
function icon(Comp, x, y, size, color) {
  let svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color, size }));
  svg = svg.replace('<svg ', `<svg x="${x}" y="${y}" `);
  add(svg);
}
const dbl = (x, y1, y2) => add(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#3B82B6" stroke-width="2.5" marker-start="url(#ab)" marker-end="url(#ab)"/>`);

add(`<defs>
  <marker id="ab" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3B82B6"/></marker>
</defs>`);
add(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);

// ---- Title
text(60, 74, 'LensS — Governed, Agentic AI Architecture for Telecom Collections', 40, NAVY, 600);
add(`<rect x="60" y="86" width="110" height="5" rx="2" fill="#FFCC00"/>`);
rect(1330, 36, 104, 28, '#E0F5F3', '#9ADCD6', 14, 1.2);
text(1330 + 52, 55, 'FOR OPTUS', 13, '#004D49', 800, 'middle');

text(60, 116, 'For Optus: every question follows one governed path, understood, routed, answered by an approved engine, checked, and logged.', 18, MUTED);

// ---- Request / response rails
const top = 140, bottom = 900;
add(`<polygon points="34,${top} 74,${top} 74,${bottom - 40} 92,${bottom - 40} 54,${bottom + 8} 16,${bottom - 40} 34,${bottom - 40}" fill="${TEAL}"/>`);
text(54, (top + bottom) / 2, 'REQUEST', 20, '#FFFFFF', 800, 'middle', `transform="rotate(-90 54 ${(top + bottom) / 2})" letter-spacing="6"`);
const rx = 1866;
add(`<polygon points="${rx - 20},${bottom} ${rx + 20},${bottom} ${rx + 20},${top + 48} ${rx + 38},${top + 48} ${rx},${top} ${rx - 38},${top + 48} ${rx - 20},${top + 48}" fill="${AMBER}"/>`);
text(rx, (top + bottom) / 2, 'RESPONSE', 20, '#FFFFFF', 800, 'middle', `transform="rotate(90 ${rx} ${(top + bottom) / 2})" letter-spacing="6"`);

const X0 = 170, X1 = 1810, CW = X1 - X0, MID = (X0 + X1) / 2;
const num = (n, y) => { add(`<circle cx="125" cy="${y}" r="22" fill="${TEAL}"/>`); text(125, y + 8, String(n), 22, NAVY, 800, 'middle'); };

// 1. Channels
const y1 = top, h1 = 78;
num(1, y1 + h1 / 2);
const ch = [
  [Fa.FaComments, 'Assistant', 'Ask in plain English, quick or deep', true],
  [Fa.FaChartLine, 'Command Center & Explorer', 'Promises, why they break, the contact centre; every figure clickable', true],
  [Fa.FaPlug, 'Teams · API · Briefings', 'Same answers in other channels (ready to add)', false],
];
const cw3 = (CW - 2 * 40) / 3;
ch.forEach(([I, t, s, live], i) => {
  const x = X0 + i * (cw3 + 40);
  rect(x, y1, cw3, h1, live ? NAVY : '#FFFFFF', live ? NAVY : NAVY, 6, 2, live ? '' : '8 6');
  icon(I, x + 26, y1 + 20, 38, live ? '#7DD3FC' : NAVY);
  text(x + cw3 / 2 + 24, y1 + 34, t, 20, live ? '#FFFFFF' : NAVY, 700, 'middle');
  text(x + cw3 / 2 + 24, y1 + 58, s, 14, live ? '#C9DCE6' : SLATE, 400, 'middle');
  dbl(x + cw3 / 2, y1 + h1 + 3, y1 + h1 + 39);
});

// 2. Conversational layer · question router
const y2 = y1 + h1 + 42, h2 = 74;
num(2, y2 + h2 / 2);
rect(X0, y2, CW, h2, '#E6F4FA', '#7FB8D6', 6);
icon(Fa.FaBrain, X0 + 40, y2 + 16, 42, NAVY2);
text(MID, y2 + 32, 'Conversational Layer · Question Router', 23, '#0E5A6E', 700, 'middle');
text(MID, y2 + 58, 'Screens the question (guardrails) → reads the conversation → data or app guide · Quick or Deep → spots pushback, “not enough”, asking again', 15, SLATE, 400, 'middle');
dbl(MID, y2 + h2 + 3, y2 + h2 + 33);

// 3. Context & engine selection
const y3 = y2 + h2 + 36, h3 = 74;
num(3, y3 + h3 / 2);
rect(X0, y3, CW, h3, '#EDE9F6', '#A99BD3', 6);
icon(Fa.FaProjectDiagram, X0 + 40, y3 + 16, 40, '#4C3D8A');
text(MID, y3 + 32, 'Context & Engine Selection', 23, '#3F3375', 700, 'middle');
text(MID, y3 + 58, 'Answer cache first → gives each engine only the turns it missed → calls the chosen engine → merges the structured result into one answer', 15, SLATE, 400, 'middle');
dbl(MID, y3 + h3 + 3, y3 + h3 + 33);

// 4. Engines + execution services
const y4 = y3 + h3 + 36, h4 = 330;
num(4, y4 + h4 / 2);
rect(X0 - 8, y4 - 8, CW + 16, h4 + 16, 'none', '#94A3B8', 4, 1.5, '4 4');
// 4a. engines
rect(X0, y4, CW, 112, '#EEF5E9', '#9DBF8A', 6);
text(MID, y4 + 30, 'Governed Engines & Agents — each answers only from its approved sources (examples shown)', 18, '#3D5A2A', 700, 'middle');
const eng = [['Genie Agent: Optus Collections', 'Quick answers', true], ['Genie Deep Analysis', 'multi-step agent mode', true], ['Platform Guide', '“how do I…” in LensS', true],
  ['More Genie Agents', 'billing, network, retention', false], ['Document Knowledge', 'hardship policy, call scripts', false], ['MCP Tools', 'CRM, telephony, ticketing', false]];
const ew = (CW - 40 - 5 * 14) / 6;
eng.forEach(([t, s, live], i) => {
  const x = X0 + 20 + i * (ew + 14);
  rect(x, y4 + 46, ew, 54, live ? '#FFFFFF' : '#F8FAFC', live ? '#9DBF8A' : '#94A3B8', 6, 1.5, live ? '' : '6 5');
  text(x + ew / 2, y4 + 69, t, 15.5, live ? '#2F4A1F' : SLATE, 700, 'middle');
  text(x + ew / 2, y4 + 89, s, 12.5, MUTED, 400, 'middle');
});
// 4b. execution services and governance
const ey = y4 + 124, eh = h4 - 124;
rect(X0, ey, CW, eh, '#FBF4E2', '#D9B86A', 6);
text(MID, ey + 30, 'Execution Services & Governance — run identically for every engine', 18, '#7A5512', 700, 'middle');
const ex = [
  [Fa.FaFileAlt, 'NL → SQL on Certified Views', 'only gold views and metric views, rules read live', TEALD, false],
  [Fa.FaDatabase, 'Controlled Execution', 'runs as the app’s service principal · users get no data access', TEALD, false],
  [Fa.FaShieldAlt, 'Checks + Audit', 'figures reconciled · AI judge · 9-stage trace, every call logged', MAGENTA, true],
  [Fa.FaChartBar, 'Observability Layer', 'quality, faithfulness, drift, evaluations, cost', TEALD, false],
];
const xw = (CW - 40 - 3 * 20) / 4;
ex.forEach(([I, t, s, c, sec], i) => {
  const x = X0 + 20 + i * (xw + 20);
  rect(x, ey + 46, xw, eh - 62, '#FFFFFF', sec ? MAGENTA : '#D9B86A', 8, 1.6);
  icon(I, x + xw / 2 - 20, ey + 58, 40, sec ? MAGENTA : '#475569');
  text(x + xw / 2, ey + 128, t, 17, sec ? MAGENTA : '#7A5512', 700, 'middle');
  text(x + xw / 2, ey + 152, s, 13, sec ? MAGENTA : '#7A5512', 400, 'middle');
});

// 5. Governed data layer
const y5 = y4 + h4 + 20, h5 = 46;
num(5, y5 + h5 / 2);
rect(X0, y5, CW, h5, '#17A79A', 'none', 8);
text(MID, y5 + 29, 'Governed Data Layer · Unity Catalog certified views, a metric view & 16 business rules · Lakebase for conversations, cache and audit log', 16.5, '#FFFFFF', 700, 'middle');

// ---- Built-in on every answer (horizontal bars, ConverseIQ style)
const by = y5 + h5 + 34;
text(X0, by, 'BUILT IN ON EVERY ANSWER', 15, TEALD, 800);
const bars = ['Guardrails: PII masked, injection blocked', 'Business rules as data', 'Every figure reconciled', 'Full audit trail', 'One app permission, no data access', 'Idle stop & cost tracking'];
const bw = (CW - 5 * 14) / 6;
bars.forEach((b, i) => {
  const x = X0 + i * (bw + 14);
  rect(x, by + 14, bw, 52, NAVY, 'none', 8);
  text(x + 22, by + 46, '✓', 18, '#5EEAD4', 800);
  const words = b.split(' '); let l1 = '', l2 = '';
  for (const w of words) { if ((l1 + ' ' + w).trim().length <= 24 && !l2) l1 = (l1 + ' ' + w).trim(); else l2 = (l2 + ' ' + w).trim(); }
  if (l2) { text(x + 44, by + 37, l1, 14.5, '#FFFFFF', 700); text(x + 44, by + 56, l2, 14.5, '#FFFFFF', 700); }
  else text(x + 44, by + 46, l1, 14.5, '#FFFFFF', 700);
});
const sy = by + 82;
rect(X0, sy, CW, 66, '#062A33', 'none', 10);
text(X0 + 26, sy + 28, 'Governed agentic design', 19, '#2DD4BF', 700);
text(X0 + 26, sy + 52, 'Every answer goes through the router, an approved engine and the checks — narrow prompts, controlled execution, full audit trail. People never get database access.', 15, '#E2E8F0', 400, 'start', 'font-style="italic"');

// ---- Legend and footer
const ly = sy + 66 + 26;
text(X0, ly, 'LensS Collections Intelligence for Optus · powered by Concentrix · Concentrix Data & Analytics Practice', 13, MUTED);
const lg = [[TEAL, 'Functional', ''], [MAGENTA, 'Security & governance', ''], ['#FFFFFF', 'Ready to add', '6 4']];
let lx = 1300;
lg.forEach(([c, t, d]) => { rect(lx, ly - 13, 22, 16, c, d ? NAVY : 'none', 3, 1.5, d); text(lx + 30, ly, t, 13.5, INK); lx += t.length * 8 + 62; });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>`;
fs.writeFileSync('D:/Optus_LensS_Collections/docs/LensS_Optus_Agentic_Architecture.svg', svg);
sharp(Buffer.from(svg), { density: 192 }).png().toFile('D:/Optus_LensS_Collections/docs/LensS_Optus_Agentic_Architecture.png')
  .then((i) => console.log('png', i.width, 'x', i.height)).catch((e) => { console.error(e); process.exit(1); });
