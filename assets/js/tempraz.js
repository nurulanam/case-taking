/* ==========================================================================
   Tempraz Expert System — ডাঃ পরিনাজ হুমরানওয়ালা
   সম্পূর্ণ বাংলা · ৩-কলাম ইন্টারেক্টিভ লেআউট
   ========================================================================== */

'use strict';

/* ── State ─────────────────────────────────────────────────── */
const state = {
  data      : null,           // loaded JSON
  curTemp   : null,           // active temperament id
  curCat    : 'all',          // active category filter
  selections: {}              // { traitId: { intensity:1|2|3, tempId, rubric, text, scores } }
};

/* ── Category icons ─────────────────────────────────────────── */
const CAT_ICONS = {
  core      : 'bx-star',
  mental    : 'bx-brain',
  physical  : 'bx-body',
  behavioral: 'bx-run',
  stress    : 'bx-wind'
};

/* ── Init ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  fetch('assets/data/tempraz.json')
    .then(r => r.json())
    .then(json => {
      state.data = json;
      buildLeft();
      buildCatList();
      updateStats();
      buildTheory();
      updateChart({ tempScores: {} });
      // auto-select first temperament
      const firstId = Object.keys(json.temperaments)[0];
      selectTemp(firstId);
    })
    .catch(e => console.error('Tempraz data লোড ব্যর্থ:', e));
});

/* ══════════════════════════════════════════════════════════════
   LEFT PANEL
══════════════════════════════════════════════════════════════ */
function buildLeft() {
  const { temperaments } = state.data;
  const container = document.getElementById('tzTempList');
  container.innerHTML = '';

  Object.values(temperaments).forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tz-temp-btn';
    btn.id = `tzTb-${t.id}`;
    btn.dataset.id = t.id;
    btn.style.setProperty('--tc', t.color);

    // count traits
    const totalTraits = Object.values(t.traits).reduce((s, arr) => s + arr.length, 0);

    btn.innerHTML = `
      <span class="tz-tb-dot" style="background:${t.color}"></span>
      <i class="bx ${t.icon} tz-tb-icon" style="color:${t.color}"></i>
      <span class="tz-tb-label">${t.name}</span>
      <span class="tz-tb-count">${totalTraits}</span>
    `;
    btn.addEventListener('click', () => selectTemp(t.id));
    container.appendChild(btn);
  });
}

function buildCatList() {
  const { categories } = state.data;
  const container = document.getElementById('tzCatList');
  container.innerHTML = '';

  // "All" button
  const allBtn = makeCatBtn('all', 'সব বৈশিষ্ট্য', 'bx-grid-alt');
  container.appendChild(allBtn);

  categories.forEach(cat => {
    container.appendChild(makeCatBtn(cat.id, cat.label, CAT_ICONS[cat.id] || 'bx-list-ul'));
  });
}

function makeCatBtn(id, label, icon) {
  const btn = document.createElement('button');
  btn.className = 'tz-cat-btn' + (id === state.curCat ? ' active' : '');
  btn.dataset.cat = id;
  btn.innerHTML = `<i class="bx ${icon}"></i>${label}`;
  btn.addEventListener('click', () => selectCat(id));
  return btn;
}

function selectTemp(id) {
  state.curTemp = id;
  // update left buttons
  document.querySelectorAll('.tz-temp-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
  renderMiddle();
}

function selectCat(id) {
  state.curCat = id;
  document.querySelectorAll('.tz-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === id);
  });
  renderMiddle();
}

/* ══════════════════════════════════════════════════════════════
   MIDDLE PANEL
══════════════════════════════════════════════════════════════ */
function renderMiddle() {
  if (!state.curTemp) return;
  const t = state.data.temperaments[state.curTemp];

  // Header
  const ic   = document.getElementById('tzMidIc');
  const name = document.getElementById('tzMidName');
  const sub  = document.getElementById('tzMidSub');

  ic.style.background  = t.colorBg;
  ic.style.border      = `1px solid ${t.colorBorder}`;
  ic.innerHTML = `<i class="bx ${t.icon}" style="color:${t.color};font-size:1rem;"></i>`;
  name.textContent     = t.name;
  name.style.color     = t.color;
  sub.textContent      = t.description;

  // Build trait list
  const list = document.getElementById('tzTraitList');
  list.innerHTML = '';

  const cats = state.data.categories;
  const catFilter = state.curCat;

  const renderCat = (cat) => {
    const items = t.traits[cat.id];
    if (!items || items.length === 0) return;

    const grp = document.createElement('div');
    grp.className = 'tz-trait-group';
    grp.dataset.cat = cat.id;
    if (catFilter !== 'all' && catFilter !== cat.id) {
      grp.style.display = 'none';
    }

    const label = document.createElement('div');
    label.className = 'tz-trait-cat-label';
    label.innerHTML = `<i class="bx ${CAT_ICONS[cat.id] || 'bx-list-ul'}" style="margin-right:4px;"></i>${cat.label}`;
    grp.appendChild(label);

    items.forEach(trait => {
      grp.appendChild(makeTraitRow(trait, state.curTemp, t.color, cat.id));
    });

    list.appendChild(grp);
  };

  cats.forEach(renderCat);
}

function makeTraitRow(trait, tempId, color, catId) {
  const sel = state.selections[trait.id];
  const intensity = sel ? sel.intensity : 0;
  const isSelected = intensity > 0;

  const row = document.createElement('div');
  row.className = 'tz-trait-row' + (isSelected ? ' selected' : '');
  row.dataset.id = trait.id;
  row.style.setProperty('--tc', color);

  // Intensity pips
  const pips = [1, 2, 3].map(i => {
    return `<span class="tz-int-pip${i <= intensity ? ' on' : ''}"></span>`;
  }).join('');

  // same category icon as the group header, repeated beside each trait —
  // the category (mental/physical/behavioral/stress/core) is real data
  // already on the trait, this just makes it visible without opening the
  // group label above
  const catIcon = CAT_ICONS[catId] || 'bx-list-ul';

  row.innerHTML = `
    <i class="bx ${catIcon} tz-tr-icon"></i>
    <span class="tz-tr-text">${trait.text}</span>
    <span class="tz-int-label">${isSelected ? intensity : ''}</span>
    <span class="tz-tr-intens">${pips}</span>
  `;

  row.addEventListener('click', () => toggleTrait(trait, tempId, color));
  return row;
}

function toggleTrait(trait, tempId, color) {
  const cur = state.selections[trait.id];
  const curIntens = cur ? cur.intensity : 0;
  const nextIntens = (curIntens + 1) % 4;  // 0→1→2→3→0

  if (nextIntens === 0) {
    delete state.selections[trait.id];
  } else {
    state.selections[trait.id] = {
      intensity: nextIntens,
      tempId,
      color,
      rubric: trait.rubric,
      text  : trait.text,
      scores: trait.scores || {}
    };
  }

  // Update just this row without full re-render
  updateTraitRow(trait.id, nextIntens, color);
  updateRight();
  updateSelBadge();
  updateClearBtn();
}

function updateTraitRow(traitId, intensity, color) {
  const row = document.querySelector(`.tz-trait-row[data-id="${traitId}"]`);
  if (!row) return;

  const isSelected = intensity > 0;
  row.classList.toggle('selected', isSelected);

  // pips
  const pips = row.querySelectorAll('.tz-int-pip');
  pips.forEach((pip, i) => pip.classList.toggle('on', i < intensity));

  // label
  const lbl = row.querySelector('.tz-int-label');
  if (lbl) lbl.textContent = isSelected ? intensity : '';
}

/* ══════════════════════════════════════════════════════════════
   RIGHT PANEL
══════════════════════════════════════════════════════════════ */
function updateRight() {
  const sels = Object.values(state.selections);
  const count = sels.length;

  // Update count badge
  const countBadge = document.getElementById('tzRightCount');
  if (countBadge) countBadge.textContent = `${toBanglaDigit(count)} বৈশিষ্ট্য`;

  const emptyState = document.getElementById('tzEmptyState');
  const resultArea = document.getElementById('tzResultArea');

  if (count === 0) {
    emptyState.style.display = '';
    resultArea.style.display  = 'none';
    const rxList = document.getElementById('tzRxList');
    if (rxList) {
      rxList.innerHTML = '<div class="tz-empty" style="min-height:80px;padding:1rem;"><p>বৈশিষ্ট্য নির্বাচিত হলে ওষুধ দেখাবে।</p></div>';
    }
    updateChart({ tempScores: {} });
    return;
  }

  emptyState.style.display = 'none';
  resultArea.style.display  = '';

  // ── TQ Score Box ──
  const scores = computeScores();
  const topTemp = getTopTemp(scores);
  renderTqBox(topTemp, count);

  // ── Rubrics ──
  renderRubrics(sels);

  // ── Remedies ──
  renderRemedies(scores);

  // ── Chart ──
  updateChart(scores);
}

function computeScores() {
  // score per temperament (from selections)
  const tempScores = { sanguine: 0, choleric: 0, melancholic: 0, phlegmatic: 0, nervous: 0 };
  // score per remedy abbreviation
  const rxScores = {};

  Object.values(state.selections).forEach(sel => {
    tempScores[sel.tempId] = (tempScores[sel.tempId] || 0) + sel.intensity;
    Object.entries(sel.scores).forEach(([rx, weight]) => {
      rxScores[rx] = (rxScores[rx] || 0) + weight * sel.intensity;
    });
  });

  return { tempScores, rxScores };
}

function getTopTemp(scores) {
  const { tempScores } = scores;
  return Object.entries(tempScores).sort((a, b) => b[1] - a[1])[0];
}

function renderTqBox(topTemp, count) {
  const box = document.getElementById('tzTqBox');
  if (!topTemp || !topTemp[1]) {
    box.style.display = 'none';
    return;
  }
  const [tempId, score] = topTemp;
  const t = state.data.temperaments[tempId];
  if (!t) { box.style.display = 'none'; return; }

  box.style.display = '';
  box.style.background = `linear-gradient(135deg, ${adjustColor(t.color, -40)}, ${t.color})`;
  box.innerHTML = `
    <div>
      <div class="tz-tq-label">প্রধান স্বভাব</div>
      <div class="tz-tq-name">${t.name} — ${t.subtitle}</div>
    </div>
    <div class="tz-tq-score" style="margin-left:auto;">${toBanglaDigit(score)}<small>pts</small></div>
  `;

  renderPersonality(t);
}

// A short personality read-out for whichever temperament is currently
// leading — uses the temperament's own already-written `description` and
// `core_nature` fields (same text shown in the middle column header), not a
// new summary invented for this result view.
function renderPersonality(t) {
  const box = document.getElementById('tzPersonality');
  if (!box) return;
  if (!t.description && !t.core_nature) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.style.borderLeftColor = t.color;
  box.innerHTML = `
    <i class="bx ${t.icon || 'bx-user'}" style="color:${t.color}"></i>
    <div>
      ${t.description ? `<p>${t.description}</p>` : ''}
      ${t.core_nature ? `<p class="tz-personality-core">${t.core_nature}</p>` : ''}
    </div>
  `;
}

function renderRubrics(sels) {
  const list = document.getElementById('tzRubricList');
  list.innerHTML = '';

  if (sels.length === 0) {
    list.innerHTML = '<div class="tz-empty" style="min-height:60px;"><p>কোনো বৈশিষ্ট্য নির্বাচিত হয়নি।</p></div>';
    return;
  }

  // Sort by intensity desc
  const sorted = [...sels].sort((a, b) => b.intensity - a.intensity);

  sorted.forEach(sel => {
    const t = state.data.temperaments[sel.tempId];
    const item = document.createElement('div');
    item.className = 'tz-rubric-item';
    item.innerHTML = `
      <span class="tz-rubric-dot" style="background:${sel.color}"></span>
      <span class="tz-rubric-text"><strong>${sel.text}</strong> → ${sel.rubric}</span>
      <span class="tz-rubric-intens" style="background:${t.colorBg};color:${t.color};">
        তীব্র ${sel.intensity}
      </span>
    `;
    list.appendChild(item);
  });
}

function renderRemedies(scores) {
  const { rxScores } = scores;
  const list = document.getElementById('tzRxList');
  list.innerHTML = '';

  const sorted = Object.entries(rxScores).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (sorted.length === 0) {
    list.innerHTML = '<div class="tz-empty" style="min-height:60px;"><p>বৈশিষ্ট্য নির্বাচিত হলে ওষুধ দেখাবে।</p></div>';
    return;
  }

  const maxScore = sorted[0][1];

  sorted.forEach(([abbr, score]) => {
    const rxInfo = state.data.remedyInfo[abbr];
    const name = rxInfo ? rxInfo.name : abbr;
    const pct  = maxScore > 0 ? (score / maxScore) * 100 : 0;

    // find keynote from current temperament or any
    let keynote = '';
    const curT = state.curTemp && state.data.temperaments[state.curTemp];
    if (curT) {
      const rx = curT.remedies.find(r => r.abbr === abbr);
      if (rx) keynote = rx.keynote;
    }
    if (!keynote) {
      for (const t of Object.values(state.data.temperaments)) {
        const rx = t.remedies.find(r => r.abbr === abbr);
        if (rx) { keynote = rx.keynote; break; }
      }
    }

    const item = document.createElement('div');
    item.className = 'tz-rx-item';
    item.innerHTML = `
      <div class="tz-rx-top">
        <span class="tz-rx-abbr">${abbr}</span>
        <span class="tz-rx-name">${name}</span>
        <span class="tz-rx-score">${toBanglaDigit(score)}</span>
      </div>
      <div class="tz-rx-bar-track">
        <div class="tz-rx-bar-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      ${keynote ? `<div class="tz-rx-note">${keynote}</div>` : ''}
    `;
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════════════
   UI helpers
══════════════════════════════════════════════════════════════ */
function updateSelBadge() {
  const count = Object.keys(state.selections).length;
  const badge = document.getElementById('tzSelBadge');
  if (badge) badge.textContent = toBanglaDigit(count);
}

function updateClearBtn() {
  const btn = document.getElementById('tzClearBtn');
  if (!btn) return;
  const hasAny = Object.keys(state.selections).length > 0;
  btn.disabled = !hasAny;
}

document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('tzClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selections = {};
      updateSelBadge();
      updateClearBtn();
      renderMiddle();
      updateRight();
    });
  }
});

/* ══════════════════════════════════════════════════════════════
   STATS (page header)
══════════════════════════════════════════════════════════════ */
function updateStats() {
  const { temperaments, remedyInfo } = state.data;

  let totalTraits = 0;
  Object.values(temperaments).forEach(t => {
    Object.values(t.traits).forEach(arr => { totalTraits += arr.length; });
  });

  const totalRx = Object.keys(remedyInfo).length;

  const elT = document.getElementById('tzTotalTraits');
  const elR = document.getElementById('tzTotalRemedies');
  if (elT) elT.textContent = toBanglaDigit(totalTraits);
  if (elR) elR.textContent = toBanglaDigit(totalRx);
}

/* ══════════════════════════════════════════════════════════════
   THEORY SECTION
══════════════════════════════════════════════════════════════ */
function buildTheory() {
  const { theory } = state.data;
  const container = document.getElementById('tzTheory');
  if (!container || !theory) return;

  const principlesHTML = theory.principles.map((p, i) => `
    <div class="tz-principle-row">
      <span class="tz-pr-num">${toBanglaDigit(i + 1)}</span>
      <span>${p}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="tz-theory-card">
      <h4><i class='bx bx-info-circle' style="color:#7c3aed;margin-right:6px;"></i>Tempraz কী?</h4>
      <p style="margin-bottom:0.75rem;">${theory.intro}</p>
      <p>${theory.core}</p>
    </div>
    <div class="tz-theory-card">
      <h4><i class='bx bx-list-check' style="color:#7c3aed;margin-right:6px;"></i>মূলনীতি</h4>
      ${principlesHTML}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   Utility helpers
══════════════════════════════════════════════════════════════ */
function toBanglaDigit(n) {
  return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}

function adjustColor(hex, amount) {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0xFF) + amount));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  } catch { return hex; }
}

/* Radar chart, drawn as inline SVG.

   This used to be Chart.js from a CDN, which meant the one chart in an app that
   advertises "সম্পূর্ণ অফলাইন" was the only thing that could not render offline —
   the library never loaded, the guard returned early, and the panel sat empty
   with no explanation. Five axes is little enough geometry to draw directly, so
   there is no dependency to miss: the SVG scales with its box, themes off the
   same CSS variables as the rest of the page, and each temperament keeps the
   colour it is given everywhere else in the UI. */
const TZ_ORDER = ['sanguine', 'choleric', 'melancholic', 'phlegmatic', 'nervous'];

function updateChart(scores) {
  const host = document.getElementById('tzRadarChart');
  if (!host) return;

  const vals = TZ_ORDER.map(id =>
    (scores && scores.tempScores && scores.tempScores[id]) ? scores.tempScores[id] : 0);
  const max = Math.max(4, ...vals);          // floor of 4 keeps a lone pick from filling the web
  const temps = (state.data && state.data.temperaments) || {};

  const S = 240, C = S / 2, R = S * 0.32;    // viewBox size, centre, outer radius
  const ang = i => (Math.PI * 2 * i / TZ_ORDER.length) - Math.PI / 2;   // start at 12 o'clock
  const pt = (i, r) => [C + Math.cos(ang(i)) * r, C + Math.sin(ang(i)) * r];
  const poly = r => TZ_ORDER.map((_, i) => pt(i, r).map(n => n.toFixed(1)).join(',')).join(' ');

  // a card border can stay subtle by design, but a chart's own gridlines need
  // more contrast to read as a shape rather than disappear into the card —
  // so the radar uses --chart-grid (defined per-theme) instead of --border.
  const rings = [0.25, 0.5, 0.75, 1]
    .map(f => `<polygon points="${poly(R * f)}" fill="none" stroke="var(--chart-grid, var(--border))" stroke-width="1"/>`)
    .join('');
  const spokes = TZ_ORDER.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"
            stroke="var(--chart-grid, var(--border))" stroke-width="1"/>`;
  }).join('');

  const shape = TZ_ORDER
    .map((_, i) => pt(i, R * (vals[i] / max)).map(n => n.toFixed(1)).join(','))
    .join(' ');
  const dots = TZ_ORDER.map((id, i) => {
    if (!vals[i]) return '';
    const [x, y] = pt(i, R * (vals[i] / max));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"
            fill="${temps[id]?.color || '#7c3aed'}" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');

  // labels sit outside the web; the two lower-side ones are nudged so a long
  // Bangla name does not collide with the polygon it belongs to
  const labels = TZ_ORDER.map((id, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - C) < 6 ? 'middle' : (x > C ? 'start' : 'end');
    const name = (temps[id]?.name || id);
    const v = vals[i];
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"
              font-size="10" font-weight="700" fill="var(--text-muted)">${esc(name)}</text>
            <text x="${x.toFixed(1)}" y="${(y + 12).toFixed(1)}" text-anchor="${anchor}"
              font-size="10" font-weight="800"
              fill="${v ? (temps[id]?.color || '#7c3aed') : 'var(--text-light)'}">${toBanglaDigit(v)}</text>`;
  }).join('');

  const empty = vals.every(v => !v);
  host.innerHTML = `
    <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="স্বভাব স্কোরের রাডার চিত্র"
         preserveAspectRatio="xMidYMid meet">
      ${rings}${spokes}
      ${empty ? '' : `<polygon points="${shape}" fill="rgba(124,58,237,0.18)"
                        stroke="#7c3aed" stroke-width="2" stroke-linejoin="round"/>`}
      ${dots}${labels}
    </svg>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
