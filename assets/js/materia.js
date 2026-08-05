/* ==========================================================================
   Materia medica browser — search / filter the remedy roster, read the full
   drug picture.

   Reads the same file the repertory page does (kent_remidies.json), because the
   remedy table and its materia medica live there together. Only the `remedies`
   array is used; the 66,000 rubrics are ignored here, so the page holds nothing
   it does not draw.
   ========================================================================== */
(function () {
  'use strict';

  const DIR = 'assets/data/repatories/';
  const STORE = 'materia_last_v1';
  const LIST_CAP = 300;             // rows drawn at once; search narrows further
  const bn = v => Shell.bnNum(v);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9ঀ-৿]/g, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CMP_MAX = 5;                // 2–5 remedies; beyond that the table stops being readable
  const CMP_STORE = 'materia_compare_v1';

  const S = {
    all: [],           // every remedy, as loaded
    meta: {},
    search: '',
    scope: 'full',     // 'full' = only remedies with a drug picture | 'all'
    facet: '',         // '' | 'fam:<family>' | 'thermal:<chilly|hot|mixed>'
    letter: '',
    selected: null,
    mode: 'read',      // 'read' | 'compare'
    compare: [],       // remedy ids, in the order picked
    onlyDiff: false,
    source: null       // which English source the card is showing
  };

  /* ==================== load ==================== */
  async function boot() {
    Shell.setChip('লোড হচ্ছে…', 'bx-loader-alt', true);
    let manifest;
    try {
      manifest = await (await fetch(DIR + 'index.json')).json();
    } catch (e) {
      fail('রিপার্টরির তালিকা (index.json) পড়া যায়নি।');
      return;
    }
    const entry = (manifest.repertories || [])[0];
    if (!entry) { fail('index.json-এ কোনো ডেটা ফাইল নেই।'); return; }
    try {
      const raw = await (await fetch(DIR + entry.file)).json();
      S.all = (raw.remedies || []).slice();
      S.meta = raw.metadata || {};
    } catch (e) {
      fail('ডেটা ফাইল লোড করা যায়নি: ' + entry.file);
      return;
    }
    // remedies with a drug picture first, then alphabetically by Bangla name
    S.all.sort((a, b) =>
      (b.content_status === 'full') - (a.content_status === 'full') ||
      (a.bangla_name || a.name).localeCompare(b.bangla_name || b.name, 'bn'));

    renderFilters();
    renderAlpha();
    renderList();
    restore();
    restoreCompare();
    S.source = Shell.store.get(SRC_STORE, null);
    bindShell();
    bindCompare();
    updateChip();
    sizeWorkspace();
    // fonts and icons landing late shift the toolbar a few px
    window.addEventListener('load', sizeWorkspace);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeWorkspace);
  }

  /* Keep the split one screen tall so each column scrolls internally. Without a
     bounded height the flex child just grows and 290 remedies push the page
     metres long, which is the whole problem this solves.

     The split is collapsed to 0 before measuring: with it still in flow the page
     is ~13,000px tall, and every offset read from that layout is meaningless —
     an overflow-based correction would just chase its own tail. */
  const MIN_SPLIT = 320;

  function sizeWorkspace() {
    const split = document.getElementById('mmSplit');
    if (!split) return;
    // compare mode puts a wide table below the list, so the page is meant to
    // scroll there — pinning the split to one screen would hide the table
    if (window.innerWidth < 900 || S.mode === 'compare') { split.style.height = ''; return; }

    split.style.height = '0px';
    const top = split.getBoundingClientRect().top + window.scrollY;   // forces reflow
    const footer = document.querySelector('.app-footer');
    const fh = footer ? footer.getBoundingClientRect().height : 0;
    const content = document.querySelector('.app-content');
    const padBottom = content ? parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0;
    const note = document.querySelector('.disclaimer');
    const nh = note ? note.getBoundingClientRect().height : 0;

    const h = Math.round(window.innerHeight - top - fh - padBottom - nh - 24);
    split.style.height = Math.max(MIN_SPLIT, h) + 'px';
  }

  // only offer the filter toggle when the chips actually overflow one row
  function sizeToolbar() {
    const bar = document.getElementById('mmToolbar');
    const sets = document.getElementById('mmSets');
    if (!bar || !sets || !sets.clientHeight) return;
    if (bar.classList.contains('open')) return;
    bar.classList.toggle('no-toggle', sets.scrollHeight <= sets.clientHeight + 2);
  }

  function fail(msg) {
    Shell.toast(msg, 'err');
    document.getElementById('rxList').innerHTML =
      `<div class="mm-empty"><i class='bx bx-error-circle'></i>${esc(msg)}</div>`;
    Shell.setChip('লোড হয়নি', 'bx-x-circle');
  }

  const withMM = () => S.all.filter(r => r.content_status === 'full');

  function updateChip() {
    Shell.setChip(`${bn(withMM().length)}টি ওষুধের বিবরণ`, 'bx-capsule');
  }

  /* ==================== filters ====================
     Two independent controls, not one list. Scope decides whether remedies
     without a drug picture are in play at all; facet narrows by family or
     thermal state within that scope. Folding them into one radio group meant
     picking a family silently dropped the "has materia medica" constraint, and
     the thermal chips could offer a selection that matched nothing. */
  const inScope = r => S.scope === 'all' || r.content_status === 'full';

  function facetCounts() {
    const fam = new Map();
    const therm = new Map();
    S.all.forEach(r => {
      if (!inScope(r)) return;
      if (r.family) fam.set(r.family, (fam.get(r.family) || 0) + 1);
      if (r.thermal_en) therm.set(r.thermal_en, (therm.get(r.thermal_en) || 0) + 1);
    });
    return { fam, therm };
  }

  const THERMAL_BN = { chilly: 'শীতার্ত', hot: 'গরম', mixed: 'মিশ্র' };

  function renderFilters() {
    const host = document.getElementById('rxFilters');
    const { fam, therm } = facetCounts();
    const nFull = S.all.filter(r => r.content_status === 'full').length;

    const chip = (cls, on, key, label, n) =>
      `<button class="mm-fbtn ${cls} ${on ? 'active' : ''}" data-${key}>` +
      `${esc(label)}${n != null ? ` <b>${bn(n)}</b>` : ''}</button>`;

    const scopeChips =
      chip('is-scope', S.scope === 'full', 'scope="full"', 'বিবরণ আছে', nFull) +
      chip('is-scope', S.scope === 'all', 'scope="all"', 'সব ওষুধ', S.all.length);

    // only offer a facet that actually matches something in the current scope
    const famChips = [...fam.entries()]
      .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
      .map(([f, n]) => chip('is-facet', S.facet === 'fam:' + f, `facet="fam:${esc(f)}"`, f, n)).join('');
    const thermChips = ['chilly', 'hot', 'mixed']
      .filter(t => therm.get(t)).map(t =>
        chip('is-facet', S.facet === 'thermal:' + t, `facet="thermal:${t}"`,
             THERMAL_BN[t], therm.get(t))).join('');

    host.innerHTML =
      `<span class="mm-fgrp">${scopeChips}</span>` +
      `<span class="mm-fsep"></span>` +
      chip('is-facet', !S.facet, 'facet=""', 'সব বর্গ', null) +
      famChips + thermChips;

    host.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => {
      S.scope = b.dataset.scope;
      // a facet that matches nothing in the new scope would strand the list on
      // an empty result, so drop it (counts now reflect the scope just set)
      const c = facetCounts();
      if (S.facet.startsWith('fam:') && !c.fam.get(S.facet.slice(4))) S.facet = '';
      if (S.facet.startsWith('thermal:') && !c.therm.get(S.facet.slice(8))) S.facet = '';
      S.letter = '';
      renderFilters(); renderAlpha(); renderList();
    }));
    host.querySelectorAll('[data-facet]').forEach(b => b.addEventListener('click', () => {
      S.facet = b.dataset.facet;
      S.letter = '';
      renderFilters(); renderAlpha(); renderList();
    }));
    requestAnimationFrame(sizeToolbar);
  }

  function renderAlpha() {
    // first letters actually present, so the strip never offers a dead jump
    const set = new Set(visible(true).map(r => (r.bangla_name || r.name).charAt(0)));
    const letters = [...set].sort((a, b) => a.localeCompare(b, 'bn'));
    document.getElementById('rxAlpha').innerHTML =
      `<button class="${S.letter === '' ? 'active' : ''}" data-l="">সব</button>` +
      letters.map(l => `<button class="${S.letter === l ? 'active' : ''}" data-l="${esc(l)}">${esc(l)}</button>`).join('');
    document.querySelectorAll('#rxAlpha button').forEach(b => b.addEventListener('click', () => {
      S.letter = b.dataset.l;
      renderAlpha(); renderList();
    }));
  }

  /* `ignoreLetter` lets the alphabet strip be built from the filter alone,
     otherwise picking a letter would erase every other letter from the strip. */
  function visible(ignoreLetter) {
    const q = S.search.trim();
    const nq = norm(q);
    return S.all.filter(r => {
      if (!inScope(r)) return false;
      if (S.facet.startsWith('fam:') && r.family !== S.facet.slice(4)) return false;
      if (S.facet.startsWith('thermal:') && r.thermal_en !== S.facet.slice(8)) return false;
      if (!ignoreLetter && S.letter && (r.bangla_name || r.name).charAt(0) !== S.letter) return false;
      if (!nq) return true;
      if (norm(r.name).includes(nq) || norm(r.bangla_name).includes(nq)) return true;
      // searching the symptom text is what makes this usable as a reference
      const hay = [r.bangla_intro, (r.keynotes || []).join(' '), (r.mental || []).join(' '),
                   (r.general || []).join(' '), (r.clinical_uses || []).join(' ')].join(' ');
      return hay.includes(q);
    });
  }

  function renderList() {
    const host = document.getElementById('rxList');
    const all = visible(false);
    const rows = all.slice(0, LIST_CAP);
    document.getElementById('rxHint').innerHTML = all.length > rows.length
      ? `${bn(rows.length)}টি দেখানো হচ্ছে (মিলেছে ${bn(all.length)}টি) — সার্চ করে সংকীর্ণ করুন`
      : `${bn(all.length)}টি ওষুধ`;

    if (!rows.length) {
      host.innerHTML = `<div class="mm-empty"><i class='bx bx-search-alt'></i>কোনো ওষুধ মেলেনি।</div>`;
      return;
    }
    const cmpFull = S.compare.length >= CMP_MAX;
    host.innerHTML = rows.map(r => {
      const full = r.content_status === 'full';
      const on = S.compare.includes(r.id);
      return `<div class="mm-rx ${S.selected === r.id && S.mode === 'read' ? 'on' : ''}
                   ${on ? 'cmp-on' : ''} ${cmpFull && !on ? 'cmp-full' : ''}" data-id="${esc(r.id)}">
        <span class="mm-rx-pick"><i class='bx bx-check'></i></span>
        <span class="mm-rx-txt">
          <span class="mm-rx-bn">${esc(r.bangla_name || r.name)}</span>
          <span class="mm-rx-en">${esc(r.name)}${r.family ? ' · ' + esc(r.family) : ''}</span>
        </span>
        <span class="mm-tag ${full ? 'full' : hasSrc(r.id) ? 'src' : 'basic'}"
              title="${full ? 'পূর্ণ বাংলা মেটেরিয়া মেডিকা আছে'
                      : hasSrc(r.id) ? 'বাংলা নেই, তবে বোরিকের মূল ইংরেজি পাঠ আছে'
                      : 'শুধু নাম ও রিপার্টরি তথ্য'}">${full ? 'MM' : hasSrc(r.id) ? 'EN' : '—'}</span>
      </div>`;
    }).join('');
    host.querySelectorAll('.mm-rx').forEach(el => el.addEventListener('click', () => {
      if (S.mode === 'compare') toggleCompare(el.dataset.id);
      else select(el.dataset.id);
    }));
  }

  function select(id) {
    S.selected = id;
    Shell.store.set(STORE, id);
    renderList();
    renderDetail();
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.getElementById('detailCol').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function restore() {
    const last = Shell.store.get(STORE, null);
    const pick = (last && S.all.find(r => r.id === last)) || withMM()[0];
    if (pick) { S.selected = pick.id; renderList(); renderDetail(); }
  }

  /* ==================== drug picture ==================== */
  function renderDetail() {
    const host = document.getElementById('rxDetail');
    const rx = S.all.find(r => r.id === S.selected);
    if (!rx) {
      host.innerHTML = `<div class="mm-empty"><i class='bx bx-capsule'></i>বাঁ পাশ থেকে একটি ওষুধ বেছে নিন।</div>`;
      return;
    }

    const head = `<div class="md-head"><div style="min-width:0;">
        <h3>${esc(rx.bangla_name || rx.name)}</h3>
        <div class="md-en">${esc(rx.name)}${rx.family ? ' · ' + esc(rx.family) : ''}</div>
      </div></div>`;

    const kv = [
      rx.thermal ? ['তাপীয়', rx.thermal] : null,
      rx.miasm ? ['মায়াজম', rx.miasm] : null,
      rx.family ? ['বর্গ', rx.family] : null,
      rx.sleep ? ['ঘুম', rx.sleep] : null,
      rx.dreams ? ['স্বপ্ন', rx.dreams] : null,
      rx.stool ? ['মল', rx.stool] : null,
      rx.urine ? ['প্রস্রাব', rx.urine] : null,
      rx.skin ? ['ত্বক', rx.skin] : null
    ].filter(Boolean);
    const kvHtml = kv.length
      ? `<div class="md-sec"><div class="md-kv">${kv.map(([k, v]) =>
          `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>` : '';

    if (rx.content_status !== 'full') {
      // No invented symptoms: say plainly that the picture is not written yet.
      host.innerHTML = head + kvHtml + `
        <div class="health" style="margin-top:1rem;">
          <div class="health-head"><i class='bx bx-info-circle'></i> বাংলা মেটেরিয়া মেডিকা এখনো লেখা হয়নি</div>
          <p>${hasSrc(rx.id)
              ? `এই ওষুধের <strong>বাংলা</strong> বিবরণ এখনো লেখা হয়নি — তবে নিচে
                 <strong>বোরিকের মূল ইংরেজি পাঠ</strong> আছে, সেটিই এখন এর পূর্ণ ড্রাগ পিকচার।`
              : `এই ওষুধটি রিপার্টরিতে সঠিক নামে ও গ্রেডে আছে, কিন্তু প্রামাণিক মেটেরিয়া মেডিকায়
                 এর স্পষ্ট লক্ষণ-চিত্র না থাকায় এখানে কিছু লেখা হয়নি —
                 <strong>বানানো লক্ষণ যোগ করা হয়নি</strong>।`}</p>
        </div>
        <div class="md-sec"><h5><i class='bx bx-book-bookmark'></i> রিপার্টরিতে</h5>
          <p>${rx.in_rubrics
              ? 'এই ওষুধটি রিপার্টরির রুব্রিকে আছে — <a href="repertory.html" style="color:var(--primary);font-weight:600;">রিপার্টরি</a> পেজে খুঁজে দেখুন।'
              : 'কেন্টের রুব্রিকে এই ওষুধের উল্লেখ নেই।'}</p></div>
        ${sourceHtml(rx)}`;
      bindSourceTabs();
      ensureSource(rx.id);
      return;
    }

    const list = (arr, t, ic) => (arr && arr.length)
      ? `<div class="md-sec"><h5><i class='bx ${ic}'></i> ${t}</h5><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const pills = (arr, t, ic) => (arr && arr.length)
      ? `<div class="md-sec"><h5><i class='bx ${ic}'></i> ${t}</h5><div class="md-pills">${arr.map(x => `<span class="md-pill">${esc(x)}</span>`).join('')}</div></div>` : '';
    const ca = rx.cravings_aversions || {};
    const rel = rx.relationships || {};

    host.innerHTML = head +
      (rx.bangla_intro ? `<p class="md-intro">${esc(rx.bangla_intro)}</p>` : '') +
      kvHtml +
      list(rx.keynotes, 'কীনোট', 'bx-key') +
      list(rx.mental, 'মানসিক', 'bx-brain') +
      list(rx.general, 'সাধারণ', 'bx-body') +
      list(rx.particular, 'নির্দিষ্ট অঙ্গ', 'bx-target-lock') +
      list(rx.modalities, 'মোডালিটি', 'bx-transfer') +
      pills(ca.cravings, 'আকাঙ্ক্ষা', 'bx-cookie') +
      pills(ca.aversions, 'অরুচি', 'bx-block') +
      pills(rx.clinical_uses, 'ক্লিনিক্যাল ব্যবহার', 'bx-plus-medical') +
      pills(rel.complementary, 'পরিপূরক ওষুধ', 'bx-link') +
      pills(rel.antidote, 'প্রতিষেধক', 'bx-shield') +
      pills(rel.inimical, 'বিরুদ্ধ ওষুধ', 'bx-x-circle') +
      (rx.potency_notes ? `<div class="md-sec"><h5><i class='bx bx-injection'></i> শক্তি</h5><p>${esc(rx.potency_notes)}</p></div>` : '') +
      `<div class="md-sec"><h5><i class='bx bx-book-bookmark'></i> রিপার্টরিতে</h5>
        <p>${rx.in_rubrics
            ? 'কেন্টের রুব্রিকে এই ওষুধ আছে — <a href="repertory.html" style="color:var(--primary);font-weight:600;">রিপার্টরি</a> পেজে রুব্রিক বেছে র‍্যাঙ্ক করুন।'
            : 'কেন্টের রুব্রিকে এই ওষুধের উল্লেখ নেই।'}</p></div>` +
      sourceHtml(rx);
    bindSourceTabs();
    ensureSource(rx.id);
  }

  /* Fetch the source text on first need, then redraw once it lands. Guarded by
     the remedy id so a fast click-through does not repaint a stale remedy. */
  function ensureSource(forId) {
    if (srcDb) return;
    loadSource().then(() => {
      renderList();                       // the EN badges can only show now
      if (S.selected === forId) renderDetail();
    });
  }

  /* ==================== English source layers ====================
     Boericke's Pocket Manual and Clarke's Dictionary, in the original English.

     Sharded by the first letter of the remedy id (Clarke alone is ~9 MB), so a
     visit fetches one ~400 KB shard per source per letter and nothing else.
     Shown *alongside* the Bangla picture, never instead of it, and always under
     an explicit English heading — for the remedies with no Bangla materia medica
     these are the only full drug picture there is, so labelling them honestly
     matters more than making the page look uniform. */
  const SRC_DIR = 'assets/data/materia/';
  const SRC_STORE = 'materia_source_v1';
  let srcIndex = null;                 // materia/index.json
  const shardCache = new Map();        // 'clarke/a' -> entries | null while loading

  async function loadSrcIndex() {
    if (srcIndex) return srcIndex;
    try {
      const r = await fetch(SRC_DIR + 'index.json');
      srcIndex = r.ok ? await r.json() : { sources: {} };
    } catch (e) {
      srcIndex = { sources: {} };
    }
    return srcIndex;
  }

  const shardFor = id => {
    const c = String(id || '').charAt(0).toLowerCase();
    return /[a-z]/.test(c) ? c : '_';
  };

  async function loadShard(src, letter) {
    const key = src + '/' + letter;
    if (shardCache.has(key)) return shardCache.get(key);
    // the index lists the shards each source actually has, so a letter with no
    // entries is skipped rather than fetched and 404'd into the console
    const listed = ((srcIndex.sources || {})[src] || {}).shards;
    if (Array.isArray(listed) && !listed.includes(letter)) {
      shardCache.set(key, {});
      return {};
    }
    let data = {};
    try {
      const r = await fetch(`${SRC_DIR}${src}/${letter}.json`);
      if (r.ok) data = await r.json();
    } catch (e) { /* network failure: treat as no entry */ }
    shardCache.set(key, data);
    return data;
  }

  function srcEntry(src, id) {
    const d = shardCache.get(src + '/' + shardFor(id));
    return d ? d[id] : undefined;
  }

  /* Which sources actually have this remedy — only known once the shard is in,
     so the tabs render after the fetch rather than promising an empty panel. */
  function srcAvailable(id) {
    if (!srcIndex) return [];
    return Object.keys(srcIndex.sources || {}).filter(s => srcEntry(s, id));
  }

  /* Called from renderDetail(), and it repaints — so it must return without
     repainting once everything this remedy needs is already cached, or the two
     would call each other forever. */
  async function ensureSource(id) {
    const letter = shardFor(id);
    const already = srcIndex &&
      Object.keys(srcIndex.sources || {}).every(s => shardCache.has(s + '/' + letter));
    if (already) return;

    await loadSrcIndex();
    const names = Object.keys(srcIndex.sources || {});
    if (!names.length) return;
    await Promise.all(names.map(s => loadShard(s, letter)));
    if (S.selected === id) { renderList(); renderDetail(); }
  }

  function runsHtml(runs) {
    return (runs || []).map(r => r.em ? `<em>${esc(r.t)}</em>` : esc(r.t)).join('');
  }

  const hasSrc = id => srcAvailable(id).length > 0;

  function sourceHtml(rx) {
    const avail = srcAvailable(rx.id);
    if (!avail.length) {
      return srcIndex ? `<div class="md-sec src-block">
        <h5><i class='bx bx-book'></i> মূল ইংরেজি পাঠ</h5>
        <p class="src-none">বোরিক ও ক্লার্ক — কোনোটিতেই এই ওষুধের ভুক্তি নেই।</p></div>` : '';
    }
    // remembered choice, but fall back when this remedy is only in the other book
    let pick = S.source && avail.includes(S.source) ? S.source : avail[0];
    const meta = srcIndex.sources[pick] || {};
    const e = srcEntry(pick, rx.id);
    const tabs = avail.map(s => {
      const m = srcIndex.sources[s] || {};
      return `<button class="src-tab ${s === pick ? 'on' : ''}" data-src="${esc(s)}">
        ${esc(m.title_bn || s)}</button>`;
    }).join('');

    return `<div class="md-sec src-block">
      <h5><i class='bx bx-book'></i> মূল ইংরেজি পাঠ <span class="src-tag">English</span></h5>
      ${avail.length > 1 ? `<div class="src-tabs">${tabs}</div>` : ''}
      <p class="src-cite">${esc(e.name)}${e.common ? ` — ${esc(e.common)}` : ''}
        <span>${esc(meta.author || '')}${meta.edition ? ` · ${esc(meta.edition)}` : ''}</span></p>
      ${e.provenance ? `<p class="src-prov">${runsHtml(e.provenance)}</p>` : ''}
      ${e.lead ? `<p class="src-text">${runsHtml(e.lead)}</p>` : ''}
      ${(e.sections || []).map(x => `<div class="src-sec">
          <b>${x.n ? bn(x.n) + '. ' : ''}${esc(x.hbn || x.h)}${x.hbn ? `<i>${esc(x.h)}</i>` : ''}</b>
          ${runsHtml(x.runs)}
        </div>`).join('')}
      <p class="src-foot">${esc(meta.emphasis_bn || '')}
        ${meta.url ? `<a href="${esc(meta.url)}" target="_blank" rel="noopener">উৎস</a>` : ''}</p>
    </div>`;
  }

  function bindSourceTabs() {
    document.querySelectorAll('#rxDetail .src-tab').forEach(b =>
      b.addEventListener('click', () => {
        S.source = b.dataset.src;
        Shell.store.set(SRC_STORE, S.source);
        renderDetail();
      }));
  }

  /* ==================== compare 2–5 remedies ====================
     Rows are the materia medica headings, columns the remedies, so the eye runs
     across one heading at a time — which is how a differential is actually read.
     Repertorisation hands its selection over through the URL hash
     (`materia.html#compare=ars,puls,bry`), so the two pages need no shared state. */
  const CMP_ROWS = [
    { key: 'bangla_intro', label: 'সংক্ষেপে', kind: 'text' },
    { key: 'keynotes',     label: 'কীনোট',     kind: 'list' },
    { key: 'mental',       label: 'মানসিক',    kind: 'list' },
    { key: 'general',      label: 'সাধারণ',    kind: 'list' },
    { key: 'particular',   label: 'নির্দিষ্ট অঙ্গ', kind: 'list' },
    { key: 'modalities',   label: 'মোডালিটি',  kind: 'list' },
    { key: 'thermal',      label: 'তাপীয়',     kind: 'text' },
    { key: 'cravings',     label: 'আকাঙ্ক্ষা', kind: 'list' },
    { key: 'aversions',    label: 'অরুচি',     kind: 'list' },
    { key: 'sleep',        label: 'ঘুম',       kind: 'text' },
    { key: 'stool',        label: 'মল',        kind: 'text' },
    { key: 'urine',        label: 'প্রস্রাব',  kind: 'text' },
    { key: 'skin',         label: 'ত্বক',      kind: 'text' },
    { key: 'clinical_uses', label: 'ক্লিনিক্যাল', kind: 'list' },
    { key: 'miasm',        label: 'মায়াজম',    kind: 'text' },
    { key: 'family',       label: 'বর্গ',      kind: 'text' },
    { key: 'potency_notes', label: 'শক্তি',    kind: 'text' }
  ];

  function cmpValue(rx, row) {
    if (row.key === 'cravings' || row.key === 'aversions') {
      return (rx.cravings_aversions || {})[row.key] || [];
    }
    return rx[row.key] || (row.kind === 'list' ? [] : '');
  }

  /* One switch, one place. Everything that differs between the two modes is
     expressed as CSS on `body.cmp-mode` — the drug-picture column is simply not
     part of compare mode, so it is hidden by the stylesheet rather than by
     inline styles set from two different functions. */
  function setMode(mode) {
    S.mode = mode;
    document.body.classList.toggle('cmp-mode', mode === 'compare');
    document.querySelectorAll('.mm-mode').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    document.getElementById('cmpTray').hidden = mode !== 'compare';
    document.getElementById('cmpPane').hidden = mode !== 'compare';
    renderList();
    if (mode === 'compare') { renderTray(); renderCompare(); }
    sizeWorkspace();
  }

  function toggleCompare(id) {
    const i = S.compare.indexOf(id);
    if (i >= 0) S.compare.splice(i, 1);
    else if (S.compare.length >= CMP_MAX) {
      Shell.toast(`একসাথে সর্বোচ্চ ${bn(CMP_MAX)}টি ওষুধ তুলনা করা যায়।`, 'warn');
      return;
    } else S.compare.push(id);
    Shell.store.set(CMP_STORE, S.compare);
    renderList(); renderTray(); renderCompare(); updateCmpCount();
  }

  function updateCmpCount() {
    const el = document.getElementById('cmpCount');
    if (!el) return;
    el.hidden = !S.compare.length;
    el.textContent = bn(S.compare.length);
  }

  function renderTray() {
    const chips = document.getElementById('cmpChips');
    const note = document.getElementById('cmpNote');
    if (!chips) return;
    if (!S.compare.length) {
      chips.innerHTML = `<span class="mm-tray-empty">বাঁ দিকের তালিকা থেকে ২–${bn(CMP_MAX)}টি ওষুধে টিক দিন।</span>`;
    } else {
      chips.innerHTML = S.compare.map(id => {
        const rx = S.all.find(r => r.id === id);
        return `<span class="mm-chip">${esc(rx ? (rx.bangla_name || rx.name) : id)}
          <button data-id="${esc(id)}" title="সরান"><i class='bx bx-x'></i></button></span>`;
      }).join('');
      chips.querySelectorAll('button').forEach(b =>
        b.addEventListener('click', () => toggleCompare(b.dataset.id)));
    }
    if (note) note.textContent = S.compare.length
      ? `${bn(S.compare.length)}/${bn(CMP_MAX)} নির্বাচিত`
      : '';
    updateCmpCount();
  }

  function renderCompare() {
    const pane = document.getElementById('cmpPane');
    const table = document.getElementById('cmpTable');
    const title = document.getElementById('cmpTitle');
    if (!table) return;
    const picked = S.compare.map(id => S.all.find(r => r.id === id)).filter(Boolean);

    if (picked.length < 2) {
      title.textContent = 'তুলনা';
      table.innerHTML = `<tbody><tr><td class="mm-empty" style="min-width:0;">
        <i class='bx bx-git-compare'></i>তুলনা করতে অন্তত ২টি ওষুধ বেছে নিন।</td></tr></tbody>`;
      return;
    }
    title.textContent = picked.map(r => r.bangla_name || r.name).join('  ·  ');

    const head = `<thead><tr>
      <th class="cmp-row-h"></th>
      ${picked.map(r => `<th>
        <div class="cmp-rx-bn">${esc(r.bangla_name || r.name)}</div>
        <div class="cmp-rx-en">${esc(r.name)}</div>
      </th>`).join('')}
    </tr></thead>`;

    const body = CMP_ROWS.map(row => {
      const vals = picked.map(r => cmpValue(r, row));
      const filled = vals.filter(v => (Array.isArray(v) ? v.length : v)).length;
      if (!filled) return '';                                   // nobody has it
      // "only differences" drops rows the remedies agree on — for a list that
      // means the same set of entries, not just the same text, so it has to be
      // compared as a normalised set or the filter would never fire
      if (S.onlyDiff && sameAcross(vals)) return '';
      return `<tr>
        <th class="cmp-row-h">${esc(row.label)}</th>
        ${vals.map(v => `<td>${cellHtml(v, vals)}</td>`).join('')}
      </tr>`;
    }).join('');

    table.innerHTML = head + `<tbody>${body}</tbody>`;
    pane.hidden = S.mode !== 'compare';
  }

  function sameAcross(vals) {
    const sig = v => Array.isArray(v)
      ? v.map(norm).sort().join('|')
      : norm(v);
    const first = sig(vals[0]);
    return vals.every(v => sig(v) === first);
  }

  /* A value only one remedy in the set has is the discriminating one, so it is
     highlighted — that is the whole point of putting them side by side. */
  function cellHtml(v, allVals) {
    if (Array.isArray(v)) {
      if (!v.length) return `<span class="cmp-none">—</span>`;
      const counts = new Map();
      allVals.forEach(list => (Array.isArray(list) ? list : []).forEach(x => {
        const k = norm(x);
        counts.set(k, (counts.get(k) || 0) + 1);
      }));
      return `<ul>${v.map(x => {
        const uniq = counts.get(norm(x)) === 1 && allVals.length > 1;
        return `<li>${uniq ? `<span class="cmp-uniq">${esc(x)}</span>` : esc(x)}</li>`;
      }).join('')}</ul>`;
    }
    return v ? esc(v) : `<span class="cmp-none">—</span>`;
  }

  function cmpAsText() {
    const picked = S.compare.map(id => S.all.find(r => r.id === id)).filter(Boolean);
    if (picked.length < 2) return '';
    const L = ['ওষুধ তুলনা — ' + picked.map(r => r.bangla_name || r.name).join(' · '), ''];
    CMP_ROWS.forEach(row => {
      const vals = picked.map(r => cmpValue(r, row));
      if (!vals.some(v => (Array.isArray(v) ? v.length : v))) return;
      L.push(row.label + ':');
      picked.forEach((r, i) => {
        const v = vals[i];
        const txt = Array.isArray(v) ? (v.length ? v.join('; ') : '—') : (v || '—');
        L.push(`  ${r.bangla_name || r.name}: ${txt}`);
      });
      L.push('');
    });
    L.push('সূত্র: হোমিও কেস স্টুডিও — মেটেরিয়া মেডিকা তুলনা');
    return L.join('\n');
  }

  /* Repertorisation sends its picks over in the hash; ids that are not in this
     book are dropped rather than shown as empty columns. */
  function restoreCompare() {
    const m = /[#&]compare=([^&]+)/.exec(location.hash);
    if (m) {
      const ids = decodeURIComponent(m[1]).split(',').map(s => s.trim()).filter(Boolean);
      const known = ids.filter(id => S.all.some(r => r.id === id)).slice(0, CMP_MAX);
      const missing = ids.length - known.length;
      S.compare = known;
      Shell.store.set(CMP_STORE, S.compare);
      if (known.length >= 2) {
        setMode('compare');
        Shell.toast(`${bn(known.length)}টি ওষুধ তুলনার জন্য এসেছে।` +
          (missing ? ` ${bn(missing)}টি এই তালিকায় নেই।` : ''), missing ? 'warn' : 'ok');
      } else if (ids.length) {
        Shell.toast('তুলনার জন্য পাঠানো ওষুধ এই তালিকায় মেলেনি।', 'warn');
      }
      return;
    }
    const saved = Shell.store.get(CMP_STORE, []);
    if (Array.isArray(saved)) S.compare = saved.filter(id => S.all.some(r => r.id === id)).slice(0, CMP_MAX);
    updateCmpCount();
  }

  function bindCompare() {
    document.querySelectorAll('.mm-mode').forEach(b =>
      b.addEventListener('click', () => setMode(b.dataset.mode)));
    const clr = document.getElementById('cmpClear');
    if (clr) clr.addEventListener('click', () => {
      S.compare = [];
      Shell.store.set(CMP_STORE, S.compare);
      renderList(); renderTray(); renderCompare();
    });
    const diff = document.getElementById('cmpOnlyDiff');
    if (diff) diff.addEventListener('click', () => {
      S.onlyDiff = !S.onlyDiff;
      diff.classList.toggle('on', S.onlyDiff);
      renderCompare();
    });
    const cp = document.getElementById('cmpCopy');
    if (cp) cp.addEventListener('click', async () => {
      const t = cmpAsText();
      if (!t) { Shell.toast('অন্তত ২টি ওষুধ বেছে নিন।', 'warn'); return; }
      try { await navigator.clipboard.writeText(t); Shell.toast('তুলনা কপি হয়েছে।', 'ok'); }
      catch (e) { Shell.toast('কপি করা যায়নি।', 'err'); }
    });
  }

  /* ==================== copy / shell wiring ==================== */
  function asText() {
    const rx = S.all.find(r => r.id === S.selected);
    if (!rx) return '';
    const L = [`${rx.bangla_name || rx.name} (${rx.name})`];
    if (rx.family) L.push('বর্গ: ' + rx.family);
    if (rx.thermal) L.push('তাপীয়: ' + rx.thermal);
    if (rx.bangla_intro) L.push('', rx.bangla_intro);
    const sec = (t, arr) => { if (arr && arr.length) { L.push('', t + ':'); arr.forEach(x => L.push('  • ' + x)); } };
    sec('কীনোট', rx.keynotes);
    sec('মানসিক', rx.mental);
    sec('সাধারণ', rx.general);
    sec('নির্দিষ্ট অঙ্গ', rx.particular);
    sec('মোডালিটি', rx.modalities);
    const ca = rx.cravings_aversions || {};
    sec('আকাঙ্ক্ষা', ca.cravings);
    sec('অরুচি', ca.aversions);
    sec('ক্লিনিক্যাল ব্যবহার', rx.clinical_uses);
    if (rx.potency_notes) L.push('', 'শক্তি: ' + rx.potency_notes);
    L.push('', 'সূত্র: হোমিও কেস স্টুডিও — মেটেরিয়া মেডিকা');
    return L.join('\n');
  }

  function bindShell() {
    const actions = document.getElementById('pageActions');
    if (actions) {
      actions.innerHTML = `
        <button class="btn ghost" id="copyRx"><i class='bx bx-copy'></i> কপি</button>
        <a class="btn ghost" href="repertory.html"><i class='bx bx-book-bookmark'></i> রিপার্টরি</a>`;
      document.getElementById('copyRx').addEventListener('click', async () => {
        const t = asText();
        if (!t) { Shell.toast('আগে একটি ওষুধ বেছে নিন।', 'warn'); return; }
        try { await navigator.clipboard.writeText(t); Shell.toast('মেটেরিয়া মেডিকা কপি হয়েছে।', 'ok'); }
        catch (e) { Shell.toast('কপি করা যায়নি।', 'err'); }
      });
    }

    const inp = document.getElementById('rxSearch');
    const clr = document.getElementById('rxSearchClear');
    inp.addEventListener('input', () => {
      S.search = inp.value;
      clr.style.display = inp.value ? '' : 'none';
      renderList();
    });
    clr.addEventListener('click', () => {
      inp.value = ''; S.search = ''; clr.style.display = 'none';
      renderList(); inp.focus();
    });

    const bar = document.getElementById('mmToolbar');
    const tgl = document.getElementById('mmToggle');
    const sets = document.getElementById('mmSets');
    if (bar && tgl) {
      tgl.addEventListener('click', () => bar.classList.toggle('open'));
      // the chip tray animates its height, so the split can only be re-measured
      // once that settles — measuring on click reads the pre-transition height
      if (sets) sets.addEventListener('transitionend', e => {
        if (e.propertyName === 'max-height') sizeWorkspace();
      });
    }

    let t = null;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { sizeToolbar(); sizeWorkspace(); }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
