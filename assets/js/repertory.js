/* ==========================================================================
   Repertory module — repertory picker → rubric selection → repertorisation
   → remedy analysis.

   Data contract (assets/data/repatories/index.json lists the books):
     { schema: 2,
       shared_remedies: 'remedies.json',
       repertories: [{ id, file, name_bn, name_en, author, ... }] }

   The remedy roster, the Bangla glossary and the search index live in ONE
   shared file rather than inside each book: they are identical for every
   repertory, and keeping a copy per book both wasted 2.5 MB and meant a new
   drug picture had to be written into three files in lockstep. Rubrics address
   remedies by integer index into that shared array, so switching books reuses
   the already-fetched roster and only pays for the new rubrics.

   Each rubrics file is normalised by normalise() below, so a new book only has
   to be *close* to this shape:
     repertory_rubrics: [ { chapter, rubrics: [ { name, remedies: {name: grade} } ] } ]
   ========================================================================== */
(function () {
  'use strict';

  const DIR = 'assets/data/repatories/';
  const STORE = 'repertory_case_v1';
  const ROW_CAP = 60;               // grid rows drawn before the "show all" note
  const LIST_CAP = 250;             // rubric rows drawn at once (a full Kent is ~69,000)
  const bn = v => Shell.bnNum(v);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9ঀ-৿]/g, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const S = {
    manifest: null,
    book: null,        // normalised repertory
    bookMeta: null,    // manifest entry
    step: 1,
    chapter: 'all',
    search: '',
    page: 0,           // rubric-list page (LIST_CAP rows each)
    picked: new Map(), // rubricId -> intensity 1..3
    sort: 'coverage',
    onlyFull: false,
    showAll: false,
    selectedRemedy: null,
    compare: new Set(),  // remedy keys ticked for the materia-medica comparison
    revChapter: null,    // which chapter is expanded in the reversed rubric view
    source: null,        // which English source the step-4 card is showing
    result: null,
    recentRubrics: []    // Phase 5: track last 20 used rubrics
  };

  /* ==================== Phase 5: Repertory UX ==================== */

  // Fuzzy search: "hesache" → "Headache" (typo tolerance)
  function fuzzyMatch(haystack, needle) {
    haystack = norm(haystack);
    needle = norm(needle);
    let h = 0, n = 0;
    while (h < haystack.length && n < needle.length) {
      if (haystack[h] === needle[n]) n++;
      h++;
    }
    return n === needle.length;
  }

  // Bilingual search: Bangla symptoms → English rubrics
  // Bengali symptom words mapped to common rubric keywords
  const BN_TO_EN_MAP = {
    'মাথা': 'head',
    'ব্যথা': 'pain',
    'জ্বর': 'fever',
    'কাশি': 'cough',
    'গলা': 'throat',
    'পেট': 'stomach',
    'বমি': 'vomit',
    'দুর্বল': 'weak',
    'ঘুম': 'sleep',
    'উদ্বেগ': 'anxiety',
    'শ্বাস': 'breath',
    'হৃদয়': 'heart',
    'চোখ': 'eye',
    'কান': 'ear',
    'নাক': 'nose',
    'দাত': 'tooth',
    'ত্বক': 'skin',
    'চর্ম': 'skin',
    'যৌন': 'sexual',
    'মাসিক': 'menses',
    'জরায়ু': 'uterus',
    'স্তন': 'breast'
  };

  function bilingualSearch(text) {
    let expanded = text;
    for (const [bn, en] of Object.entries(BN_TO_EN_MAP)) {
      if (text.includes(bn)) expanded += ' ' + en;
    }
    return expanded;
  }

  // Recent rubrics: track and retrieve last 20 used
  function trackRecentRubric(rubricId, rubricName) {
    const RECENT_KEY = 'repertory_recent_rubrics_v1';
    const stored = Shell.store.get(RECENT_KEY, []);
    const entry = { id: rubricId, name: rubricName, at: new Date().toISOString() };
    const deduped = stored.filter(r => r.id !== rubricId);
    deduped.unshift(entry);
    Shell.store.set(RECENT_KEY, deduped.slice(0, 20)); // keep last 20
    S.recentRubrics = deduped.slice(0, 20);
  }

  function getRecentRubrics() {
    const RECENT_KEY = 'repertory_recent_rubrics_v1';
    return Shell.store.get(RECENT_KEY, []).slice(0, 20);
  }

  // Rubric preview: top N remedies for a rubric
  function rubricPreview(rubric, maxRemedies = 5) {
    if (!rubric.remedies) return '';
    const rems = Object.entries(rubric.remedies)
      .sort((a, b) => (b[1] || 1) - (a[1] || 1))
      .slice(0, maxRemedies)
      .map(([rx, gr]) => `<div class="rp-preview-item">${esc(rx)}<span class="rp-grade">${bn(gr || 1)}</span></div>`)
      .join('');
    return `<div class="rp-preview">${rems}</div>`;
  }

  /* ==================== load ==================== */
  // one fetch for the whole chapter glyph set; inlined so <use href="#ch-…"> resolves
  async function loadSprite() {
    const host = document.getElementById('iconSprite');
    if (!host) return;
    try {
      const r = await fetch('assets/img/chapter-icons.svg');
      if (r.ok) host.innerHTML = await r.text();
    } catch (e) { /* chips fall back to the number badge */ }
  }

  async function boot() {
    loadSprite();
    try {
      const r = await fetch(DIR + 'index.json');
      S.manifest = await r.json();
    } catch (e) {
      S.manifest = { repertories: [] };
      Shell.toast('রিপার্টরির তালিকা (index.json) পড়া যায়নি।', 'err');
    }
    renderLibrary();
    bindShell();
    S.source = Shell.store.get(SRC_STORE, null);
    renderCaseBridge();
    restore();
  }

  /* ==================== case-form hand-off ====================
     Arriving with ?from=case means the case form sent its symptom phrases over.
     They are shown as one-tap search chips: the prescriber reads the case's own
     words and jumps straight to a matching rubric instead of retyping them, and
     step 4 can push the chosen rubrics back into the six rubric boxes. */
  function fromCase() {
    const b = Shell.bridge.get();
    return (b && (b.from === 'case' || b.from === 'case-applied')) ? b : null;
  }

  function renderCaseBridge() {
    const host = document.getElementById('caseBridge');
    if (!host) return;
    const b = fromCase();
    if (!b) { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    const who = b.patient ? esc(b.patient) : 'কেস';
    const chips = (b.symptoms || []).map((s, i) =>
      `<button class="cb-chip" data-i="${i}" title="${esc(s.label)}">
         <span class="cb-chip-lbl">${esc(s.label)}</span>${esc(s.text)}</button>`).join('');
    host.innerHTML = `
      <div class="cb-head">
        <i class='bx bx-transfer-alt'></i>
        <div><b>${who}-এর কেস থেকে এসেছে</b>
          <span>${(b.symptoms || []).length
            ? 'যেকোনো লক্ষণে চাপ দিলে সেটি রুব্রিক সার্চে বসবে। রুব্রিক বেছে ধাপ ৪-এ গিয়ে কেসে ফেরত পাঠান।'
            : 'কেসে কোনো লক্ষণ লেখা ছিল না — নিজে রুব্রিক খুঁজে নিন, ফেরত পাঠানো যাবে।'}</span>
        </div>
        <button class="btn ghost btn-sm" id="cbDismiss" type="button"><i class='bx bx-x'></i> সরান</button>
      </div>
      ${chips ? `<div class="cb-chips">${chips}</div>` : ''}`;

    host.querySelectorAll('.cb-chip').forEach(btn => btn.addEventListener('click', () => {
      const s = (b.symptoms || [])[+btn.dataset.i];
      if (!s) return;
      const box = document.getElementById('rubSearch');
      if (!box) return;
      box.value = s.text;
      S.search = s.text; S.page = 0;
      document.getElementById('rubSearchClear').style.display = '';
      if (S.book) { renderRubrics(); setStep(2); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else Shell.toast('আগে একটি রিপার্টরি বেছে নিন।', 'warn');
    }));
    const dis = document.getElementById('cbDismiss');
    if (dis) dis.addEventListener('click', () => { Shell.bridge.clear(); renderCaseBridge(); });
  }

  /* Kent repeats the same rubric name in different chapters (62,661 distinct
     names across 66,000 rubrics), so "Anxiety" alone is ambiguous once it lands
     in the case form. The chapter is carried along to keep two picks apart. */
  function pickedRubrics() {
    return [...S.picked.entries()].map(([id, grade]) => {
      const rb = S.book.rubricById.get(id);
      return {
        name: rb ? rb.name : id,
        bn: rb ? rb.bn : '',
        chapter: rb ? (rb.chapterShort || rb.chapterLabel || '') : '',
        page: rb ? rb.page : 0,
        grade,
      };
    });
  }

  /* Push the picked rubrics + the top-ranked remedy back to the case form. */
  function sendToCase() {
    if (!S.picked.size) { Shell.toast('আগে রুব্রিক বাছুন।', 'warn'); return; }
    const rubrics = pickedRubrics();
    const top = S.result && S.result.rows && S.result.rows[0];
    Shell.bridge.patch({
      from: 'repertory',
      book: S.bookMeta ? S.bookMeta.name_bn : '',
      rubrics,
      remedy: top ? { name: top.name, bangla: (top.remedy && top.remedy.bangla_name) || '', total: top.total } : null,
    });
    Shell.toast('কেস ফর্মে পাঠানো হচ্ছে…', 'ok');
    setTimeout(() => { location.href = 'case.html?from=repertory'; }, 350);
  }

  /* The prescription builder opens via a plain link, so the picks have to be in
     the bridge before navigation — `from` is left alone so a case-form hand-off
     still in flight is not mistaken for a repertory one. */
  function stageForPrescription() {
    if (!S.picked.size) return;
    const rubrics = pickedRubrics();
    const rows = (S.result && S.result.rows) || [];
    Shell.bridge.patch({
      book: S.bookMeta ? S.bookMeta.name_bn : '',
      rubrics,
      remedy: rows[0] ? { name: rows[0].name,
                          bangla: (rows[0].remedy && rows[0].remedy.bangla_name) || '',
                          total: rows[0].total } : null,
      // a shortlist lets the builder offer alternatives without re-running anything
      shortlist: rows.slice(0, 8).map(r => ({
        name: r.name, bangla: (r.remedy && r.remedy.bangla_name) || '',
        total: r.total, coverage: r.coverage })),
    });
  }

  /* `gotoStep` is the step to land on once the book is ready — pass 0 to
     skip the jump (restore() needs to repopulate S.picked before deciding
     which step to land on, so it can't let this function jump to step 2
     first and then move again). */
  /* The shared roster is fetched once per page load and reused by every book —
     that is the whole point of splitting it out, so it must not be re-fetched
     when the user switches repertories. */
  let sharedRoster = null;
  async function loadShared() {
    if (sharedRoster) return sharedRoster;
    const name = (S.manifest && S.manifest.shared_remedies) || 'remedies.json';
    const r = await fetch(DIR + name);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + name);
    sharedRoster = await r.json();
    return sharedRoster;
  }

  async function loadBook(entry, gotoStep = 2) {
    Shell.setChip('লোড হচ্ছে…', 'bx-loader-alt', true);
    const holder = document.getElementById('repList');
    holder.querySelectorAll('.rp-book').forEach(b => b.disabled = true);
    try {
      const [shared, r] = await Promise.all([loadShared(), fetch(DIR + entry.file)]);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rubricsDoc = await r.json();
      // present the two files to normalise() as the single shape it already knew
      const raw = Object.assign({}, rubricsDoc, {
        remedies: shared.remedies,
        bn_glossary: shared.bn_glossary,
        search_index: shared.search_index,
      });
      S.book = normalise(raw, entry);
      S.bookMeta = entry;
      S.picked.clear();
      S.chapter = 'all'; S.search = ''; S.showAll = false; S.page = 0;
      renderLibrary();
      renderHealth();
      renderChapters();
      renderRubrics();
      renderTray();
      save();
      Shell.toast(`${entry.name_bn} লোড হয়েছে — ${bn(S.book.stats.rubrics)}টি রুব্রিক, ${bn(S.book.stats.remedies)}টি ওষুধ।`, 'ok');
      if (gotoStep) setStep(gotoStep);
    } catch (e) {
      console.error(e);
      Shell.toast('রিপার্টরি ফাইল লোড করা যায়নি: ' + entry.file, 'err');
    } finally {
      holder.querySelectorAll('.rp-book').forEach(b => b.disabled = false);
      updateChip();
    }
  }

  /* ==================== Bangla rubric names ====================
     Kent's rubric names are compositional ('Pain, stitching, forehead,
     evening'), so the data file ships one glossary of terms instead of 66,000
     translated strings and the name is composed here. A term the glossary does
     not have stays in English — a wrong Bangla rubric name would send the
     practitioner to the wrong rubric, which is worse than an English one. */
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const bnDigits = s => s.replace(/\d/g, d => BN_DIGITS[+d]);
  const RE_CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i;
  const RE_RANGE = /^(\d{1,2})\s*to\s*(\d{1,2})\s*([ap])\.?\s*m\.?$/i;

  function clockBn(hour, minute, mer) {
    const h = +hour;
    const part = mer === 'a' ? (h < 6 ? 'ভোর' : 'সকাল')
                             : (h < 3 ? 'দুপুর' : h < 6 ? 'বিকাল' : 'রাত');
    return part + ' ' + bnDigits(String(h) + (minute ? ':' + minute : '')) + 'টা';
  }

  function segBn(seg, gloss) {
    const s = seg.trim();
    if (!s) return '';
    const hit = gloss[s] || gloss[s.toLowerCase()] ||
                gloss[s.charAt(0).toUpperCase() + s.slice(1)];
    if (hit) return hit;
    let m = RE_CLOCK.exec(s);
    if (m) return clockBn(m[1], m[2], m[3].toLowerCase());
    m = RE_RANGE.exec(s);
    if (m) return clockBn(m[1], null, m[3].toLowerCase()) + ' থেকে ' +
                  clockBn(m[2], null, m[3].toLowerCase());
    return null;
  }

  function composeBn(name, gloss) {
    let any = false;
    const out = name.split(',').map(p => {
      const bnPart = segBn(p, gloss);
      if (bnPart === null) return p.trim();
      any = true;
      return bnPart;
    });
    return any ? out.join(', ') : '';
  }

  /* ==================== normalise any book shape ==================== */
  function normalise(raw, entry) {
    const chapters = [];
    const rubricById = new Map();
    const source = raw.repertory_rubrics || raw.chapters || [];
    const gloss = raw.bn_glossary || {};

    /* Remedy names are interned into one table per book and each rubric keeps
       plain index/grade arrays. Materialising 456,000 {name, grade, bn} objects
       up front — one per grade entry in a complete Kent — is what makes a full
       repertory unloadable; rems() builds them only for the handful of rubrics
       actually in the case. */
    const rxNames = [];
    const rxBn = [];
    const rxIndex = new Map();
    (raw.remedies || []).forEach(rx => {
      rxIndex.set(norm(rx.name), rxNames.length);
      rxNames.push(rx.name);
      rxBn.push(rx.bangla_name || '');
    });
    const intern = name => {
      const k = norm(name);
      let i = rxIndex.get(k);
      if (i === undefined) {
        i = rxNames.length;
        rxIndex.set(k, i);
        rxNames.push(name);
        rxBn.push('');
      }
      return i;
    };

    source.forEach((ch, ci) => {
      const label = ch.chapter || ch.name || ('অধ্যায় ' + (ci + 1));
      const parts = String(label).split(/\s*[-–—]\s*/);
      const chapter = {
        id: 'c' + ci,
        num: ch.number || (ci + 1),
        icon: ch.icon || '',
        en: ch.name_en || (parts[0] ? parts[0].trim() : label),
        bn: ch.name_bn || (parts[1] ? parts[1].trim() : ''),
        label: label,
        rubrics: []
      };
      (ch.rubrics || []).forEach((rb, ri) => {
        const ids = [];
        const gr = [];
        if (typeof rb.r === 'string') {
          // compact-v6: 'index:grade' pairs, grade omitted when 1
          if (rb.r) rb.r.split(',').forEach(tok => {
            const c = tok.indexOf(':');
            ids.push(+(c < 0 ? tok : tok.slice(0, c)));
            gr.push(c < 0 ? 1 : +tok.slice(c + 1) || 1);
          });
        } else if (Array.isArray(rb.remedies)) {
          rb.remedies.forEach(x => {
            ids.push(intern(x.name || x.remedy || String(x)));
            gr.push(+(x.grade || x.g || 1) || 1);
          });
        } else {
          Object.entries(rb.remedies || {}).forEach(([name, grade]) => {
            ids.push(intern(name));
            gr.push(+grade || 1);
          });
        }
        const name = rb.name || rb.rubric || '';
        const rubric = {
          id: chapter.id + ':r' + ri,
          src: rb.src || 'curated',
          name: name,
          bn: rb.bangla_name || rb.bangla || rb.name_bn || composeBn(name, gloss),
          level: rb.level || 1,
          page: rb.page || 0,
          chapterId: chapter.id,
          chapterNum: chapter.num,
          chapterLabel: label,
          chapterShort: chapter.bn || chapter.en,
          ids: ids,
          gr: gr,
          n: ids.length
        };
        chapter.rubrics.push(rubric);
        rubricById.set(rubric.id, rubric);
      });
      chapters.push(chapter);
    });

    // remedy lookup for the materia medica step
    const byKey = new Map();
    (raw.remedies || []).forEach(rx => {
      byKey.set(norm(rx.name), rx);
      if (rx.bangla_name) byKey.set(norm(rx.bangla_name), rx);
    });

    const allRubrics = [...rubricById.values()];
    const book = {
      id: entry.id,
      meta: raw.metadata || {},
      chapters: chapters,
      rubrics: allRubrics,
      rubricById: rubricById,
      remedyByKey: byKey,
      remedyList: raw.remedies || [],
      rxNames: rxNames,
      rxBn: rxBn,
      stats: {
        chapters: chapters.length,
        rubrics: allRubrics.length,
        remedies: (raw.remedies || []).length || rxNames.length,
        rubricTarget: +(raw.metadata || {}).rubric_target || 0
      }
    };
    book.health = audit(book, raw.metadata || {});
    return book;
  }

  /* Materialise one rubric's remedies. Called for rubrics in the case, never
     for the whole book — see the note in normalise(). */
  function rems(rb) {
    const N = S.book.rxNames, B = S.book.rxBn;
    const out = new Array(rb.n);
    for (let i = 0; i < rb.n; i++) {
      const j = rb.ids[i];
      out[i] = { name: N[j] || '?', grade: rb.gr[i], bn: B[j] || '' };
    }
    return out.sort((a, b) => b.grade - a.grade);
  }

  /* ==================== data-health audit ====================
     Placeholder scaffolding must never be mistaken for a real repertory,
     so the page says so up front instead of quietly ranking noise. */
  const PLACEHOLDER = /^(remedy[\s_-]*\d+|remedy-template-\d+|ঔষধ\s*\d+)$/i;
  const pct = (a, b) => Math.round(100 * a / Math.max(1, b));
  /* A share that is real but tiny must not print as "০%" — Bönninghausen's 49
     grade-4 entries are the whole point of his top rank, and rounding them to
     zero says the opposite of the truth. */
  const share = (a, b) => (a > 0 && pct(a, b) === 0) ? '<১%' : bn(pct(a, b)) + '%';

  /* Every published figure is recomputed here from the rubrics actually loaded,
     never read from metadata — metadata is a build-time *claim*, and the point
     of a health panel is to check it. `meta` is used only for things no amount
     of reading the data can recover (which tokens the build had to drop, the
     source edition) and for the cross-check below. */
  function audit(book, meta) {
    const rubrics = book.rubrics;
    const rxNames = book.rxNames;
    const sizes = new Set();
    const rubricNames = new Set();
    const usedIds = new Set();
    const grades = new Map();          // grade -> entry count, as found in the data
    // Capped on purpose: this only has to answer "is every rubric identical?",
    // and collecting all 4,277 of Kent's real patterns to answer that would
    // build 66,000 throwaway strings. It is NOT a publishable statistic —
    // printing the capped value as a fact is the bug this replaces.
    const patternProbe = new Set();
    let cells = 0, placeholders = 0, maxLevel = 0;
    let bnFull = 0, bnPartial = 0, bnNone = 0;

    // per remedy-name checks are done once against the table, not once per cell
    const phId = rxNames.map(n => PLACEHOLDER.test(n));

    rubrics.forEach(rb => {
      rubricNames.add(rb.name);
      sizes.add(rb.n);
      if (rb.level > maxLevel) maxLevel = rb.level;
      if (patternProbe.size < 4) patternProbe.add(rb.gr.join(','));
      cells += rb.n;
      // A rubric name is fully Bangla only when no Latin letter survives in it.
      // This reads the composed name, so it judges Kent/Boericke (composed from
      // the glossary at load) and Bönninghausen (Bangla shipped per rubric) by
      // exactly the same test.
      if (!rb.bn) bnNone++;
      else if (/[A-Za-z]/.test(rb.bn)) bnPartial++;
      else bnFull++;
      for (let i = 0; i < rb.n; i++) {
        const j = rb.ids[i];
        usedIds.add(j);
        if (phId[j]) placeholders++;
        grades.set(rb.gr[i], (grades.get(rb.gr[i]) || 0) + 1);
      }
    });

    const flags = [];
    const phNames = [...usedIds].filter(j => phId[j]).length;
    if (phNames) flags.push({
      k: 'placeholder',
      t: `${bn(phNames)}টি ওষুধের নাম প্লেসহোল্ডার (<code>Remedy 437</code> / <code>remedy-template-0572</code> ধরনের) — মোট নামের
          ${bn(pct(phNames, usedIds.size))}%, আর ${bn(pct(placeholders, cells))}% গ্রেড এন্ট্রি এদের উপর দাঁড়িয়ে`
    });
    const dupRatio = rubrics.length ? rubricNames.size / rubrics.length : 1;
    if (rubrics.length > 50 && dupRatio < 0.5) flags.push({
      k: 'duprubrics',
      t: `${bn(rubrics.length)}টি রুব্রিকের মধ্যে আলাদা নাম মাত্র ${bn(rubricNames.size)}টি —
          একই রুব্রিক গড়ে ${bn((rubrics.length / rubricNames.size).toFixed(1))} বার ভিন্ন ওষুধ নিয়ে ফিরে এসেছে`
    });
    if (patternProbe.size === 1 && rubrics.length > 5) flags.push({
      k: 'uniform',
      t: `সব ${bn(rubrics.length)}টি রুব্রিকে গ্রেডের ধারা হুবহু এক (<code>${[...patternProbe][0]}</code>) — আসল রিপার্টরিতে এটা হয় না`
    });
    if (sizes.size === 1 && rubrics.length > 5) flags.push({
      k: 'fixedsize',
      t: `প্রতিটি রুব্রিকে ঠিক ${bn([...sizes][0])}টি ওষুধ — বাস্তবে রুব্রিকভেদে সংখ্যা বদলায়`
    });
    // a file that declares how big the book should be, but ships less than half
    // of it, is a partial import — none of the three current books declare this,
    // so it stays quiet until a future one does
    const target = +meta.rubric_target || 0;
    if (target && rubrics.length < target * 0.5) flags.push({
      k: 'coverage',
      t: `লক্ষ্য ${bn(target)}টি রুব্রিকের মধ্যে আছে মাত্র ${bn(rubrics.length)}টি
          (${bn(pct(rubrics.length, target))}%) — বইয়ের বড় অংশ এখনো আসেনি`
    });

    // Does the file's own metadata match what the file actually contains? A
    // disagreement means the JSON was edited after the build, so every other
    // number quoted from metadata is suspect too.
    const mismatch = [];
    const claimRub = +meta.rubrics_total || 0;
    if (claimRub && claimRub !== rubrics.length)
      mismatch.push(`রুব্রিক — মেটাডেটা বলে ${bn(claimRub)}, ফাইলে আছে ${bn(rubrics.length)}`);
    const claimCells = +meta.grade_entries || 0;
    if (claimCells && claimCells !== cells)
      mismatch.push(`গ্রেড এন্ট্রি — মেটাডেটা বলে ${bn(claimCells)}, ফাইলে আছে ${bn(cells)}`);
    const claimG = meta.grade_breakdown || null;
    if (claimG) {
      const keys = new Set([...Object.keys(claimG), ...[...grades.keys()].map(String)]);
      [...keys].sort().forEach(k => {
        const a = +claimG[k] || 0, b = grades.get(+k) || 0;
        if (a !== b) mismatch.push(`গ্রেড ${bn(k)} — মেটাডেটা বলে ${bn(a)}, ফাইলে আছে ${bn(b)}`);
      });
    }

    return {
      flags, cells, placeholders, mismatch,
      uniqueNames: usedIds.size,
      tableSize: rxNames.length,
      rubricNames: rubricNames.size,
      maxLevel,
      grades: [...grades.entries()].sort((a, b) => b[0] - a[0]),
      bnFull, bnPartial, bnNone,
      // `scope_note_bn` is deliberately NOT included: it restates the rubric and
      // entry counts as frozen build-time prose, duplicating the recomputed line
      // above it (and the book card right above that) — and it would contradict
      // the recomputed figures if the file were ever edited after the build.
      notes: [meta.materia_medica_note_bn].filter(Boolean),
      usable: flags.length === 0
    };
  }

  /* ==================== step 1 ==================== */
  function renderLibrary() {
    const host = document.getElementById('repList');
    const list = (S.manifest.repertories || []);
    if (!list.length) {
      host.innerHTML = `<div class="rp-empty"><i class='bx bx-book'></i>
        <code>assets/data/repatories/index.json</code>-এ কোনো রিপার্টরি নেই।</div>`;
      return;
    }
    host.innerHTML = list.map(e => {
      const on = S.bookMeta && S.bookMeta.id === e.id;
      const loaded = on && S.book;
      return `<button class="rp-book ${on ? 'selected' : ''}" data-id="${e.id}" type="button">
        <div class="rp-book-top">
          <span class="rp-book-ic" style="${e.color ? `background:${e.color}1a;color:${e.color}` : ''}">
            <i class='bx ${e.icon || 'bx-book-bookmark'}'></i>
          </span>
          <span style="min-width:0;">
            <h4>${esc(e.name_bn)}</h4>
            <span class="rp-book-en">${esc(e.name_en || '')}</span>
          </span>
        </div>
        <p>${esc(e.desc_bn || '')}</p>
        <div class="rp-book-meta">
          ${e.author ? `<span class="rp-tag">${esc(e.author)}</span>` : ''}
          ${e.year ? `<span class="rp-tag">${esc(e.year)}</span>` : ''}
          ${loaded ? `<span class="rp-tag ok">${bn(S.book.stats.chapters)} অধ্যায় · ${bn(S.book.stats.rubrics)} রুব্রিক · ${bn(S.book.stats.remedies)} ওষুধ</span>` : ''}
          ${e.status === 'draft' ? `<span class="rp-tag warn">খসড়া ডেটা</span>` : ''}
          ${e.status === 'curated' ? `<span class="rp-tag ok">যাচাই করা</span>` : ''}
          ${e.status === 'generated' ? `<span class="rp-tag warn">স্বয়ংক্রিয় খসড়া</span>` : ''}
          ${e.size_note ? `<span class="rp-tag">${esc(e.size_note)}</span>` : ''}
        </div>
        <span class="rp-book-pick">${on ? "<i class='bx bx-check-circle'></i> নির্বাচিত" : "<i class='bx bx-download'></i> এই রিপার্টরি ব্যবহার করুন"}</span>
      </button>`;
    }).join('');

    host.querySelectorAll('.rp-book').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = list.find(x => x.id === btn.dataset.id);
        if (!entry) return;
        if (S.bookMeta && S.bookMeta.id === entry.id && S.book) { setStep(2); return; }
        loadBook(entry);
      });
    });

    const planned = (S.manifest.planned || []);
    document.getElementById('repPlanned').innerHTML = planned.length
      ? `<div class="rp-planned"><b>পরে যোগ হবে:</b> ${planned.map(p => esc(p.name_bn)).join(' · ')}।
         নতুন রিপার্টরি যোগ করতে ফাইলটি <code>assets/data/repatories/</code>-এ রাখুন আর
         <code>index.json</code>-এ একটি এন্ট্রি দিন — কোড বদলাতে হবে না।</div>` : '';
  }

  /* The grade split decides how a remedy ranks, so it is stated outright. Grades
     are listed as *found in the data*, highest first — hard-coding 3/2/1 (as this
     used to) silently hid Bönninghausen's grade 4 and made the listed counts fail
     to add up to the entry total. */
  function gradeLine(h) {
    if (!h.grades.length) return '';
    const parts = h.grades.map(([g, n]) =>
      `${bn(g)} — ${bn(n)}টি (${share(n, h.cells)})`);
    const m = S.book.meta;
    return `<p style="font-size:0.8125rem;"><strong>গ্রেড:</strong> ${parts.join(' · ')}
      ${m.grade_note_bn ? `<br><em>${esc(m.grade_note_bn)}</em>` : ''}</p>`;
  }

  /* Tokens the build could not pin to a remedy are gone from the file, so this
     is the one figure that can only come from metadata. When it is absent the
     panel says so rather than leaving a blank that reads as "none dropped". */
  function droppedLine() {
    const m = S.book.meta;
    if (m.dropped_note_bn) return `<p style="font-size:0.8125rem;">${esc(m.dropped_note_bn)}</p>`;
    if (typeof m.dropped_tokens === 'number')
      return `<p style="font-size:0.8125rem;"><strong>বাদ পড়া উল্লেখ:</strong> ${bn(m.dropped_tokens)}টি</p>`;
    return `<p style="font-size:0.8125rem;"><strong>বাদ পড়া উল্লেখ:</strong> এই বিল্ডে হিসাব রাখা হয়নি —
      সংখ্যাটি শূন্য ধরে নেবেন না।</p>`;
  }

  function sourceLine() {
    const s = S.book.meta.source;
    if (!s) return '';
    return `<p style="font-size:0.8125rem;"><strong>উৎস:</strong> ${esc(s.edition_bn || '')}
      ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--primary);">${esc(s.url)}</a>` : ''}
      ${esc(s.original_bn || '')} ${esc(s.typography_bn || '')}</p>`;
  }

  /* Rubrics, distinct names, entries, average width, depth — the size of the
     book as it actually loaded. `rubricNames` matters because a real repertory
     repeats a name across chapters (Kent has 62,661 distinct of 66,000), while
     scaffolding repeats one name endlessly. */
  function sizeLine(h) {
    const st = S.book.stats;
    return `<p><strong>${bn(st.chapters)}</strong>টি অধ্যায় ·
      <strong>${bn(st.rubrics)}</strong>টি রুব্রিক (আলাদা নাম ${bn(h.rubricNames)}টি) ·
      <strong>${bn(h.cells)}</strong>টি গ্রেড এন্ট্রি · রুব্রিকপ্রতি গড়ে
      ${bn((h.cells / Math.max(1, st.rubrics)).toFixed(1))}টি ওষুধ${h.maxLevel
        ? ` · সাব-রুব্রিক ${bn(h.maxLevel)} স্তর পর্যন্ত` : ''}।</p>`;
  }

  /* How many of the shared 725-remedy table this particular book can actually
     reach. Without the denominator the old panel let Bönninghausen's 445 read
     like the whole roster, hiding that 280 remedies are uncitable here. */
  function remedyLine(h) {
    const rest = h.tableSize - h.uniqueNames;
    return `<p style="font-size:0.8125rem;"><strong>ওষুধ:</strong> যৌথ তালিকার ${bn(h.tableSize)}টির মধ্যে
      <strong>${bn(h.uniqueNames)}</strong>টি এই বইতে উল্লিখিত (${bn(pct(h.uniqueNames, h.tableSize))}%)।
      ${rest > 0 ? `বাকি ${bn(rest)}টি এই বইয়ে নেই — অন্য রিপার্টরিতে আছে, তাই তালিকায় রাখা হয়েছে।` : ''}</p>`;
  }

  /* The app's stated goal is Bangla, so the rubric-name coverage is a
     first-class health figure rather than a footnote. Counted from the composed
     names, so it reflects what the reader will actually see in the list. */
  function banglaLine(h) {
    const total = h.bnFull + h.bnPartial + h.bnNone;
    return `<p style="font-size:0.8125rem;"><strong>রুব্রিকের বাংলা নাম:</strong>
      সম্পূর্ণ বাংলা ${bn(h.bnFull)}টি (${share(h.bnFull, total)}) ·
      আংশিক ${bn(h.bnPartial)}টি (${share(h.bnPartial, total)}) ·
      শুধু ইংরেজি ${bn(h.bnNone)}টি (${share(h.bnNone, total)})।
      ${h.bnPartial + h.bnNone ? 'যে পরিভাষার নির্ভরযোগ্য বাংলা এখনো নেই সেটি ইংরেজিতেই রাখা হয়েছে — ভুল অনুবাদের চেয়ে নিরাপদ।' : ''}</p>`;
  }

  function mismatchLine(h) {
    if (!h.mismatch.length) return '';
    return `<div class="health" style="margin-top:0.75rem;">
      <div class="health-head"><i class='bx bx-error-circle'></i> মেটাডেটা ও ফাইলের হিসাব মিলছে না</div>
      <p>ফাইলটি বিল্ডের পরে বদলানো হয়েছে বলে মনে হচ্ছে। উপরের সংখ্যাগুলো ফাইল পড়ে গোনা, তাই সেগুলোই সঠিক।</p>
      <ul>${h.mismatch.map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`;
  }

  function renderHealth() {
    const host = document.getElementById('healthCard');
    if (!S.book) { host.innerHTML = ''; return; }
    const h = S.book.health;
    if (h.usable) {
      host.innerHTML = `<div class="health ok">
        <div class="health-head"><i class='bx bx-check-shield'></i> ডেটা যাচাই উত্তীর্ণ
          <span style="font-weight:500;color:var(--text-muted);font-size:0.75rem;">— নিচের সব সংখ্যা ফাইল পড়ে গোনা</span>
        </div>
        ${sizeLine(h)}
        ${gradeLine(h)}
        ${remedyLine(h)}
        ${banglaLine(h)}
        ${h.notes.map(n => `<p style="font-size:0.8125rem;">${esc(n)}</p>`).join('')}
        ${droppedLine()}
        ${sourceLine()}
        <p style="font-size:0.8125rem;">কোনো প্লেসহোল্ডার ওষুধের নাম নেই — প্রতিটি রুব্রিক–ওষুধ সম্পর্ক ও গ্রেড মূল বই থেকে পড়া।</p>
      </div>
      ${mismatchLine(h)}`;
      return;
    }
    host.innerHTML = `<div class="health">
      <div class="health-head"><i class='bx bx-error'></i> এই রিপার্টরির ডেটা এখনো খসড়া</div>
      <p>ইঞ্জিন ঠিকভাবে কাজ করছে, কিন্তু নিচের কারণে <strong>এই ডেটার ফলাফল ক্লিনিক্যালি ব্যবহার করা যাবে না</strong> —
         আসল রিপার্টরি ফাইল দিলে একই ছক ও র‍্যাঙ্কিং সঠিক ফল দেবে।</p>
      <ul>${h.flags.map(f => `<li>${f.t}</li>`).join('')}</ul>
      <p style="margin-top:0.625rem;">যাচাই: ${bn(h.cells)}টি গ্রেড এন্ট্রির মধ্যে ${bn(h.placeholders)}টি
         প্লেসহোল্ডার নামের ওষুধে (${bn(pct(h.placeholders, h.cells))}%)।</p>
      ${sizeLine(h)}
      ${gradeLine(h)}
    </div>
    ${mismatchLine(h)}`;
  }

  /* ==================== step 2 ==================== */
  function renderChapters() {
    if (!S.book) return;
    document.getElementById('chapterChips').innerHTML =
      `<button class="rp-ch ${S.chapter === 'all' ? 'active' : ''}" data-ch="all">
         <svg class="ch-ic" aria-hidden="true"><use href="#ch-generalities"></use></svg><span class="ch-nm">সব অধ্যায়<span class="ch-en">All chapters</span></span>
         <span class="ch-n">${bn(S.book.stats.rubrics)}</span></button>` +
      S.book.chapters.map(c => `<button class="rp-ch ${S.chapter === c.id ? 'active' : ''}" data-ch="${c.id}"
          title="${bn(c.num)}. ${esc(c.en)}${c.bn ? ' — ' + esc(c.bn) : ''} · ${bn(c.rubrics.length)}টি রুব্রিক">
        ${c.icon ? `<svg class="ch-ic" aria-hidden="true"><use href="#ch-${esc(c.icon)}"></use></svg>` : ''}
        <span class="ch-no">${bn(c.num)}</span>
        <span class="ch-nm">${esc(c.bn || c.en)}${c.bn && c.en ? `<span class="ch-en">${esc(c.en)}</span>` : ''}</span>
        <span class="ch-n">${bn(c.rubrics.length)}</span>
      </button>`).join('');
    document.querySelectorAll('#chapterChips .rp-ch').forEach(b => {
      b.addEventListener('click', () => { S.chapter = b.dataset.ch; S.page = 0; renderChapters(); renderRubrics(); });
    });
    sizeChapterBar();
  }

  // only offer the expand toggle when the chips actually overflow two rows
  function sizeChapterBar() {
    const bar = document.getElementById('chapterBar');
    const chips = document.getElementById('chapterChips');
    if (!bar || !chips) return;
    // a hidden pane measures 0 — decide only once it is actually laid out
    if (!chips.clientHeight && !bar.classList.contains('open')) return;

    const wasOpen = bar.classList.contains('open');
    chips.style.transition = 'none'; // disable animation for measurement

    // measure in collapsed state
    bar.classList.remove('open');
    const collapsedHeight = chips.clientHeight;
    const fullHeight = chips.scrollHeight;
    const fits = fullHeight <= collapsedHeight + 2;
    bar.classList.toggle('no-toggle', fits);

    if (wasOpen) {
      bar.classList.add('open');
    } else {
      // keep the active chapter visible when the bar is collapsed
      const active = chips.querySelector('.rp-ch.active');
      if (active && active.offsetTop > collapsedHeight - 8) {
        bar.classList.add('open');
      }
    }

    // force reflow and restore transition
    void chips.offsetHeight;
    chips.style.transition = '';
  }

  function visibleRubrics() {
    if (!S.book) return [];
    const raw = S.search.trim();
    const q = raw.toLowerCase();
    const expandedQ = bilingualSearch(raw).toLowerCase(); // Phase 5: bilingual search
    const hits = S.book.rubrics.filter(rb => {
      if (S.chapter !== 'all' && rb.chapterId !== S.chapter) return false;
      if (!q) return true;
      // Phase 5: exact match, fuzzy match, or bilingual match
      const nameMatch = rb.name.toLowerCase().includes(q) || fuzzyMatch(rb.name, q);
      const bnMatch = rb.bn && (rb.bn.includes(raw) || expandedQ.split(/\s+/).some(w => rb.name.toLowerCase().includes(w)));
      const chapterMatch = rb.chapterLabel.toLowerCase().includes(q) || rb.chapterLabel.includes(raw);
      return nameMatch || bnMatch || chapterMatch;
    });
    /* A complete Kent puts ~66,000 rubrics behind one list, and the deepest
       sub-rubrics ('…, evening, bed, in, amel.') outnumber the main ones many
       times over. Shallow rubrics first — with the biggest first inside a level
       — means the head of the list is the part a practitioner reaches for,
       instead of whichever branch happens to come first in the book. */
    return hits.sort((a, b) => a.level - b.level || b.n - a.n ||
                               a.name.localeCompare(b.name));
  }

  // Phase 5: recent rubrics live in their own compact strip above the list,
  // not inside it — so they never eat into the 250-row page the search shares.
  function renderRecentRubrics() {
    const host = document.getElementById('recentRubrics');
    if (!host) return;
    if (!S.book || S.search.trim()) { host.hidden = true; host.innerHTML = ''; return; }
    const recent = getRecentRubrics()
      .map(r => ({ r, rb: S.book.rubrics.find(x => x.id === r.id) }))
      .filter(x => x.rb)
      .slice(0, 10);
    if (!recent.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = `<span class="rp-recent-lbl"><i class='bx bx-time-five'></i> সম্প্রতি</span>` +
      recent.map(({ rb }) => `
        <button type="button" class="rp-recent-chip ${S.picked.has(rb.id) ? 'picked' : ''}" data-id="${rb.id}" title="${esc(rb.name)}${rb.bn ? ' — ' + esc(rb.bn) : ''}">
          ${esc(rb.name)}${rb.bn ? `<span class="rp-recent-bn">${esc(rb.bn)}</span>` : ''}
        </button>`).join('');
    host.querySelectorAll('.rp-recent-chip').forEach(el => {
      el.addEventListener('click', () => toggleRubric(el.dataset.id));
    });
  }

  function renderRubrics() {
    const host = document.getElementById('rubricList');
    renderRecentRubrics();
    if (!S.book) { host.innerHTML = `<div class="rp-empty">আগে একটি রিপার্টরি বেছে নিন।</div>`; return; }
    const all = visibleRubrics();

    // Paginate rather than truncate. Telling someone "250 of 66,000 shown, go
    // search" leaves the rest unreachable by browsing — the pages make every
    // rubric walkable even with no search term.
    const pages = Math.max(1, Math.ceil(all.length / LIST_CAP));
    if (S.page >= pages) S.page = pages - 1;
    if (S.page < 0) S.page = 0;
    const from = S.page * LIST_CAP;
    const rows = all.slice(from, from + LIST_CAP);

    document.getElementById('rubHint').innerHTML = all.length
      ? `${bn(from + 1)}–${bn(from + rows.length)} / <strong>${bn(all.length)}</strong>টি`
        + (pages > 1 ? ` · পৃষ্ঠা ${bn(S.page + 1)}/${bn(pages)}` : '')
        + ` · মোট ${bn(S.book.stats.rubrics)}টি`
      : `মোট ${bn(S.book.stats.rubrics)}টি রুব্রিক`;

    if (!rows.length) { host.innerHTML = `<div class="rp-empty"><i class='bx bx-search-alt'></i>কোনো রুব্রিক মেলেনি।</div>`; return; }

    // Phase 5: Group rubrics by chapter for better organization
    let html = '';
    let currentChapter = null;
    rows.forEach((rb, idx) => {
      if (rb.chapterId !== currentChapter) {
        if (currentChapter !== null) html += '</div>';
        currentChapter = rb.chapterId;
        html += `<div class="rub-chapter-group" data-chapter="${currentChapter}"><h4 class="rub-chapter-title">${esc(rb.chapterLabel)}</h4>`;
      }
      html += `
      <div class="rub ${S.picked.has(rb.id) ? 'picked' : ''}" data-id="${rb.id}" title="রুব্রিক #${idx+1}">
        <span class="rub-plus"><i class='bx ${S.picked.has(rb.id) ? 'bx-check' : 'bx-plus'}'></i></span>
        <span class="rub-txt">
          <span class="rub-name">${esc(rb.name)}${rb.bn ? ` <span style="color:var(--text-muted);font-size:0.8125rem;">${esc(rb.bn)}</span>` : ''}${rb.level > 1 ? ` <span class="rub-lvl" title="${bn(rb.level)} স্তরের সাব-রুব্রিক">${'·'.repeat(Math.min(rb.level - 1, 6))}</span>` : ''}</span>
          <span class="rub-ch">${rb.page ? ` · পৃ. ${bn(rb.page)}` : ''}</span>
        </span>
        <span class="rub-n rub-n-${Math.min(rb.n, 50)}" title="${bn(rb.n)} ওষুধ">${bn(rb.n)}</span>
        ${rubricPreview(rb, 5)}
      </div>`;
    });
    if (currentChapter !== null) html += '</div>';
    host.innerHTML = html + pagerHtml(pages);

    host.querySelectorAll('.rub').forEach(el => {
      el.addEventListener('click', () => toggleRubric(el.dataset.id));
    });
    // Phase 5: Drag-to-reorder (on tray list)
    host.querySelectorAll('[draggable="true"]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.id);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    host.querySelectorAll('.pg-btn').forEach(b => b.addEventListener('click', () => {
      S.page = +b.dataset.p;
      renderRubrics();
      const sc = document.getElementById('rubricList');
      if (sc) sc.scrollTop = 0;         // a new page starts at its own top
    }));
  }

  /* Page numbers around the current one, with first/last always reachable —
     66,000 rubrics is 264 pages, so a full run of numbers is not an option. */
  function pageWindow(page, pages) {
    const out = new Set([0, pages - 1, page]);
    for (let d = 1; d <= 2; d++) {
      if (page - d >= 0) out.add(page - d);
      if (page + d < pages) out.add(page + d);
    }
    return [...out].sort((a, b) => a - b);
  }

  function pagerHtml(pages) {
    if (pages <= 1) return '';
    const nums = pageWindow(S.page, pages);
    let html = `<div class="rp-pager">
      <button class="pg-btn pg-arrow" data-p="${S.page - 1}" ${S.page === 0 ? 'disabled' : ''}
              title="আগের পৃষ্ঠা"><i class='bx bx-chevron-left'></i></button>`;
    let prev = -1;
    nums.forEach(n => {
      if (prev >= 0 && n > prev + 1) html += `<span class="pg-gap">…</span>`;
      html += `<button class="pg-btn ${n === S.page ? 'active' : ''}" data-p="${n}">${bn(n + 1)}</button>`;
      prev = n;
    });
    html += `<button class="pg-btn pg-arrow" data-p="${S.page + 1}" ${S.page === pages - 1 ? 'disabled' : ''}
              title="পরের পৃষ্ঠা"><i class='bx bx-chevron-right'></i></button></div>`;
    return html;
  }

  function toggleRubric(id) {
    if (S.picked.has(id)) S.picked.delete(id);
    else {
      S.picked.set(id, 2);           // default patient intensity = 2
      // Phase 5: track recent rubric
      const rb = S.book.rubrics.find(r => r.id === id);
      if (rb) trackRecentRubric(id, rb.name);
    }
    save(); renderRubrics(); renderTray();
  }

  function renderTray() {
    const host = document.getElementById('trayList');
    const n = S.picked.size;
    document.getElementById('trayCount').textContent = `${bn(n)}টি রুব্রিক`;
    document.getElementById('toStep3').disabled = n === 0;
    document.getElementById('s2Meta').textContent = n ? `${bn(n)}টি নির্বাচিত` : 'অধ্যায় ও লক্ষণ';
    updateChip();
    updateNav();

    if (!n) {
      host.innerHTML = `<div class="rp-empty"><i class='bx bx-collection'></i>
        বাঁ পাশ থেকে রুব্রিকে ক্লিক করে এখানে যোগ করুন।<br/>একই লক্ষণের একাধিক রুব্রিক নিলে ফল আরও নির্দিষ্ট হয়।</div>`;
      return;
    }
    host.innerHTML = [...S.picked.entries()].map(([id, inten]) => {
      const rb = S.book.rubricById.get(id);
      if (!rb) return '';
      const top = rems(rb).slice(0, 4).map(r => `${esc(r.bn || r.name)} <b>${bn(r.grade)}</b>`).join(', ');
      return `<div class="tray-item" data-id="${id}">
        <div class="tray-top">
          <span class="tray-name">${esc(rb.name)}<small>${esc(rb.chapterLabel)}</small></span>
          <button class="tray-x" title="সরান"><i class='bx bx-x'></i></button>
        </div>
        <div class="tray-grades">
          <span class="flabel">তীব্রতা:</span>
          ${[1, 2, 3].map(g => `<button class="gbtn ${inten === g ? 'on' : ''}" data-g="${g}">${bn(g)}</button>`).join('')}
          <span class="rub-n" style="margin-left:auto;">${bn(rb.n)} ওষুধ</span>
        </div>
        <div class="tray-rem">${top}${rb.n > 4 ? ' …' : ''}</div>
      </div>`;
    }).join('');

    host.querySelectorAll('.tray-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('.tray-x').addEventListener('click', () => { S.picked.delete(id); save(); renderRubrics(); renderTray(); });
      item.querySelectorAll('.gbtn').forEach(b => b.addEventListener('click', () => {
        S.picked.set(id, +b.dataset.g); save(); renderTray();
      }));
    });
  }

  /* ==================== step 3 · repertorisation ==================== */
  function repertorise() {
    const rubrics = [...S.picked.keys()].map(id => S.book.rubricById.get(id)).filter(Boolean);
    const rows = new Map();   // key -> {name, cells{rubricId:grade}, total, coverage}

    rubrics.forEach(rb => {
      const intensity = S.picked.get(rb.id) || 1;
      rems(rb).forEach(r => {
        const k = norm(r.name);
        if (!rows.has(k)) rows.set(k, { key: k, name: r.name, cells: {}, total: 0, coverage: 0, maxGrade: 0 });
        const row = rows.get(k);
        // a remedy repeated in one rubric keeps its highest grade
        const prev = row.cells[rb.id] || 0;
        if (r.grade > prev) {
          row.total += (r.grade - prev) * intensity;
          if (!prev) row.coverage += 1;
          row.cells[rb.id] = r.grade;
          row.maxGrade = Math.max(row.maxGrade, r.grade);
        }
      });
    });

    const list = [...rows.values()].map(r => {
      const rx = S.book.remedyByKey.get(r.key);
      return Object.assign(r, {
        placeholder: /^remedy\s*\d+$/i.test(r.name),
        bangla: rx ? rx.bangla_name : '',
        remedy: rx || null
      });
    });
    sortRows(list);
    return { rubrics: rubrics, rows: list, maxCoverage: rubrics.length };
  }

  function sortRows(list) {
    if (S.sort === 'total') list.sort((a, b) => b.total - a.total || b.coverage - a.coverage || a.name.localeCompare(b.name));
    else list.sort((a, b) => b.coverage - a.coverage || b.total - a.total || a.name.localeCompare(b.name));
  }

  function renderGrid() {
    if (!S.book || !S.picked.size) return;
    S.result = repertorise();
    const { rubrics, rows } = S.result;

    document.getElementById('gridMeta').textContent =
      `${bn(rubrics.length)}টি রুব্রিক · ${bn(rows.length)}টি ওষুধ মিলেছে`;
    document.getElementById('s3Meta').textContent = `${bn(rows.length)}টি ওষুধ`;

    let shown = rows.filter(r => !S.onlyFull || r.coverage === rubrics.length);
    const totalMatching = shown.length;
    if (!S.showAll && shown.length > ROW_CAP) shown = shown.slice(0, ROW_CAP);

    document.getElementById('rowLimitNote').innerHTML = totalMatching > shown.length
      ? `শীর্ষ ${bn(shown.length)}টি দেখানো হচ্ছে (মোট ${bn(totalMatching)}) — <a href="#" id="showAllRows" style="color:var(--primary);font-weight:700;">সব দেখুন</a>`
      : `${bn(totalMatching)}টি ওষুধ দেখানো হচ্ছে`;

    const head = `<thead><tr>
        <th class="rx-col">ওষুধ</th>
        ${rubrics.map(rb => `<th title="${esc(rb.name)} — ${esc(rb.chapterLabel)}">
            ${esc(rb.name.length > 14 ? rb.name.slice(0, 13) + '…' : rb.name)}
            <div style="font-weight:400;text-transform:none;color:var(--text-light);">×${bn(S.picked.get(rb.id))}</div>
          </th>`).join('')}
        <th>মোট</th><th>রুব্রিক</th>
      </tr></thead>`;

    const body = `<tbody>${shown.map((r, i) => `
      <tr class="${i === 0 ? 'top' : ''}" data-key="${r.key}">
        <th title="${esc(r.name)}">
          <span class="rx-cmp ${S.compare.has(r.key) ? 'on' : ''}" data-cmp="${r.key}"
                title="তুলনার জন্য বাছুন"><i class='bx bx-check'></i></span>
          <span class="rx-nm">
            <span class="${r.placeholder ? 'ph' : ''}">${esc(r.name)}</span>
            ${r.bangla ? `<span class="rx-bn">${esc(r.bangla)}</span>` : ''}
          </span>
        </th>
        ${rubrics.map(rb => {
          const g = r.cells[rb.id];
          return `<td class="${g ? '' : 'g0'}">${g ? `<span class="gr gr${g}">${bn(g)}</span>` : '·'}</td>`;
        }).join('')}
        <td class="tot">${bn(r.total)}</td>
        <td class="cov">${bn(r.coverage)}/${bn(rubrics.length)}</td>
      </tr>`).join('')}</tbody>`;

    document.getElementById('repGrid').innerHTML = head + body;

    const showAll = document.getElementById('showAllRows');
    if (showAll) showAll.addEventListener('click', e => { e.preventDefault(); S.showAll = true; renderGrid(); });

    document.querySelectorAll('#repGrid tbody tr').forEach(tr => {
      tr.querySelector('th').addEventListener('click', e => {
        if (e.target.closest('.rx-cmp')) return;   // the tick has its own handler
        S.selectedRemedy = tr.dataset.key;
        setStep(4);
      });
    });
    document.querySelectorAll('#repGrid .rx-cmp').forEach(el =>
      el.addEventListener('click', e => {
        e.stopPropagation();
        toggleCompare(el.dataset.cmp);
      }));
    renderCompareBar();
  }

  /* ==================== compare hand-off ====================
     Ticked remedies are sent to materia.html through the URL hash. Their ids
     come from the remedy table this book already carries, so the two pages need
     no shared storage — and a remedy the roster does not know is simply not
     offered, rather than opening an empty column there. */
  const CMP_MAX = 5;

  function toggleCompare(key) {
    if (S.compare.has(key)) S.compare.delete(key);
    else if (S.compare.size >= CMP_MAX) {
      Shell.toast(`একসাথে সর্বোচ্চ ${bn(CMP_MAX)}টি ওষুধ তুলনা করা যায়।`, 'warn');
      return;
    } else S.compare.add(key);
    renderGrid();
  }

  function compareIds() {
    const out = [];
    S.compare.forEach(key => {
      const rx = S.book && S.book.remedyByKey.get(key);
      if (rx && rx.id) out.push(rx.id);
    });
    return out;
  }

  function renderCompareBar() {
    const host = document.getElementById('cmpBar');
    if (!host) return;
    const n = S.compare.size;
    if (!n) {
      host.innerHTML = `<span class="cmp-hint">ওষুধের নামের পাশের বাক্সে টিক দিয়ে ২–${bn(CMP_MAX)}টি ওষুধ তুলনা করুন।</span>`;
      return;
    }
    const ids = compareIds();
    const names = [...S.compare].map(k => {
      const row = S.result && S.result.rows.find(r => r.key === k);
      return row ? (row.bangla || row.name) : k;
    });
    const ready = n >= 2 && ids.length >= 2;
    host.innerHTML = `
      <span class="cmp-hint"><b>${bn(n)}</b>টি নির্বাচিত — ${esc(names.join(', '))}</span>
      <button class="btn ghost btn-sm" id="cmpReset"><i class='bx bx-x'></i> বাদ দিন</button>
      <a class="btn primary btn-sm ${ready ? '' : 'is-off'}" id="cmpGo"
         ${ready ? `href="materia.html#compare=${encodeURIComponent(ids.join(','))}"` : ''}>
        <i class='bx bx-git-compare'></i> নির্বাচিত ওষুধ তুলনা করুন</a>`;
    const rst = document.getElementById('cmpReset');
    if (rst) rst.addEventListener('click', () => { S.compare.clear(); renderGrid(); });
    const go = document.getElementById('cmpGo');
    if (go && !ready) go.addEventListener('click', e => {
      e.preventDefault();
      Shell.toast(ids.length < 2 && n >= 2
        ? 'নির্বাচিত ওষুধগুলোর মেটেরিয়া মেডিকা তালিকায় নেই।'
        : 'তুলনার জন্য অন্তত ২টি ওষুধ বাছুন।', 'warn');
    });
  }

  /* ==================== step 4 · materia medica ==================== */
  function renderTop() {
    const host = document.getElementById('topRemedies');
    if (!S.result) { host.innerHTML = `<div class="rp-empty">আগে রেপার্টরাইজ করুন।</div>`; return; }
    const rows = S.result.rows.slice(0, 25);
    if (!S.selectedRemedy && rows.length) S.selectedRemedy = rows[0].key;
    host.innerHTML = rows.map((r, i) => `
      <div class="top-rx ${S.selectedRemedy === r.key ? 'on' : ''}" data-key="${r.key}">
        <span class="top-rank">${bn(i + 1)}</span>
        <span class="top-nm ${r.placeholder ? 'ph' : ''}">${esc(r.name)}
          <small>${r.bangla ? esc(r.bangla) + ' · ' : ''}${bn(r.coverage)}/${bn(S.result.maxCoverage)} রুব্রিক</small></span>
        <span class="top-sc">${bn(r.total)}</span>
      </div>`).join('');
    host.querySelectorAll('.top-rx').forEach(el => el.addEventListener('click', () => {
      S.selectedRemedy = el.dataset.key; renderTop(); renderDetail();
    }));
  }

  function renderDetail() {
    const host = document.getElementById('remedyDetail');
    const row = S.result && S.result.rows.find(r => r.key === S.selectedRemedy);
    if (!row) { host.innerHTML = `<div class="rp-empty"><i class='bx bx-capsule'></i>বাঁ পাশ থেকে একটি ওষুধ বেছে নিন।</div>`; return; }

    const rx = row.remedy;
    if (!rx) {
      host.innerHTML = `<div class="md-head">
          <div><h3>${esc(row.name)}</h3><div class="md-en">রুব্রিক থেকে পাওয়া নাম</div></div>
        </div>
        <div class="health"><div class="health-head"><i class='bx bx-error-circle'></i> মেটেরিয়া মেডিকা নেই</div>
        <p>${row.placeholder
            ? 'এটি রিপার্টরি ফাইলের একটি <strong>প্লেসহোল্ডার নাম</strong> — আসল ওষুধ নয়। ডেটা আপডেট করলে এখানে বিস্তারিত আসবে।'
            : 'এই ওষুধটি রিপার্টরিতে আছে কিন্তু মেটেরিয়া মেডিকা তালিকায় নেই। নাম মিলিয়ে দেখুন।'}</p></div>
        ${scoreBox(row)}`;
      return;
    }

    if (rx.content_status === 'basic') {
      host.innerHTML = `
        <div class="md-head"><div style="min-width:0;">
          <h3>${esc(rx.bangla_name || rx.name)}</h3>
          <div class="md-en">${esc(rx.name)}${rx.family ? ' · ' + esc(rx.family) : ''}</div>
        </div></div>
        ${scoreBox(row)}
        <div class="md-sec"><div class="md-kv">
          ${rx.thermal ? `<div><span>তাপীয়</span><b>${esc(rx.thermal)}</b></div>` : ''}
          ${rx.miasm ? `<div><span>মায়াজম</span><b>${esc(rx.miasm)}</b></div>` : ''}
          ${rx.family ? `<div><span>বর্গ</span><b>${esc(rx.family)}</b></div>` : ''}
        </div></div>
        <div class="health" style="margin-top:1rem;">
          <div class="health-head"><i class='bx bx-info-circle'></i> মেটেরিয়া মেডিকা এখনো যোগ করা হয়নি</div>
          <p>এই ওষুধটি রিপার্টরিতে সঠিক নামে ও গ্রেডে আছে, তবে এর বাংলা মেটেরিয়া মেডিকা এখনো লেখা হয়নি —
             <strong>বানানো লক্ষণ যোগ করা হয়নি</strong>। মেটেরিয়া মেডিকা থেকে মিলিয়ে নিন।</p>
        </div>
        ${sourceHtml(rx)}
        ${reversedHtml(rx.name)}`;
      bindReversed();
      bindSourceTabs();
      ensureSource(rx.id, S.selectedRemedy);
      return;
    }

    const list = (arr, t, ic) => (arr && arr.length)
      ? `<div class="md-sec"><h5><i class='bx ${ic}'></i> ${t}</h5><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const pills = (arr, t, ic) => (arr && arr.length)
      ? `<div class="md-sec"><h5><i class='bx ${ic}'></i> ${t}</h5><div class="md-pills">${arr.map(x => `<span class="md-pill">${esc(x)}</span>`).join('')}</div></div>` : '';
    const ca = rx.cravings_aversions || {};
    const rel = rx.relationships || {};

    host.innerHTML = `
      <div class="md-head">
        <div style="min-width:0;">
          <h3>${esc(rx.bangla_name || rx.name)}</h3>
          <div class="md-en">${esc(rx.name)}${rx.family ? ' · ' + esc(rx.family) : ''}</div>
        </div>
      </div>
      ${scoreBox(row)}
      ${rx.bangla_intro ? `<p style="font-size:0.9375rem;line-height:1.7;color:var(--text);margin-top:0.875rem;">${esc(rx.bangla_intro)}</p>` : ''}
      <div class="md-sec"><div class="md-kv">
        ${rx.thermal ? `<div><span>তাপীয়</span><b>${esc(rx.thermal)}</b></div>` : ''}
        ${rx.miasm ? `<div><span>মায়াজম</span><b>${esc(rx.miasm)}</b></div>` : ''}
        ${rx.grade ? `<div><span>গ্রেড</span><b>${bn(rx.grade)}</b></div>` : ''}
        ${rx.sleep ? `<div><span>ঘুম</span><b>${esc(rx.sleep)}</b></div>` : ''}
        ${rx.dreams ? `<div><span>স্বপ্ন</span><b>${esc(rx.dreams)}</b></div>` : ''}
        ${rx.stool ? `<div><span>মল</span><b>${esc(rx.stool)}</b></div>` : ''}
        ${rx.urine ? `<div><span>প্রস্রাব</span><b>${esc(rx.urine)}</b></div>` : ''}
        ${rx.skin ? `<div><span>ত্বক</span><b>${esc(rx.skin)}</b></div>` : ''}
      </div></div>
      ${list(rx.keynotes, 'কীনোট', 'bx-key')}
      ${list(rx.mental, 'মানসিক', 'bx-brain')}
      ${list(rx.general, 'সাধারণ', 'bx-body')}
      ${list(rx.particular, 'নির্দিষ্ট অঙ্গ', 'bx-target-lock')}
      ${list(rx.modalities, 'মোডালিটি', 'bx-transfer')}
      ${pills(ca.cravings, 'আকাঙ্ক্ষা', 'bx-cookie')}
      ${pills(ca.aversions, 'অরুচি', 'bx-block')}
      ${pills(rx.clinical_uses, 'ক্লিনিক্যাল ব্যবহার', 'bx-plus-medical')}
      ${pills(rel.complementary, 'পরিপূরক ওষুধ', 'bx-link')}
      ${pills(rel.antidote, 'প্রতিষেধক', 'bx-shield')}
      ${pills(rel.inimical, 'বিরুদ্ধ ওষুধ', 'bx-x-circle')}
      ${rx.potency_notes ? `<div class="md-sec"><h5><i class='bx bx-injection'></i> শক্তি</h5><p>${esc(rx.potency_notes)}</p></div>` : ''}
      ${sourceHtml(rx)}
      ${reversedHtml(rx.name)}
      <div class="sub-card warning-card" style="margin-top:1rem;">
        <p style="font-size:0.875rem;line-height:1.65;margin:0;">রেপার্টরাইজেশনের র‍্যাঙ্ক শুধু ইঙ্গিত — মেটেরিয়া মেডিকার সাথে রোগীর সামগ্রিক ছবি না মিললে এই ওষুধ নয়।</p>
      </div>`;
    bindReversed();
    bindSourceTabs();
    ensureSource(rx.id, S.selectedRemedy);
  }

  /* ==================== reversed view ====================
     Every rubric a remedy appears in, grouped by chapter — the remedy-side
     reading of the book (what homeoint.org publishes as the "reversed Kent").
     It is computed here from the loaded book rather than shipped: inverting the
     index would duplicate all 455,905 entries in the file, while scanning for
     one remedy costs a few milliseconds and always agrees with the forward data. */
  const REV_CAP = 400;              // rows drawn before "show more" (whole list or one chapter)
  let revKey = null;                 // which remedy S.revChapter's filter belongs to

  function reversedRubrics(name) {
    const idx = S.book.rxNames.findIndex(n => norm(n) === norm(name));
    if (idx < 0) return [];
    const out = [];
    S.book.chapters.forEach(ch => {
      ch.rubrics.forEach(rb => {
        const pos = rb.ids.indexOf(idx);
        if (pos >= 0) out.push({ rb, grade: rb.gr[pos], chapterId: ch.id, chapterLabel: ch.bn || ch.en });
      });
    });
    return out;
  }

  function reversedHtml(name) {
    // switching remedies must drop the previous remedy's chapter filter
    if (S.selectedRemedy !== revKey) { S.revChapter = null; revKey = S.selectedRemedy; }
    const all = reversedRubrics(name);
    if (!all.length) return '';

    const counts = new Map();
    all.forEach(x => counts.set(x.chapterId, (counts.get(x.chapterId) || 0) + 1));
    const chapters = S.book.chapters.filter(ch => counts.has(ch.id));
    if (S.revChapter && !counts.has(S.revChapter)) S.revChapter = null;

    const rows = (S.revChapter ? all.filter(x => x.chapterId === S.revChapter) : all).slice(0, REV_CAP);
    const total = S.revChapter ? counts.get(S.revChapter) : all.length;

    return `
      <div class="md-sec rev-block">
        <h5><i class='bx bx-list-ul'></i> এই ওষুধ যেসব রুব্রিকে আছে (মোট ${bn(all.length)}টি)</h5>
        <div class="rev-chaps">
          <button class="rev-ch ${!S.revChapter ? 'on' : ''}" data-ch="">সব <b>${bn(all.length)}</b></button>
          ${chapters.map(ch => `<button class="rev-ch ${S.revChapter === ch.id ? 'on' : ''}" data-ch="${ch.id}">
            ${esc(ch.bn || ch.en)} <b>${bn(counts.get(ch.id))}</b></button>`).join('')}
        </div>
        <div class="rev-list">
          ${rows.map(x => `<div class="rev-row">
            <span class="rev-nm">${esc(x.rb.name)}${x.rb.bn ? `<span class="rev-bn">${esc(x.rb.bn)}</span>` : ''}</span>
            <span class="rev-pg">${x.rb.page ? 'পৃ. ' + bn(x.rb.page) + ' · ' : ''}গ্রেড ${bn(x.grade)}</span>
          </div>`).join('')}
          ${total > rows.length ? `<div class="rev-more">${bn(rows.length)}/${bn(total)} — বাকিগুলো দেখতে একটি অধ্যায় বেছে নিন</div>` : ''}
        </div>
      </div>`;
  }

  function bindReversed() {
    document.querySelectorAll('.rev-ch').forEach(b => b.addEventListener('click', () => {
      S.revChapter = b.dataset.ch || null;
      renderDetail();
    }));
  }

  /* The English source layers — the same sharded files materia.html reads.
     Fetched per remedy letter on first use; for the remedies with no Bangla
     picture these are the only full drug picture available. */
  const SRC_DIR = 'assets/data/materia/';
  const SRC_STORE = 'materia_source_v1';
  let srcIndex = null;
  const shardCache = new Map();

  async function loadSrcIndex() {
    if (srcIndex) return srcIndex;
    try {
      const r = await fetch(SRC_DIR + 'index.json');
      srcIndex = r.ok ? await r.json() : { sources: {} };
    } catch (e) { srcIndex = { sources: {} }; }
    return srcIndex;
  }

  const shardFor = id => {
    const ch = String(id || '').charAt(0).toLowerCase();
    return /[a-z]/.test(ch) ? ch : '_';
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

  function srcAvailable(id) {
    if (!srcIndex) return [];
    return Object.keys(srcIndex.sources || {}).filter(x => srcEntry(x, id));
  }

  // repaints, and renderDetail() calls it — so it must bail once cached
  async function ensureSource(rxId, forKey) {
    const letter = shardFor(rxId);
    const already = srcIndex &&
      Object.keys(srcIndex.sources || {}).every(x => shardCache.has(x + '/' + letter));
    if (already) return;
    await loadSrcIndex();
    const names = Object.keys(srcIndex.sources || {});
    if (!names.length) return;
    await Promise.all(names.map(x => loadShard(x, letter)));
    if (S.selectedRemedy === forKey) renderDetail();
  }

  function srcRuns(runs) {
    return (runs || []).map(r => r.em ? `<em>${esc(r.t)}</em>` : esc(r.t)).join('');
  }

  function sourceHtml(rx) {
    if (!rx) return '';
    const avail = srcAvailable(rx.id);
    if (!avail.length) return '';
    let pick = S.source && avail.includes(S.source) ? S.source : avail[0];
    const meta = srcIndex.sources[pick] || {};
    const e = srcEntry(pick, rx.id);
    const tabs = avail.map(x => {
      const m = srcIndex.sources[x] || {};
      return `<button class="src-tab ${x === pick ? 'on' : ''}" data-src="${esc(x)}">${esc(m.title_bn || x)}</button>`;
    }).join('');
    return `<div class="md-sec src-block">
      <h5><i class='bx bx-book'></i> মূল ইংরেজি পাঠ <span class="src-tag">English</span></h5>
      ${avail.length > 1 ? `<div class="src-tabs">${tabs}</div>` : ''}
      <p class="src-cite">${esc(e.name)}${e.common ? ` — ${esc(e.common)}` : ''}
        <span>${esc(meta.author || '')}${meta.edition ? ` · ${esc(meta.edition)}` : ''}</span></p>
      ${e.provenance ? `<p class="src-prov">${srcRuns(e.provenance)}</p>` : ''}
      ${e.lead ? `<p class="src-text">${srcRuns(e.lead)}</p>` : ''}
      ${(e.sections || []).map(x => `<div class="src-sec">
          <b>${x.n ? bn(x.n) + '. ' : ''}${esc(x.hbn || x.h)}${x.hbn ? `<i>${esc(x.h)}</i>` : ''}</b>
          ${srcRuns(x.runs)}</div>`).join('')}
    </div>`;
  }

  function bindSourceTabs() {
    document.querySelectorAll('#remedyDetail .src-tab').forEach(b =>
      b.addEventListener('click', () => {
        S.source = b.dataset.src;
        Shell.store.set(SRC_STORE, S.source);
        renderDetail();
      }));
  }

  function scoreBox(row) {
    return `<div class="md-kv">
      <div><span>মোট স্কোর</span><b>${bn(row.total)}</b></div>
      <div><span>রুব্রিক কভারেজ</span><b>${bn(row.coverage)}/${bn(S.result.maxCoverage)}</b></div>
      <div><span>সর্বোচ্চ গ্রেড</span><b>${bn(row.maxGrade)}</b></div>
    </div>`;
  }

  /* ==================== export ==================== */
  function payload() {
    const r = S.result;
    return {
      meta: {
        tool: 'Homoeo Case Studio — Repertory',
        repertory: S.bookMeta ? { id: S.bookMeta.id, name_en: S.bookMeta.name_en, author: S.bookMeta.author } : null,
        data_quality: S.book ? (S.book.health.usable ? 'ok' : 'draft/placeholder — not clinically usable') : null
      },
      rubrics: r.rubrics.map(rb => ({
        chapter: rb.chapterLabel, rubric: rb.name,
        patient_intensity: S.picked.get(rb.id),
        remedies: rems(rb).map(x => ({ name: x.name, grade: x.grade }))
      })),
      repertorisation: r.rows.slice(0, 30).map((x, i) => ({
        rank: i + 1, remedy: x.name, bangla: x.bangla || null,
        total: x.total, coverage: x.coverage, of: r.maxCoverage,
        placeholder_name: x.placeholder
      })),
      scoring_rule: 'total = Σ (remedy grade × rubric intensity); coverage = rubrics containing the remedy'
    };
  }

  function asText() {
    const r = S.result;
    const L = [];
    L.push('রিপার্টরাইজেশন — ' + (S.bookMeta ? S.bookMeta.name_bn : ''));
    if (S.book && !S.book.health.usable) L.push('⚠ ডেটা খসড়া — ফলাফল ক্লিনিক্যালি ব্যবহারযোগ্য নয়।');
    L.push('');
    L.push('নির্বাচিত রুব্রিক:');
    r.rubrics.forEach(rb => L.push(`  • ${rb.name} (${rb.chapterLabel}) — তীব্রতা ${bn(S.picked.get(rb.id))}`));
    L.push('');
    L.push('ফলাফল (শীর্ষ ১৫):');
    r.rows.slice(0, 15).forEach((x, i) => L.push(`  ${bn(i + 1)}. ${x.name}${x.bangla ? ' (' + x.bangla + ')' : ''} — মোট ${bn(x.total)}, রুব্রিক ${bn(x.coverage)}/${bn(r.maxCoverage)}`));
    return L.join('\n');
  }

  /* ==================== steps & nav ==================== */
  function setStep(n) {
    if (n === 2 && !S.book) return;
    if (n >= 3 && !S.picked.size) return;
    S.step = n;
    document.querySelectorAll('.rp-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + n));
    document.querySelectorAll('.rp-step').forEach(b => {
      const s = +b.dataset.step;
      b.classList.toggle('active', s === n);
      b.classList.toggle('done', s < n);
      b.disabled = (s === 2 && !S.book) || (s >= 3 && !S.picked.size);
    });
    if (n === 2) requestAnimationFrame(sizeChapterBar);
    if (n === 3) renderGrid();
    if (n === 4) { renderGrid(); renderTop(); renderDetail(); renderExport(); }
    updateNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    save();                             // remember the step so a reload restores it, not step 2
  }

  function renderExport() {
    const p = payload();
    document.getElementById('repExport').textContent = JSON.stringify(p, null, 2);
  }

  function updateNav() {
    document.getElementById('rpBack').disabled = S.step === 1;
    const next = document.getElementById('rpNext');
    const can = (S.step === 1 && S.book) || (S.step === 2 && S.picked.size) || (S.step === 3);
    next.disabled = S.step === 4 || !can;
    next.innerHTML = S.step === 3 ? `ওষুধ বিশ্লেষণ <i class='bx bx-chevron-right'></i>` : `পরের ধাপ <i class='bx bx-chevron-right'></i>`;
  }

  function updateChip() {
    if (!S.book) { Shell.setChip('রিপার্টরি বাছুন', 'bx-book', true); return; }
    const n = S.picked.size;
    Shell.setChip(n ? `${bn(n)}টি রুব্রিক · ${S.bookMeta.name_bn}` : S.bookMeta.name_bn, n ? 'bx-collection' : 'bx-book-open', !n);
  }

  /* ==================== persistence ==================== */
  function save() {
    Shell.store.set(STORE, {
      book: S.bookMeta ? S.bookMeta.id : null,
      picked: [...S.picked.entries()],
      step: S.step
    });
  }

  async function restore() {
    const d = Shell.store.get(STORE, null);
    if (!d || !d.book) return;
    const entry = (S.manifest.repertories || []).find(x => x.id === d.book);
    if (!entry) return;
    await loadBook(entry, 0);           // 0: decide the landing step below, once picks are back
    (d.picked || []).forEach(([id, g]) => { if (S.book.rubricById.has(id)) S.picked.set(id, g); });
    if (S.picked.size) {
      renderRubrics(); renderTray();
      Shell.toast(`আগের কেস ফিরিয়ে আনা হয়েছে — ${bn(S.picked.size)}টি রুব্রিক।`, 'ok');
    }
    // land back where the user left off, but don't allow step 3/4 if no rubrics are picked
    let target = d.step || 1;
    if (!S.picked.size && target > 2) target = 2;
    setStep(target);
  }

  /* ==================== wiring ==================== */
  function bindShell() {
    document.querySelectorAll('.rp-step').forEach(b =>
      b.addEventListener('click', () => { if (!b.disabled) setStep(+b.dataset.step); }));
    document.getElementById('rpBack').addEventListener('click', () => setStep(Math.max(1, S.step - 1)));
    document.getElementById('rpNext').addEventListener('click', () => setStep(Math.min(4, S.step + 1)));
    document.getElementById('toStep3').addEventListener('click', () => setStep(3));

    const sb = document.getElementById('rubSearch');
    sb.addEventListener('input', () => {
      S.search = sb.value;
      S.page = 0;                       // a new query starts at page one
      document.getElementById('rubSearchClear').style.display = sb.value ? '' : 'none';
      renderRubrics();
    });
    document.getElementById('rubSearchClear').addEventListener('click', () => {
      sb.value = ''; S.search = ''; S.page = 0;
      document.getElementById('rubSearchClear').style.display = 'none';
      renderRubrics();
    });

    const cbToggle = document.getElementById('chapterToggle');
    if (cbToggle) cbToggle.addEventListener('click', () => {
      document.getElementById('chapterBar').classList.toggle('open');
      sizeChapterBar();
    });
    window.addEventListener('resize', () => sizeChapterBar());

    document.getElementById('trayClear').addEventListener('click', () => {
      if (!S.picked.size) return;
      S.picked.clear(); save(); renderRubrics(); renderTray();
      Shell.toast('কেসের সব রুব্রিক মুছে ফেলা হয়েছে।', 'ok');
    });

    document.querySelectorAll('.rp-sortset .fbtn').forEach(b => b.addEventListener('click', () => {
      S.sort = b.dataset.sort;
      document.querySelectorAll('.rp-sortset .fbtn').forEach(x => x.classList.toggle('active', x === b));
      renderGrid();
    }));
    document.getElementById('onlyFull').addEventListener('change', e => { S.onlyFull = e.target.checked; renderGrid(); });

    document.getElementById('copyRep').addEventListener('click', function () {
      navigator.clipboard.writeText(JSON.stringify(payload(), null, 2))
        .then(() => Shell.toast('JSON কপি হয়েছে।', 'ok'))
        .catch(() => Shell.toast('কপি করা যায়নি।', 'err'));
    });
    document.getElementById('copyTxt').addEventListener('click', () => {
      navigator.clipboard.writeText(asText())
        .then(() => Shell.toast('টেক্সট কপি হয়েছে।', 'ok'))
        .catch(() => Shell.toast('কপি করা যায়নি।', 'err'));
    });
    document.getElementById('dlRep').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'repertorisation.json'; a.click();
      URL.revokeObjectURL(url);
      Shell.toast('ডাউনলোড শুরু হয়েছে।', 'ok');
    });
    const toCase = document.getElementById('toCaseBtn');
    if (toCase) toCase.addEventListener('click', sendToCase);
    // the prescription builder reads the same bridge record, so stage the
    // current picks before following the link rather than after
    const toRx = document.getElementById('toRxBtn');
    if (toRx) toRx.addEventListener('click', () => stageForPrescription());

    updateChip(); updateNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
