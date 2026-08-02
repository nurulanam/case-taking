// ===================== Data =====================
let DB = null;
let MIASM_IDS = [];
let RUBRICS = [];            // flattened: {key, catId, catBn, catEn, bn, en, miasms[], weight}

async function loadDB() {
  try {
    const resp = await fetch('assets/data/miasm.json');
    if (!resp.ok) throw new Error('http ' + resp.status);
    DB = await resp.json();
  } catch (e) {
    // file:// or missing json — fall back to the inline copy in miasm.js
    DB = window.MIASMS_DB_INLINE || null;
    if (!DB) { console.error('মায়াজম ডাটাবেস লোড করা যায়নি', e); return; }
  }
  MIASM_IDS = Object.keys(DB.miasms);
  RUBRICS = [];
  DB.rubic_categories.categories.forEach(cat => {
    cat.rubles.forEach((r, i) => RUBRICS.push(Object.assign({
      key: cat.id + ':' + i,
      catId: cat.id, catBn: cat.name_bn, catEn: cat.name_en,
      type: 'particular', pqrs: false, importance: 2, reliability: 1   // v1 defaults
    }, r)));
  });
  init();
}

// ===================== Helpers =====================
const bnNum = v => String(v).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const bnDec = v => bnNum(Number(v).toFixed(1));
const M = id => DB.miasms[id];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===================== State =====================
const STORE_KEY = 'miasm_selected_v1';
const STATE = { selected: new Set(), search: '', cat: 'all', miasm: 'all', type: 'all', analysis: null };

function saveSel() { try { localStorage.setItem(STORE_KEY, JSON.stringify([...STATE.selected])); } catch (e) {} }
function loadSel() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    const valid = new Set(RUBRICS.map(r => r.key));
    raw.forEach(k => { if (valid.has(k)) STATE.selected.add(k); });
  } catch (e) {}
}

// ===================== Scoring engine =====================
// tuning targets now live in miasm.json → scoring_model (editable without touching code)
const MIN_SYMPTOMS = 3;
const CFG = () => DB.scoring_model || {};
const target = id => {
  const c = (CFG().confidence_components || []).find(x => x.id === id);
  return c ? c.target : (id === 'separation' ? 0.4 : 3);
};

const MIXED_NAMES = {
  'psora|sycosis':      { bn: 'সোরো-সাইকোটিক', en: 'Psoro-Sycotic' },
  'psora|syphilis':     { bn: 'সোরো-সিফিলিটিক', en: 'Psoro-Syphilitic' },
  'psora|tubercular':   { bn: 'সোরো-টিউবারকুলার', en: 'Psoro-Tubercular' },
  'cancer|psora':       { bn: 'সোরো-ক্যান্সার', en: 'Psoro-Cancer' },
  'sycosis|syphilis':   { bn: 'সাইকো-সিফিলিটিক', en: 'Syco-Syphilitic' },
  'sycosis|tubercular': { bn: 'টিউবারকুলার-সাইকোটিক', en: 'Tubercular-Sycotic' },
  'cancer|sycosis':     { bn: 'সাইকো-ক্যান্সার', en: 'Syco-Cancer' },
  'syphilis|tubercular':{ bn: 'টিউবারকুলার-সিফিলিটিক', en: 'Tubercular-Syphilitic' },
  'cancer|syphilis':    { bn: 'সিফিলো-ক্যান্সার', en: 'Syphilo-Cancer' },
  'cancer|tubercular':  { bn: 'টিউবারকুলার-ক্যান্সার', en: 'Tubercular-Cancer' }
};

function contributionOf(r, m) {
  const SM = DB.scoring_model || {};
  const impMult = (SM.importance_multiplier || { '1': 0.8, '2': 1.0, '3': 1.3 })[String(r.importance || 2)] || 1;
  const pqrsBonus = r.pqrs ? (SM.pqrs_bonus || 1.4) : 1;
  const rel = (typeof r.reliability === 'number') ? r.reliability : 1;
  // v2: every miasm carries its OWN weight for this rubric.
  // v1 fallback (data without `weights`): split the shared weight equally.
  const base = (r.weights && r.weights[m] != null) ? r.weights[m] : (r.weight / r.miasms.length);
  return base * impMult * pqrsBonus * rel;
}

function analyse() {
  const SM = DB.scoring_model || {};
  const per = {};
  MIASM_IDS.forEach(id => per[id] = { id: id, score: 0, raw: 0, items: [] });
  const catTotals = {};
  const chosen = RUBRICS.filter(r => STATE.selected.has(r.key));

  const typeCount = { mental: 0, general: 0, particular: 0, modality: 0, pathology: 0 };
  let pqrsCount = 0;

  chosen.forEach(r => {
    typeCount[r.type] = (typeCount[r.type] || 0) + 1;
    if (r.pqrs) pqrsCount++;
    r.miasms.forEach(m => {
      if (!per[m]) return;
      const c = contributionOf(r, m);
      per[m].score += c;
      per[m].raw += (r.weights && r.weights[m] != null) ? r.weights[m] : r.weight;
      per[m].items.push({
        bn: r.bn, en: r.en, catBn: r.catBn, type: r.type, pqrs: r.pqrs,
        importance: r.importance, reliability: r.reliability,
        base: (r.weights && r.weights[m] != null) ? r.weights[m] : r.weight / r.miasms.length,
        share: c, shared: r.miasms.length
      });
    });
    catTotals[r.catId] = catTotals[r.catId] || { bn: r.catBn, en: r.catEn, total: 0, count: 0 };
    catTotals[r.catId].total += Math.max.apply(null, r.miasms.map(m => contributionOf(r, m)));
    catTotals[r.catId].count += 1;
  });

  const totalScore = MIASM_IDS.reduce((s, id) => s + per[id].score, 0);
  const ranked = MIASM_IDS.map(id => per[id])
    .map(x => Object.assign(x, { pct: totalScore ? (x.score / totalScore) * 100 : 0 }))
    .sort((a, b) => b.score - a.score || b.raw - a.raw);
  ranked.forEach((x, i) => { x.rank = i + 1; x.items.sort((a, b) => b.share - a.share); });

  const dom = ranked[0], sec = ranked[1], third = ranked[2];
  const separation = dom.score > 0 ? (dom.score - sec.score) / dom.score : 0;
  const mixed = detectMixed(ranked);
  const confidence = calcConfidence({ chosen: chosen, pqrsCount: pqrsCount, typeCount: typeCount, separation: separation, mixed: mixed });
  const pattern = detectPattern(chosen, ranked, mixed);

  return {
    chosen: chosen, per: per, ranked: ranked, totalScore: totalScore,
    catTotals: catTotals, dominant: dom, secondary: sec, third: third,
    typeCount: typeCount, pqrsCount: pqrsCount,
    mixed: mixed, confidence: confidence.score, confParts: confidence.parts,
    separation: separation, pattern: pattern
  };
}

// ---------- 7. mixed-miasm detection (four levels, thresholds from data) ----------
function detectMixed(ranked) {
  const t = (DB.scoring_model && DB.scoring_model.mixed_thresholds) ||
            { mixed_secondary: 0.5, mixed_equal: 0.75, tri_second: 0.7, tri_third: 0.6 };
  const [d1, d2, d3] = ranked;
  const empty = { level: 'single', label_bn: 'একক প্রাধান্য', label_en: 'Single miasm', ids: [d1.id], name: null, r2: 0, r3: 0 };
  if (!d1 || d1.score <= 0) return empty;

  const r2 = d2 ? d2.score / d1.score : 0;
  const r3 = d3 ? d3.score / d1.score : 0;
  const pairName = (a, b) => MIXED_NAMES[[a, b].sort().join('|')] ||
    { bn: M(a).name_bn + ' + ' + M(b).name_bn, en: M(a).name_en + '-' + M(b).name_en };

  if (r2 >= t.tri_second && r3 >= t.tri_third) {
    return {
      level: 'tri', label_bn: 'ত্রি-মায়াজমিক', label_en: 'Tri-miasmatic',
      ids: [d1.id, d2.id, d3.id], r2: r2, r3: r3,
      name: { bn: [d1, d2, d3].map(x => M(x.id).name_bn.replace(' মায়াজম', '')).join(' + '),
              en: [d1, d2, d3].map(x => M(x.id).name_en).join(' + ') }
    };
  }
  if (r2 >= t.mixed_equal) {
    return { level: 'mixed_equal', label_bn: 'সমশক্তির মিশ্রণ', label_en: 'Co-dominant mixed',
             ids: [d1.id, d2.id], r2: r2, r3: r3, name: pairName(d1.id, d2.id) };
  }
  if (r2 >= t.mixed_secondary) {
    return { level: 'mixed_secondary', label_bn: 'প্রধান + শক্তিশালী সহায়ক', label_en: 'Dominant with strong secondary',
             ids: [d1.id, d2.id], r2: r2, r3: r3, name: pairName(d1.id, d2.id) };
  }
  return Object.assign(empty, { r2: r2, r3: r3 });
}

// ---------- 6. confidence from evidence quality, not just score gap ----------
function calcConfidence(ctx) {
  const SM = DB.scoring_model || {};
  const defs = SM.confidence_components || [];
  const penalties = SM.mixed_penalty || {};
  const raw = {
    coverage: ctx.chosen.length,
    characteristic: ctx.pqrsCount,
    mental: ctx.typeCount.mental || 0,
    general: ctx.typeCount.general || 0,
    modality: ctx.typeCount.modality || 0,
    separation: ctx.separation
  };
  let total = 0;
  const parts = defs.map(c => {
    const got = raw[c.id] || 0;
    const ratio = Math.min(1, c.target ? got / c.target : 0);
    total += ratio * c.weight;
    return { id: c.id, bn: c.bn, en: c.en, got: got, target: c.target, ratio: ratio, weight: c.weight };
  });
  const penalty = penalties[ctx.mixed.level] || 0;
  // hard floor: 1–2 symptoms can never look confident, however clean the lead is
  const floorGate = Math.min(1, ctx.chosen.length / 3);
  return {
    score: Math.max(0, Math.round(100 * total * (1 - penalty) * floorGate)),
    parts: parts.concat([{ id: 'penalty', bn: 'মিশ্র মায়াজম পেনাল্টি', en: 'Mixed-miasm penalty',
                           got: ctx.mixed.label_bn, target: null, ratio: -penalty, weight: 0 }])
  };
}

// ---------- 8. disease pattern from the actual symptoms, not just the winner ----------
function detectPattern(chosen, ranked, mixed) {
  const SM = DB.scoring_model || {};
  const defs = SM.disease_patterns || {};
  const fallback = SM.miasm_default_pattern || {};
  const scores = {}; const drivers = {};

  chosen.forEach(r => {
    if (!r.pattern) return;
    const strength = Math.max.apply(null, r.miasms.map(m => contributionOf(r, m)));
    scores[r.pattern] = (scores[r.pattern] || 0) + strength;
    (drivers[r.pattern] = drivers[r.pattern] || []).push(r.bn);
  });

  // the dominant miasm still contributes a baseline so a tag-less selection is not blank
  const dom = ranked[0];
  if (dom && dom.score > 0) {
    const base = fallback[dom.id];
    if (base) { scores[base] = (scores[base] || 0) + dom.score * 0.25; }
  }
  // no pathology-type rubric at all → the case is still functional
  if (!chosen.some(r => r.type === 'pathology')) {
    scores.functional = (scores.functional || 0) + 1.5;
  }

  const list = Object.entries(scores).map(([k, v]) => ({ id: k, score: v }))
    .sort((a, b) => b.score - a.score);
  if (!list.length) return null;

  const top = list[0], second = list[1];
  const isMixed = mixed.level !== 'single' && second && second.score >= top.score * 0.6;
  const chosenId = isMixed ? 'mixed' : top.id;
  const def = defs[chosenId] || defs[top.id] || { bn: top.id, en: top.id, desc_bn: '' };

  return {
    id: chosenId, bn: def.bn, en: def.en, desc: def.desc_bn,
    combined: isMixed ? [top.id, second.id].map(i => (defs[i] || {}).bn || i) : null,
    drivers: (drivers[top.id] || []).slice(0, 4),
    all: list.map(x => Object.assign({}, x, { bn: (defs[x.id] || {}).bn || x.id }))
  };
}

function confLabel(c) { return c >= 70 ? 'উচ্চ' : c >= 40 ? 'মাঝারি' : 'কম'; }

// ===================== Selection UI =====================
function init() {
  loadSel();
  renderFilters();
  renderRubrics();
  renderWeightLegend();
  renderLogic();
  renderMiasmCards();
  renderComparison();
  document.getElementById('disclaimerText').textContent = DB.metadata.disclaimer;
  bindEvents();
  initTopbar();
  refreshSelectionUI();
  openPanelFromHash();
  sizeWorkspace();
  // fonts/icons landing late can shift the header a few px
  window.addEventListener('load', sizeWorkspace);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeWorkspace);
}

// keep the split workspace exactly one screen tall on desktop
function sizeWorkspace() {
  const grid = document.getElementById('wsGrid');
  if (!grid) return;
  if (window.innerWidth < 1024 || !document.getElementById('panel-analyse').classList.contains('active')) {
    grid.style.height = '';
    return;
  }
  const top = grid.getBoundingClientRect().top + window.scrollY;
  const footer = document.querySelector('.app-footer');
  const fh = footer ? footer.getBoundingClientRect().height : 0;
  const content = document.querySelector('.app-content');
  const padBottom = content ? parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0;
  let h = Math.round(window.innerHeight - top - fh - padBottom);
  // too little room to split the screen — fall back to normal page flow
  if (h < 430) { grid.style.height = ''; return; }
  grid.style.height = h + 'px';
  // self-correct against any chrome the maths missed — the page must not scroll
  const over = document.documentElement.scrollHeight - window.innerHeight;
  if (over > 0) grid.style.height = Math.max(430, h - over) + 'px';
}

let sizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(sizeTimer); sizeTimer = setTimeout(sizeWorkspace, 120); });

function initTopbar() {
  if (typeof Shell === 'undefined') return;
  const btn = Shell.addAction(`<button class="tb-btn" id="tbResult"><i class='bx bx-bar-chart-alt-2'></i><span class="tb-label">ফলাফল</span></button>`);
  if (btn) btn.addEventListener('click', () => {
    const rightBtn = document.querySelector('.ws-sw-btn[data-pane="right"]');
    if (rightBtn && getComputedStyle(rightBtn).display !== 'none') rightBtn.click();
    else document.getElementById('wsRight').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderFilters() {
  const cf = document.getElementById('catFilters');
  cf.insertAdjacentHTML('beforeend',
    `<button class="fbtn active" data-cat="all">সব</button>` +
    DB.rubic_categories.categories.map(c =>
      `<button class="fbtn" data-cat="${c.id}">${c.name_bn}</button>`).join(''));

  const tf = document.getElementById('typeFilters');
  tf.insertAdjacentHTML('beforeend',
    `<button class="fbtn active" data-type="all">সব</button>` +
    Object.entries(CFG().symptom_types || {}).map(([id, t]) =>
      `<button class="fbtn" data-type="${id}">${t.icon} ${t.bn}</button>`).join('') +
    `<button class="fbtn" data-type="pqrs">⭐ শুধু PQRS</button>`);

  const mf = document.getElementById('miasmFilters');
  mf.insertAdjacentHTML('beforeend',
    `<button class="fbtn active" data-miasm="all">সব</button>` +
    MIASM_IDS.map(id =>
      `<button class="fbtn" data-miasm="${id}"><span class="fdot" style="background:${M(id).color_code}"></span>${M(id).name_bn.replace(' মায়াজম', '')}</button>`).join(''));
}

function matches(r) {
  if (STATE.cat !== 'all' && r.catId !== STATE.cat) return false;
  if (STATE.miasm !== 'all' && !r.miasms.includes(STATE.miasm)) return false;
  if (STATE.type === 'pqrs' && !r.pqrs) return false;
  if (STATE.type !== 'all' && STATE.type !== 'pqrs' && r.type !== STATE.type) return false;
  const q = STATE.search.trim().toLowerCase();
  if (q && !(r.bn.toLowerCase().includes(q) || r.en.toLowerCase().includes(q) ||
             r.catBn.toLowerCase().includes(q) || r.catEn.toLowerCase().includes(q) ||
             (r.type || '').includes(q))) return false;
  return true;
}

function updateFilterState() {
  const el = document.getElementById('filterState');
  if (!el) return;
  const bits = [];
  if (STATE.cat !== 'all') bits.push((DB.rubic_categories.categories.find(c => c.id === STATE.cat) || {}).name_bn);
  if (STATE.miasm !== 'all') bits.push(M(STATE.miasm).name_bn.replace(' মায়াজম', ''));
  if (STATE.type === 'pqrs') bits.push('PQRS');
  else if (STATE.type !== 'all') bits.push((CFG().symptom_types[STATE.type] || {}).bn || STATE.type);
  el.textContent = bits.length ? '· ' + bits.join(', ') : '';
}

function renderRubrics() {
  updateFilterState();
  const area = document.getElementById('rubricArea');
  const filtering = STATE.search.trim() || STATE.cat !== 'all' || STATE.miasm !== 'all' || STATE.type !== 'all';
  let html = '';
  let hits = 0;

  let shown = 0;
  DB.rubic_categories.categories.forEach(cat => {
    const rows = RUBRICS.filter(r => r.catId === cat.id && matches(r));
    if (!rows.length) return;
    hits += rows.length;
    shown += 1;
    const chosen = rows.filter(r => STATE.selected.has(r.key)).length;
    html += `<details class="cat-block"${filtering || chosen || shown === 1 ? ' open' : ''}>
      <summary>
        <i class='bx bx-chevron-right cat-caret'></i>
        ${cat.name_bn} <span class="cat-en">${cat.name_en}</span>
        <span class="cat-count ${chosen ? 'has' : ''}">${chosen ? bnNum(chosen) + '/' : ''}${bnNum(rows.length)}</span>
      </summary>
      <div class="rubric-list">
        ${rows.map(r => `
          <label class="rubric ${STATE.selected.has(r.key) ? 'on' : ''}" data-key="${r.key}">
            <input type="checkbox" ${STATE.selected.has(r.key) ? 'checked' : ''}/>
            <span class="rb-txt">
              <span class="rb-bn">${esc(r.bn)}</span>
              <span class="rb-en">${esc(r.en)}</span>
            </span>
            <span class="rb-meta">
              ${r.pqrs ? `<span class="rb-pqrs" title="Peculiar / Queer / Rare / Strange — চারিত্রিক লক্ষণ">⭐ PQRS</span>` : ''}
              <span class="rb-type" title="${(CFG().symptom_types[r.type] || {}).bn || r.type}">${(CFG().symptom_types[r.type] || {}).icon || ''}</span>
              ${r.miasms.map(m => `<span class="mw" style="background:${M(m).color_code}" title="${M(m).name_bn} — ওজন ${bnNum(r.weights ? r.weights[m] : r.weight)}">${bnNum(r.weights ? r.weights[m] : r.weight)}</span>`).join('')}
              <span class="rb-w imp-${r.importance}" title="গুরুত্ব: ${(CFG().importance_label_bn || {})[String(r.importance)] || ''}"><span class="imp-long">${(CFG().importance_label_bn || {})[String(r.importance)] || ''}</span><span class="imp-short">${bnNum(r.importance)}</span></span>
            </span>
          </label>`).join('')}
      </div>
    </details>`;
  });

  area.innerHTML = hits ? html : `<div class="no-hit"><i class='bx bx-search-alt'></i><br/>কোনো লক্ষণ মেলেনি — অন্য শব্দে খুঁজুন বা ফিল্টার বদলান।</div>`;

  area.querySelectorAll('.rubric').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      if (STATE.selected.has(key)) STATE.selected.delete(key); else STATE.selected.add(key);
      el.classList.toggle('on', STATE.selected.has(key));
      saveSel();
      updateCatCounts();
      refreshSelectionUI();
    });
  });
}

function updateCatCounts() {
  document.querySelectorAll('#rubricArea .cat-block').forEach(block => {
    const rows = block.querySelectorAll('.rubric');
    const chosen = [...rows].filter(r => STATE.selected.has(r.dataset.key)).length;
    const badge = block.querySelector('.cat-count');
    badge.textContent = (chosen ? bnNum(chosen) + '/' : '') + bnNum(rows.length);
    badge.classList.toggle('has', chosen > 0);
  });
}

function refreshSelectionUI() {
  const n = STATE.selected.size;
  const enough = n >= MIN_SYMPTOMS;
  document.getElementById('actCount').innerHTML =
    `${bnNum(n)}টি লক্ষণ নির্বাচিত<small>${enough ? 'ডান পাশে লাইভ বিশ্লেষণ চলছে' : `বিশ্লেষণ শুরু হতে আরও ${bnNum(MIN_SYMPTOMS - n)}টি লাগবে`}</small>`;

  const sw = document.getElementById('swCount');
  if (sw) sw.textContent = bnNum(n);

  if (typeof Shell !== 'undefined') {
    Shell.setChip(n ? `${bnNum(n)}টি লক্ষণ নির্বাচিত` : 'কোনো লক্ষণ নির্বাচিত নয়', n ? 'bx-list-check' : 'bx-list-ul', !n);
  }

  const live = document.getElementById('liveCard');
  if (!n) {
    live.style.display = 'none';
    STATE.analysis = null;
    showEmptyResult();
    return;
  }
  live.style.display = '';
  const a = analyse();
  STATE.analysis = a;
  document.getElementById('liveBars').innerHTML = a.ranked.map(x => barRow(x, a)).join('');

  if (enough) scheduleResult(a); else showEmptyResult();
}

// ---- live result: recompute on every tick, without fighting the scroll ----
let resultTimer = null;
function scheduleResult(a) {
  clearTimeout(resultTimer);
  const right = document.getElementById('wsRight');
  if (right) right.classList.add('updating');
  resultTimer = setTimeout(() => {
    renderResults(a);
    if (right) right.classList.remove('updating');
  }, 140);
}

function showEmptyResult() {
  clearTimeout(resultTimer);
  const right = document.getElementById('wsRight');
  if (right) right.classList.remove('updating');
  document.getElementById('resultEmpty').style.display = '';
  document.getElementById('resultBody').style.display = 'none';
  document.getElementById('resultBody').innerHTML = '';
}

function barRow(x, a) {
  const m = M(x.id);
  return `<div class="bar-row">
    <span class="bar-name"><span class="mdot" style="background:${m.color_code}"></span>${m.name_bn.replace(' মায়াজম', '')}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${x.pct.toFixed(1)}%;background:${m.color_code}"></span></span>
    <span class="bar-pct">${bnNum(Math.round(x.pct))}%</span>
  </div>`;
}

function bindEvents() {
  const sb = document.getElementById('searchBox');
  sb.addEventListener('input', () => {
    STATE.search = sb.value;
    document.getElementById('searchClear').style.display = sb.value ? '' : 'none';
    renderRubrics();
  });
  document.getElementById('searchClear').addEventListener('click', () => {
    sb.value = ''; STATE.search = '';
    document.getElementById('searchClear').style.display = 'none';
    renderRubrics();
  });

  document.getElementById('catFilters').addEventListener('click', e => {
    const b = e.target.closest('.fbtn'); if (!b) return;
    STATE.cat = b.dataset.cat;
    document.querySelectorAll('#catFilters .fbtn').forEach(x => x.classList.toggle('active', x === b));
    renderRubrics();
  });
  document.getElementById('typeFilters').addEventListener('click', e => {
    const b = e.target.closest('.fbtn'); if (!b) return;
    STATE.type = b.dataset.type;
    document.querySelectorAll('#typeFilters .fbtn').forEach(x => x.classList.toggle('active', x === b));
    renderRubrics();
  });
  document.getElementById('miasmFilters').addEventListener('click', e => {
    const b = e.target.closest('.fbtn'); if (!b) return;
    STATE.miasm = b.dataset.miasm;
    document.querySelectorAll('#miasmFilters .fbtn').forEach(x => x.classList.toggle('active', x === b));
    renderRubrics();
  });

  document.getElementById('clearAll').addEventListener('click', () => {
    if (!STATE.selected.size) return;
    STATE.selected.clear(); saveSel();
    STATE.analysis = null;
    renderRubrics(); refreshSelectionUI();
    if (typeof Shell !== 'undefined') Shell.toast('সব নির্বাচন মুছে ফেলা হয়েছে।', 'ok');
  });

  // mobile pane switcher
  document.querySelectorAll('.ws-sw-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ws-sw-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('wsGrid').dataset.pane = btn.dataset.pane;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.page-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.panel));
  });
}

function showPanel(name) {
  document.querySelectorAll('.page-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.page-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  sizeWorkspace();
}

// ===================== Results =====================
function renderResults(a) {
  document.getElementById('resultEmpty').style.display = 'none';
  const box = document.getElementById('resultBody');
  box.style.display = '';

  // remember what the user had open / where they were, so a live refresh is not jarring
  const pane = document.getElementById('wsRight');
  const keepScroll = pane ? pane.scrollTop : 0;
  const openEvidence = new Set([...box.querySelectorAll('.ev-block[open]')].map(d => d.dataset.miasm));
  const wasCardOpen = box.querySelector('.export-box') ? true : false;

  const dom = a.dominant, sec = a.secondary;
  const dm = M(dom.id), sm = M(sec.id);
  const mixedOn = a.mixed.level !== 'single';
  const pattern = a.pattern || { bn: '—', en: '', desc: '' };

  const catRows = Object.values(a.catTotals).sort((x, y) => y.total - x.total);
  const catMax = catRows.length ? catRows[0].total : 1;

  box.innerHTML = `
    <div class="card">
      <div class="dom-card" style="border-color:${dm.color_code};background:${dm.color_code}14;">
        <div class="dom-head">
          <span class="dom-icon">${dm.icon}</span>
          <div style="min-width:0;">
            <div class="dom-label">প্রধান মায়াজম · Dominant</div>
            <div class="dom-name">${dm.name_bn}</div>
            <div class="dom-en">${dm.name_en} — ${esc(dm.origin)}</div>
          </div>
          <div class="dom-pct"><b style="color:${dm.color_code}">${bnNum(Math.round(dom.pct))}%</b><span>স্কোর ${bnDec(dom.score)}</span></div>
        </div>
        <p class="dom-nature"><strong>মূল প্রকৃতি:</strong> ${esc(dm.fundamental_nature)} · <strong>মেজাজ:</strong> ${esc(dm.temperament)}</p>
      </div>

      <div class="kv-grid">
        <div class="kv" style="border-left-color:${sm.color_code}">
          <div class="kv-k">সহায়ক মায়াজম · Secondary</div>
          <div class="kv-v">${sec.score > 0 ? sm.icon + ' ' + sm.name_bn : '—'}</div>
          <div class="kv-n">${sec.score > 0 ? bnNum(Math.round(sec.pct)) + '% · স্কোর ' + bnDec(sec.score) : 'দ্বিতীয় কোনো মায়াজমের প্রমাণ পাওয়া যায়নি'}</div>
        </div>
        <div class="kv" style="border-left-color:${mixedOn ? 'var(--m-amber)' : 'var(--border)'}">
          <div class="kv-k">মিশ্র মায়াজম · Mixed</div>
          <div class="kv-v">${mixedOn ? esc(a.mixed.name.bn) : 'নেই'} <span style="font-size:0.6875rem;font-weight:600;color:var(--text-muted)">(${a.mixed.label_bn})</span></div>
          <div class="kv-n">${mixedOn ? esc(a.mixed.name.en || '') + ' — ' : ''}২য়/১ম = ${bnNum(Math.round(a.mixed.r2 * 100))}%, ৩য়/১ম = ${bnNum(Math.round(a.mixed.r3 * 100))}% ${mixedOn ? '' : '— সীমার নিচে, একক মায়াজম প্রাধান্য'}</div>
        </div>
        <div class="kv">
          <div class="kv-k">আত্মবিশ্বাস · Confidence</div>
          <div class="kv-v">${bnNum(a.confidence)}% <span style="font-size:0.75rem;font-weight:600;color:var(--text-muted)">(${confLabel(a.confidence)})</span></div>
          <div class="conf-track"><span class="conf-fill" style="width:${a.confidence}%"></span></div>
          <div class="kv-n">নিচে বিস্তারিত ভাঙা হিসাব দেখুন</div>
        </div>
        <div class="kv" style="border-left-color:var(--m-indigo)">
          <div class="kv-k">রোগের ধরন · Disease pattern</div>
          <div class="kv-v">${pattern.bn}</div>
          <div class="kv-n">${pattern.en} — ${pattern.desc}
            ${pattern.combined ? '<br/><strong>সক্রিয় ধারা:</strong> ' + pattern.combined.join(' + ') : ''}
            ${pattern.drivers && pattern.drivers.length ? '<br/><strong>ভিত্তি:</strong> ' + pattern.drivers.map(esc).join(', ') : ''}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-bar-chart-alt-2' style="font-size:1rem"></i></span>
        <div><h3>স্কোরবোর্ড</h3><p>মোট ভারিত স্কোর ${bnDec(a.totalScore)} · ${bnNum(a.chosen.length)}টি রুব্রিক থেকে</p></div>
      </div>
      <div style="margin-bottom:1rem;">${a.ranked.map(x => barRow(x, a)).join('')}</div>
      <table class="score-table">
        <thead><tr>
          <th>মায়াজম</th><th>ভারিত স্কোর</th><th class="col-raw">কাঁচা ওজন</th><th>রুব্রিক</th><th>%</th>
        </tr></thead>
        <tbody>${a.ranked.map(x => `
          <tr class="${x.rank === 1 && x.score > 0 ? 'top' : ''}">
            <td><span class="mdot" style="background:${M(x.id).color_code}"></span> ${M(x.id).name_bn}<span class="rank-no">${bnNum(x.rank)}</span></td>
            <td>${bnDec(x.score)}</td>
            <td class="col-raw">${bnNum(x.raw)}</td>
            <td>${bnNum(x.items.length)}</td>
            <td><strong>${bnNum(Math.round(x.pct))}%</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-shield-quarter' style="font-size:1rem"></i></span>
        <div><h3>আত্মবিশ্বাসের ভাঙা হিসাব</h3><p>শুধু স্কোরের ব্যবধান নয় — প্রমাণের মানও গোনা হয়</p></div>
      </div>
      <table class="score-table">
        <thead><tr><th>উপাদান</th><th>পাওয়া গেছে</th><th class="col-raw">লক্ষ্য</th><th>পূরণ</th><th>ভার</th></tr></thead>
        <tbody>${a.confParts.map(c => c.id === 'penalty' ? `
          <tr><td colspan="4" style="color:var(--m-rose);">${c.bn} — ${esc(String(c.got))}</td>
              <td style="color:var(--m-rose);font-weight:700;">${c.ratio ? bnNum(Math.round(c.ratio * 100)) + '%' : '০%'}</td></tr>` : `
          <tr>
            <td>${c.bn}</td>
            <td>${c.id === 'separation' ? bnNum(Math.round(c.got * 100)) + '%' : bnNum(c.got) + 'টি'}</td>
            <td class="col-raw">${c.id === 'separation' ? bnNum(Math.round(c.target * 100)) + '%' : bnNum(c.target) + 'টি'}</td>
            <td>
              <span class="bar-track" style="display:inline-block;width:70px;vertical-align:middle;">
                <span class="bar-fill" style="width:${c.ratio * 100}%;background:${c.ratio >= 0.99 ? 'var(--success)' : 'var(--primary)'}"></span>
              </span>
              ${bnNum(Math.round(c.ratio * 100))}%
            </td>
            <td>${bnNum(Math.round(c.weight * 100))}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="sub-card" style="margin-top:0.875rem;">
        <p style="font-size:0.8125rem;line-height:1.7;margin:0;">
          নির্বাচিত লক্ষণের ধরন: ${Object.entries(a.typeCount).filter(([, v]) => v)
            .map(([k, v]) => `${(CFG().symptom_types[k] || {}).icon || ''} ${(CFG().symptom_types[k] || {}).bn || k} ${bnNum(v)}টি`).join(' · ')}
          ${a.pqrsCount ? ` · ⭐ PQRS ${bnNum(a.pqrsCount)}টি` : ' · ⭐ PQRS নেই'}
        </p>
      </div>
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-message-square-detail' style="font-size:1rem"></i></span>
        <div><h3>কেন এই ফলাফল</h3><p>Reasoning — প্রতিটি সিদ্ধান্তের ভিত্তি</p></div>
      </div>
      <ul class="reason-list">${reasoning(a).map(t => `<li>${t}</li>`).join('')}</ul>
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-category' style="font-size:1rem"></i></span>
        <div><h3>বিভাগভিত্তিক অবদান</h3><p>কোন ক্ষেত্র থেকে সবচেয়ে বেশি তথ্য এসেছে</p></div>
      </div>
      ${catRows.map(c => `<div class="bar-row">
        <span class="bar-name">${c.bn}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(c.total / catMax) * 100}%;background:var(--primary)"></span></span>
        <span class="bar-pct">${bnNum(c.count)}টি</span>
      </div>`).join('')}
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-search-alt' style="font-size:1rem"></i></span>
        <div><h3>সহায়ক প্রমাণ</h3><p>কোন লক্ষণ কোন মায়াজমে কত যোগ করল</p></div>
      </div>
      ${a.ranked.filter(x => x.items.length).map(x => `
        <details class="ev-block" data-miasm="${x.id}"${x.rank === 1 ? ' open' : ''}>
          <summary>
            <span class="mdot" style="background:${M(x.id).color_code}"></span>
            ${M(x.id).name_bn}
            <span style="margin-left:auto;font-weight:700;color:var(--primary);">${bnDec(x.score)}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">(${bnNum(x.items.length)}টি)</span>
          </summary>
          <div class="ev-list">
            ${x.items.map(it => `<div class="ev-item">
              <span class="ev-cat">${it.catBn}</span>
              <span>${esc(it.bn)}${it.shared > 1 ? ` <span style="font-size:0.6875rem;color:var(--text-muted)">(${bnNum(it.shared)}টি মায়াজমে ভাগ)</span>` : ''}</span>
              <span class="ev-c">+${bnDec(it.share)}</span>
            </div>`).join('')}
          </div>
        </details>`).join('')}
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-capsule' style="font-size:1rem"></i></span>
        <div><h3>সংশ্লিষ্ট ওষুধ</h3><p>শুধুমাত্র শিক্ষামূলক — সম্পূর্ণ কেস বিশ্লেষণের বিকল্প নয়</p></div>
      </div>
      <h5 style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.5rem;">${dm.name_bn} (প্রধান)</h5>
      <div class="rx-chips">${dm.associated_remedies.map(r => `<span class="rx-chip"><b>●</b> ${esc(r)}</span>`).join('')}</div>
      ${sec.score > 0 ? `
        <h5 style="font-size:0.8125rem;color:var(--text-muted);margin:1rem 0 0.5rem;">${sm.name_bn} (সহায়ক)</h5>
        <div class="rx-chips">${sm.associated_remedies.map(r => `<span class="rx-chip">${esc(r)}</span>`).join('')}</div>` : ''}
      <div class="sub-card warning-card" style="margin-top:1rem;">
        <p style="font-size:0.875rem;line-height:1.65;margin:0;">
          এই তালিকা মায়াজম-সম্পর্কিত সাধারণ ওষুধ মাত্র। প্রেসক্রিপশনের আগে সম্পূর্ণ কেস, লক্ষণের সামগ্রিকতা ও রেপার্টরাইজেশন যাচাই করুন।
        </p>
      </div>
    </div>

    <div class="card">
      <div class="section-heading">
        <span class="section-number"><i class='bx bx-code-curly' style="font-size:1rem"></i></span>
        <div><h3>AI-রেডি আউটপুট</h3><p>স্ট্রাকচার্ড JSON — কেস বিশ্লেষণে ব্যবহারের জন্য</p></div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">
        <button class="btn ghost" id="copyJson"><i class='bx bx-copy'></i> কপি করুন</button>
        <button class="btn ghost" id="dlJson"><i class='bx bx-download'></i> ডাউনলোড</button>
        <button class="btn ghost" id="backToSel"><i class='bx bx-edit'></i> লক্ষণ সম্পাদনা</button>
      </div>
      <pre class="export-box" id="exportBox"></pre>
    </div>
  `;

  // restore the previous open/scroll state
  if (openEvidence.size) {
    box.querySelectorAll('.ev-block').forEach(d => { d.open = openEvidence.has(d.dataset.miasm); });
  }
  if (pane && keepScroll) pane.scrollTop = keepScroll;

  const payload = exportPayload(a);
  document.getElementById('exportBox').textContent = JSON.stringify(payload, null, 2);
  document.getElementById('copyJson').addEventListener('click', function () {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      this.innerHTML = "<i class='bx bx-check'></i> কপি হয়েছে";
      setTimeout(() => { this.innerHTML = "<i class='bx bx-copy'></i> কপি করুন"; }, 1800);
    });
  });
  document.getElementById('dlJson').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url; a2.download = 'miasm-analysis.json'; a2.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('backToSel').addEventListener('click', () => {
    const leftBtn = document.querySelector('.ws-sw-btn[data-pane="left"]');
    if (leftBtn) leftBtn.click();
    document.getElementById('searchBox').focus();
  });
}

function reasoning(a) {
  const out = [];
  const dom = a.dominant, sec = a.secondary;
  const dm = M(dom.id), sm = M(sec.id);
  const ST = CFG().symptom_types || {};
  const top = dom.items.slice(0, 3).map(i => `“${i.bn}” (+${bnDec(i.share)})`).join(', ');
  const specific = dom.items.filter(i => i.shared === 1).length;
  const pqrsFor = dom.items.filter(i => i.pqrs);
  const covTarget = target('coverage');

  out.push(`নির্বাচিত <strong>${bnNum(a.chosen.length)}টি</strong> রুব্রিকের মধ্যে <strong>${bnNum(dom.items.length)}টি</strong> ${dm.name_bn}-এর দিকে ইঙ্গিত করে, যা মোট ভারিত স্কোরের <strong>${bnNum(Math.round(dom.pct))}%</strong> (${bnDec(dom.score)}/${bnDec(a.totalScore)})।`);

  if (top) out.push(`সবচেয়ে বেশি অবদান রেখেছে: ${top}।`);

  if (pqrsFor.length) {
    out.push(`<strong>PQRS (চারিত্রিক) লক্ষণ ${bnNum(pqrsFor.length)}টি</strong> — ${pqrsFor.slice(0, 3).map(i => '“' + i.bn + '”').join(', ')} — এগুলো সবচেয়ে ব্যক্তিনির্দিষ্ট, তাই ${bnNum(Math.round((CFG().pqrs_bonus || 1.4) * 100 - 100))}% অতিরিক্ত ভার পেয়েছে।`);
  } else {
    out.push(`কোনো <strong>PQRS/চারিত্রিক</strong> লক্ষণ নির্বাচিত হয়নি — শুধু সাধারণ (common) লক্ষণে মায়াজম নির্ণয় দুর্বল থাকে। পিকিউলিয়ার লক্ষণ খুঁজে যোগ করুন।`);
  }

  out.push(specific
    ? `<strong>${bnNum(specific)}টি</strong> রুব্রিক শুধুমাত্র ${dm.name_bn}-এরই — অন্য কোনো মায়াজমে নেই, তাই এগুলোই সবচেয়ে শক্তিশালী প্রমাণ।`
    : `নির্বাচিত কোনো রুব্রিকই একক ভাবে ${dm.name_bn}-নির্দিষ্ট নয় — প্রতিটিই একাধিক মায়াজমে আছে, তাই সিদ্ধান্তটি তুলনামূলকভাবে দুর্বল।`);

  const missing = ['mental', 'general', 'modality'].filter(t => !(a.typeCount[t] > 0));
  if (missing.length) {
    out.push(`কেসে <strong>${missing.map(t => (ST[t] || {}).bn || t).join(', ')}</strong> ধরনের কোনো লক্ষণ নেই। হোমিওপ্যাথিক শ্রেণিবিন্যাসে এগুলো ছাড়া মায়াজমিক ছবি অসম্পূর্ণ থাকে।`);
  }

  if (sec.score > 0) {
    out.push(`দ্বিতীয় অবস্থানে ${sm.name_bn} (${bnNum(Math.round(sec.pct))}%, স্কোর ${bnDec(sec.score)}) — প্রধান মায়াজমের চেয়ে <strong>${bnNum(Math.round(a.separation * 100))}%</strong> কম।`);
  }

  if (a.mixed.level !== 'single') {
    const t = CFG().mixed_thresholds || {};
    const why = a.mixed.level === 'tri'
      ? `শীর্ষ তিনটি মায়াজমই কাছাকাছি (২য় ${bnNum(Math.round(a.mixed.r2 * 100))}%, ৩য় ${bnNum(Math.round(a.mixed.r3 * 100))}%)`
      : a.mixed.level === 'mixed_equal'
        ? `সহায়ক মায়াজম প্রধানের ${bnNum(Math.round(a.mixed.r2 * 100))}% — কার্যত সমান শক্তি`
        : `সহায়ক মায়াজম প্রধানের ${bnNum(Math.round(a.mixed.r2 * 100))}% (সীমা ${bnNum(Math.round((t.mixed_secondary || 0.5) * 100))}%)`;
    out.push(`<strong>${a.mixed.label_bn}:</strong> ${esc(a.mixed.name.bn)} — ${why}। একটিমাত্র অ্যান্টি-মায়াজমেটিক ওষুধে পুরো কেস ঢাকবে না।`);
  }

  if (a.pattern) {
    out.push(`রোগের ধরন <strong>${a.pattern.bn}</strong> ধরা হয়েছে${a.pattern.drivers && a.pattern.drivers.length ? ' — মূলত ' + a.pattern.drivers.map(esc).join(', ') + ' থেকে' : ''}।`);
  }

  if (a.chosen.length < covTarget) {
    out.push(`<strong>সতর্কতা:</strong> মাত্র ${bnNum(a.chosen.length)}টি লক্ষণ থেকে বিশ্লেষণ হয়েছে। অন্তত ${bnNum(covTarget)}টি লক্ষণ (মানসিক + সাধারণ + মোডালিটি + প্যাথলজি) যোগ করলে ফলাফল অনেক বেশি নির্ভরযোগ্য হবে।`);
  }

  const zero = a.ranked.filter(x => x.score === 0).map(x => M(x.id).name_bn);
  if (zero.length) out.push(`কোনো প্রমাণ পাওয়া যায়নি: ${zero.join(', ')}। এই মায়াজমগুলো বাদ দেওয়ার আগে সংশ্লিষ্ট লক্ষণ আলাদা করে যাচাই করুন।`);

  return out;
}

function exportPayload(a) {
  const ST = CFG().symptom_types || {};
  return {
    meta: { tool: 'Bangla Homeopathic Miasm Analyser', db_version: DB.metadata.version, scoring_model: (CFG().version || 1), generated_offline: true },
    selected_symptoms: a.chosen.map(r => ({
      bn: r.bn, en: r.en, category: r.catEn, type: r.type,
      pqrs: !!r.pqrs, importance: r.importance, reliability: r.reliability,
      miasm_weights: r.weights || null, legacy_weight: r.weight
    })),
    symptom_profile: {
      total: a.chosen.length,
      pqrs_count: a.pqrsCount,
      by_type: Object.fromEntries(Object.entries(a.typeCount).map(([k, v]) => [(ST[k] || {}).en || k, v]))
    },
    category_totals: Object.entries(a.catTotals).map(([id, c]) => ({ category: id, name_en: c.en, rubrics: c.count, weighted_total: +c.total.toFixed(2) })),
    miasm_scores: a.ranked.map(x => ({
      miasm: x.id, name_en: M(x.id).name_en, rank: x.rank,
      weighted_score: +x.score.toFixed(2), raw_weight: x.raw,
      rubric_count: x.items.length, percentage: +x.pct.toFixed(1),
      top_evidence: x.items.slice(0, 5).map(i => ({ symptom_en: i.en, contribution: +i.share.toFixed(2), pqrs: !!i.pqrs }))
    })),
    dominant_miasm: { id: a.dominant.id, name_en: M(a.dominant.id).name_en, percentage: +a.dominant.pct.toFixed(1) },
    secondary_miasm: a.secondary.score > 0
      ? { id: a.secondary.id, name_en: M(a.secondary.id).name_en, percentage: +a.secondary.pct.toFixed(1) } : null,
    mixed_miasm: {
      level: a.mixed.level, label_en: a.mixed.label_en,
      name_en: a.mixed.name ? a.mixed.name.en : null,
      miasms: a.mixed.ids,
      ratio_second_to_first: +a.mixed.r2.toFixed(2),
      ratio_third_to_first: +a.mixed.r3.toFixed(2)
    },
    confidence: {
      score: a.confidence, label_bn: confLabel(a.confidence),
      components: a.confParts.filter(c => c.id !== 'penalty')
        .map(c => ({ id: c.id, name_en: c.en, value: c.got, target: c.target, fulfilled: +c.ratio.toFixed(2), weight: c.weight })),
      mixed_penalty: -(a.confParts.find(c => c.id === 'penalty') || { ratio: 0 }).ratio
    },
    disease_pattern: a.pattern ? {
      id: a.pattern.id, name_en: a.pattern.en, name_bn: a.pattern.bn,
      drivers_bn: a.pattern.drivers, ranking: a.pattern.all.map(x => ({ id: x.id, score: +x.score.toFixed(2) }))
    } : null,
    reasoning_bn: reasoning(a).map(t => t.replace(/<[^>]+>/g, '')),
    suggested_remedies: {
      dominant: M(a.dominant.id).associated_remedies,
      secondary: a.secondary.score > 0 ? M(a.secondary.id).associated_remedies : []
    },
    scoring_rule: CFG().formula || 'weights[miasm] × importance × pqrs bonus × reliability',
    disclaimer: DB.metadata.disclaimer
  };
}

// ===================== Static panels =====================
function renderWeightLegend() {
  const SM = CFG();
  const imp = SM.importance_multiplier || {};
  const ST = SM.symptom_types || {};
  document.getElementById('weightLegend').innerHTML = `
    <div class="formula-box">
      <code>অবদান = মায়াজম-নির্দিষ্ট ওজন × গুরুত্ব × PQRS বোনাস × নির্ভরযোগ্যতা</code>
    </div>

    <div class="mi-sec"><h5><i class='bx bx-slider'></i> ১. মায়াজম-নির্দিষ্ট ওজন (১–৫)</h5>
      <p class="sm-p">একটি রুব্রিক একাধিক মায়াজমে থাকলেও প্রত্যেকের জন্য <strong>আলাদা ওজন</strong> আছে —
      সমান ভাগ করা হয় না। যেমন <em>“আত্মহত্যার প্রবণতা”</em>: সিফিলিস ৫, ক্যান্সার ৩।
      রুব্রিকের পাশে রঙিন সংখ্যাগুলোই সেই ওজন।</p></div>

    <div class="mi-sec"><h5><i class='bx bx-medal'></i> ২. লক্ষণের গুরুত্ব</h5>
      ${Object.keys(imp).sort().reverse().map(k => `<div class="bar-row">
        <span class="bar-name" style="width:110px;">${(SM.importance_label_bn || {})[k] || k}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(imp[k] / 1.3) * 100}%;background:var(--m-amber)"></span></span>
        <span class="bar-pct">×${bnNum(imp[k])}</span>
      </div>`).join('')}</div>

    <div class="mi-sec"><h5><i class='bx bx-star'></i> ৩. PQRS শ্রেণিবিন্যাস</h5>
      <p class="sm-p">${esc(SM.pqrs_note_bn || '')} এমন লক্ষণ <strong>×${bnNum(SM.pqrs_bonus || 1.4)}</strong> বোনাস পায়
      এবং তালিকায় <span class="rb-pqrs">⭐ PQRS</span> চিহ্ন দিয়ে দেখানো হয়।</p></div>

    <div class="mi-sec"><h5><i class='bx bx-check-shield'></i> ৪. প্রতি-লক্ষণ নির্ভরযোগ্যতা</h5>
      <p class="sm-p">প্রতিটি রুব্রিকের একটি নির্ভরযোগ্যতা (০.৩৫–১.০) আছে — সেটি কতটা নির্দিষ্টভাবে মায়াজম নির্দেশ করে।
      “কনডাইলোমা” = ১.০ (নিশ্চিত সাইকোটিক), “দুর্বলতা ও ক্লান্তি” = ০.৪ (সব মায়াজমেই থাকে)।</p></div>

    <div class="mi-sec"><h5><i class='bx bx-shapes'></i> ৫. লক্ষণের ধরন</h5>
      <div class="rx-chips">${Object.entries(ST).map(([id, t]) => {
        const n = RUBRICS.filter(r => r.type === id).length;
        return `<span class="rx-chip">${t.icon} ${t.bn} <b>${bnNum(n)}</b></span>`;
      }).join('')}
      <span class="rx-chip">⭐ PQRS <b>${bnNum(RUBRICS.filter(r => r.pqrs).length)}</b></span></div>
      <p class="sm-p" style="margin-top:0.5rem;">আত্মবিশ্বাস গণনায় এই ধরনগুলোর ভারসাম্যও গোনা হয় — শুধু সংখ্যা নয়।</p></div>
  `;
}

function renderLogic() {
  document.getElementById('logicSteps').innerHTML =
    DB.analyser_logic.steps.map(s => `<li>${esc(s)}</li>`).join('');
}

function renderMiasmCards() {
  document.getElementById('miasmCards').innerHTML = MIASM_IDS.map((id, i) => {
    const m = M(id);
    return `<details class="mi-card" style="border-left-color:${m.color_code}"${i === 0 ? ' open' : ''}>
      <summary>
        <span class="mi-ic">${m.icon}</span>
        <span style="flex:1;min-width:0;">
          <span class="mi-nm">${m.name_bn}</span><br/>
          <span class="mi-en">${m.name_en} — ${esc(m.fundamental_nature)}</span>
        </span>
        <i class='bx bx-chevron-down' style="color:var(--text-muted);font-size:1.25rem;"></i>
      </summary>
      <div class="mi-body">
        ${m.definition ? `<p class="mi-quote"><strong>সংজ্ঞা:</strong> ${esc(m.definition)}</p>` : ''}
        <div class="prof-grid">
          ${[['nature','প্রকৃতি','bx-atom'],['disease_tendency','রোগ প্রবণতা','bx-plus-medical'],
             ['thermal_state','তাপীয় অবস্থা','bx-thermometer'],['mental_picture','মানসিক চিত্র','bx-brain'],
             ['general_picture','সাধারণ চিত্র','bx-body'],['skin','ত্বক','bx-scan'],
             ['bones','হাড়','bx-skull'],['glands','গ্রন্থি','bx-doughnut-chart']]
            .filter(([k]) => m[k])
            .map(([k, label, ic]) => `<div class="prof-item">
              <span class="prof-k"><i class='bx ${ic}'></i> ${label}</span>
              <span class="prof-v">${esc(m[k])}</span></div>`).join('')}
        </div>
        ${m.clinical_notes ? `<div class="clin-note"><i class='bx bx-notepad'></i><div><strong>ক্লিনিক্যাল নোট</strong><br/>${esc(m.clinical_notes)}</div></div>` : ''}
        <p class="mi-quote" style="margin-top:1rem;"><strong>উৎপত্তি:</strong> ${esc(m.origin)}<br/><strong>মেজাজ:</strong> ${esc(m.temperament)}</p>
        <div class="mi-sec"><h5><i class='bx bx-brain'></i> মানসিক বৈশিষ্ট্য</h5>
          <ul>${m.mental_characteristics.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="mi-sec"><h5><i class='bx bx-body'></i> শারীরিক বৈশিষ্ট্য</h5>
          <ul>${m.physical_characteristics.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="mod-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:1rem;">
          <div style="background:var(--m-rose-bg);border-left:3px solid var(--m-rose);border-radius:var(--radius-sm);padding:0.75rem;">
            <strong style="font-size:0.8125rem;color:var(--m-rose);">বৃদ্ধি (Aggravation)</strong>
            <ul style="margin-top:0.375rem;padding-left:1rem;font-size:0.8125rem;color:var(--text-muted);">
              ${m.modalities.aggravation.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
          <div style="background:var(--success-bg);border-left:3px solid var(--success);border-radius:var(--radius-sm);padding:0.75rem;">
            <strong style="font-size:0.8125rem;color:var(--success);">উপশম (Amelioration)</strong>
            <ul style="margin-top:0.375rem;padding-left:1rem;font-size:0.8125rem;color:var(--text-muted);">
              ${m.modalities.amelioration.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
        </div>
        <div class="mi-sec"><h5><i class='bx bx-target-lock'></i> কারণ (Causation)</h5>
          <ul>${m.causation.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="mi-sec"><h5><i class='bx bx-plus-medical'></i> সাধারণ রোগ</h5>
          <div class="rx-chips">${m.common_diseases.map(x => `<span class="rx-chip">${esc(x)}</span>`).join('')}</div></div>
        <div class="mi-sec"><h5><i class='bx bx-capsule'></i> সংশ্লিষ্ট ওষুধ</h5>
          <div class="rx-chips">${m.associated_remedies.map(x => `<span class="rx-chip"><b>●</b> ${esc(x)}</span>`).join('')}</div></div>
      </div>
    </details>`;
  }).join('');
}

function renderComparison() {
  const rows = [
    ['সংজ্ঞা', m => esc(m.definition || '—')],
    ['প্রকৃতি', m => esc(m.nature || m.fundamental_nature)],
    ['রোগ প্রবণতা', m => esc(m.disease_tendency || '—')],
    ['মানসিক চিত্র', m => esc(m.mental_picture || m.mental_characteristics.slice(0, 3).join('; '))],
    ['সাধারণ চিত্র', m => esc(m.general_picture || '—')],
    ['তাপীয় অবস্থা', m => esc(m.thermal_state || '—')],
    ['ত্বক', m => esc(m.skin || '—')],
    ['হাড়', m => esc(m.bones || '—')],
    ['গ্রন্থি', m => esc(m.glands || '—')],
    ['মেজাজ', m => esc(m.temperament)],
    ['বৃদ্ধি', m => m.modalities.aggravation.map(esc).join(', ')],
    ['উপশম', m => m.modalities.amelioration.map(esc).join(', ')],
    ['কারণ', m => m.causation.slice(0, 4).map(esc).join('<br/>')],
    ['সাধারণ রোগ', m => m.common_diseases.slice(0, 6).map(esc).join(', ')],
    ['ক্লিনিক্যাল নোট', m => esc(m.clinical_notes || '—')],
    ['প্রধান ওষুধ', m => m.associated_remedies.slice(0, 6).map(esc).join(', ')]
  ];
  document.getElementById('cmpTable').innerHTML = `
    <thead><tr><th></th>${MIASM_IDS.map(id => {
      const m = M(id);
      return `<th style="border-top:3px solid ${m.color_code}">${m.icon} ${m.name_bn}<br/><span style="font-weight:400;font-size:0.6875rem;color:var(--text-muted);font-style:italic;">${m.name_en}</span></th>`;
    }).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) =>
      `<tr><th>${label}</th>${MIASM_IDS.map(id => `<td>${fn(M(id))}</td>`).join('')}</tr>`).join('')}
    </tbody>`;
}

// ===================== Deep links =====================
function openPanelFromHash() {
  const id = (location.hash || '').replace('#', '');
  if (id && document.getElementById('panel-' + id)) showPanel(id);
}
window.addEventListener('hashchange', openPanelFromHash);

// ===================== Init =====================
loadDB();
