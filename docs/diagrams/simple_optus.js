// LensS: how it works, for a non-technical audience (SVG → PNG via sharp).
const fs = require('fs');
const sharp = require('sharp');

const W = 1920, H = 1030;
const NAVY = '#0B2545', TEAL = '#0E9384', AQUA = '#25E2CC', INK = '#0F172A', SLATE = '#475569', MUTED = '#64748B';
const SOFT = '#F1F5F9', LINE = '#E2E8F0', TEALSOFT = '#E3F8F5';
const FONT = 'Segoe UI, Calibri, Arial, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = [];
const add = (s) => P.push(s);
function wrap(t, size, width) {
  const max = Math.max(4, Math.floor(width / (size * 0.53)));
  const out = []; let line = '';
  for (const w of String(t).split(' ')) {
    if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}
const text = (x, y, s, size, color = INK, weight = 400, anchor = 'start') =>
  add(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`);
const lines = (x, y, arr, size, color = SLATE, weight = 400, lh = 1.35, anchor = 'start') => arr.forEach((l, i) => text(x, y + i * size * lh, l, size, color, weight, anchor));
const rect = (x, y, w, h, fill, stroke = 'none', r = 18, sw = 1.5, dash = '') =>
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
const arrow = (x1, y, x2, color = TEAL) => add(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="4" marker-end="url(#ah)"/>`);

add(`<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${TEAL}"/></marker></defs>`);
add(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);

text(70, 92, 'How LensS works for Optus', 46, NAVY, 700);
add(`<rect x="70" y="104" width="110" height="5" rx="2" fill="#FFCC00"/>`);
rect(720, 54, 104, 28, '#E0F5F3', '#9ADCD6', 14, 1.2);
text(720 + 52, 73, 'FOR OPTUS', 13, '#004D49', 800, 'middle');

text(70, 140, 'Ask a question in plain English, get a checked answer from Optus’s collections and contact-centre data, all inside Databricks.', 21, MUTED);

// ---- Four stages
const stages = [
  { n: 1, title: 'People', sub: 'Collections and contact-centre leaders and analysts sign in once with their work account.', items: ['Open LensS in a browser', 'See only what they are allowed to', 'Never touch the raw data'] },
  { n: 2, title: 'The LensS app', sub: 'One place to see the story and ask questions.', items: ['Command Center: promises, why they break, the contact centre', 'Explorer: filter and drill in', 'Assistant: ask anything, quick or deep', 'Observability: quality, safety, cost'] },
  { n: 3, title: 'The brains', sub: 'AI that understands the question and finds the answer.', items: ['Genie turns questions into data queries', 'AI models pick quick or deep, and check answers', 'Remembers the conversation'], hero: true },
  { n: 4, title: 'Trusted data', sub: 'Optus’s collections data, cleaned and certified.', items: ['Accounts, promises to pay, calls: first contact resolution, transfers, repeats', 'Business rules in one place', 'Every definition written down'] },
];
const sx = 70, sw = 405, sg = 60, sy = 190, sh = 420;
stages.forEach((s, i) => {
  const x = sx + i * (sw + sg);
  const hero = s.hero;
  rect(x, sy, sw, sh, hero ? TEAL : SOFT, hero ? TEAL : LINE);
  add(`<circle cx="${x + 52}" cy="${sy + 58}" r="28" fill="${hero ? '#FFFFFF' : TEAL}"/>`);
  text(x + 52, sy + 69, String(s.n), 28, hero ? TEAL : '#FFFFFF', 800, 'middle');
  text(x + 96, sy + 70, s.title, 30, hero ? '#FFFFFF' : NAVY, 700);
  lines(x + 32, sy + 128, wrap(s.sub, 19, sw - 64), 19, hero ? '#E6FFFB' : SLATE);
  let y = sy + 128 + wrap(s.sub, 19, sw - 64).length * 26 + 30;
  s.items.forEach((it) => {
    const wl = wrap(it, 18, sw - 76);
    add(`<circle cx="${x + 40}" cy="${y - 6}" r="5" fill="${hero ? AQUA : TEAL}"/>`);
    lines(x + 58, y, wl, 18, hero ? '#FFFFFF' : INK, 600);
    y += wl.length * 24 + 16;
  });
  if (i < 3) arrow(x + sw + 6, sy + sh / 2, x + sw + sg - 8);
});

// ---- Safety band
const by = 640;
rect(70, by, 1780, 130, NAVY, NAVY);
text(110, by + 50, 'Safety and trust on every step', 26, AQUA, 700);
const checks = ['Personal details are masked', 'Unsafe or off-topic requests are stopped', 'Every number is checked against the data', 'Every answer is logged and can be reviewed'];
const cw = 1780 / 4;
checks.forEach((c, i) => {
  add(`<circle cx="${110 + i * cw}" cy="${by + 94}" r="6" fill="${AQUA}"/>`);
  text(126 + i * cw, by + 101, c, 18, '#FFFFFF', 600);
});

// ---- Promises
const py = 806;
const promises = [
  ['Data stays home', 'Everything runs inside the Databricks workspace; nothing is sent elsewhere.'],
  ['Answers you can trust', 'Answers come only from certified data, with the figures checked and the source shown.'],
  ['Simple to run', 'Set up with one command, tested before every release, and switches itself off when nobody is using it.'],
];
const pw = (1780 - 2 * 40) / 3;
promises.forEach(([t, d], i) => {
  const x = 70 + i * (pw + 40);
  rect(x, py, pw, 150, TEALSOFT, '#BFE9E3');
  text(x + 32, py + 50, t, 24, NAVY, 700);
  lines(x + 32, py + 88, wrap(d, 18, pw - 64), 18, SLATE);
});

text(70, 1006, 'LensS Collections Intelligence for Optus  ·  powered by Concentrix  ·  Concentrix Data & Analytics Practice', 15, MUTED);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>`;
fs.writeFileSync('D:/Optus_LensS_Collections/docs/LensS_Optus_How_It_Works.svg', svg);
sharp(Buffer.from(svg), { density: 192 }).png().toFile('D:/Optus_LensS_Collections/docs/LensS_Optus_How_It_Works.png')
  .then((i) => console.log('png', i.width, 'x', i.height)).catch((e) => { console.error(e); process.exit(1); });
