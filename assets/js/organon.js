/* ==========================================================================
   অর্গানন অব মেডিসিন — সম্পূর্ণ বাংলা পাঠ
   ডাঃ স্যামুয়েল হ্যানিম্যান · ষষ্ঠ সংস্করণ · সূত্র ১–২৯১

   All 291 aphorisms are rendered once, up front. That is ~300 cards, which
   the browser handles fine, and it buys two things a virtualised list would
   have cost: the browser's own Ctrl+F works across the whole book, and a
   deep link to §153 can scroll straight to a node that already exists.
   ========================================================================== */
'use strict';

(function () {
  const bn = window.Shell ? Shell.bnNum : (v => String(v));
  const store = window.Shell ? Shell.store : {
    get: (k, d) => d, set: () => {}, del: () => {}
  };

  const MARK_KEY = 'organon_marks_v1';
  const FONT_KEY = 'organon_font_v1';
  const SEC_KEY = 'organon_section_v1';
  const FONT_MIN = 0.9375, FONT_MAX = 1.5, FONT_STEP = 0.0625;

  const S = {
    data: null,
    byNum: new Map(),
    secOf: new Map(),        // aphorism number -> section id
    secIx: new Map(),        // section id -> index in data.sections
    sec: null,               // chapter currently on screen
    marks: new Set(store.get(MARK_KEY, [])),
    font: store.get(FONT_KEY, 1.0625),
    q: ''
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ================= load ================= */
  document.addEventListener('DOMContentLoaded', () => {
    applyFont();
    fetch('assets/data/organon.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(json => {
        S.data = json;
        json.aphorisms.forEach(a => {
          S.byNum.set(a.n, a);
          S.secOf.set(a.n, a.section);
        });
        json.sections.forEach((s, i) => S.secIx.set(s.id, i));
        // come back to the chapter you were last reading, not to §1
        const saved = store.get(SEC_KEY, null);
        S.sec = S.secIx.has(saved) ? saved : json.sections[0].id;
        renderStats();
        renderPrinciples();
        renderToc();
        renderStream();
        renderMarks();
        wire();
        openFromHash();
      })
      .catch(e => {
        console.error('অর্গানন ডেটা লোড ব্যর্থ:', e);
        $('orgStream').innerHTML = emptyBox('bx-error',
          'অর্গাননের পাঠ লোড করা যায়নি।');
      });
  });

  function renderStats() {
    const m = S.data.metadata;
    $('orgTotal').textContent = bn(m.aphorisms_total);
    $('orgNotes').textContent = bn(m.footnotes_total);
    $('orgDisc').textContent = m.scope_note_bn + ' ' + m.source_bn + ' ' + m.disclaimer_bn;
    if (window.Shell) Shell.setChip(bn(m.aphorisms_total) + 'টি সূত্র', 'bx-book-content', true);
  }

  const emptyBox = (icon, msg) =>
    `<div class="og-empty"><i class='bx ${icon}'></i><p>${esc(msg)}</p></div>`;

  /* ================= principles ================= */
  function renderPrinciples() {
    $('orgPrinGrid').innerHTML = S.data.principles.map(p => `
      <article class="og-prin">
        <div class="og-prin-top">
          <div class="og-prin-ic"><i class='bx ${esc(p.icon)}'></i></div>
          <h4>${esc(p.title)}</h4>
        </div>
        <p class="og-prin-txt">${esc(p.text)}</p>
        <div class="og-prin-refs">
          ${p.refs.map(n => `<button class="og-ref" data-goto="${n}">§ ${bn(n)}</button>`).join('')}
        </div>
      </article>`).join('');
  }

  /* ================= contents ================= */
  function renderToc() {
    $('orgTocList').innerHTML = S.data.sections.map(s => `
      <button class="og-toc-i" data-sec="${esc(s.id)}">
        <i class='bx ${esc(s.icon)}'></i>
        <span>
          <b>${esc(s.title)}</b>
          <small>§ ${bn(s.from)}–${bn(s.to)}</small>
        </span>
      </button>`).join('');
  }

  /* ================= the text ================= */
  function aphorismHtml(a) {
    const marked = S.marks.has(a.n);
    const fn = a.footnotes.length ? `
      <details class="og-fn">
        <summary><i class='bx bx-chevron-right'></i>হ্যানিম্যানের পাদটীকা (${bn(a.footnotes.length)})</summary>
        <div class="og-fn-body">${a.footnotes.map(t => `<p>${esc(t)}</p>`).join('')}</div>
      </details>` : '';
    return `
      <article class="og-a" id="a${a.n}" data-n="${a.n}">
        <div class="og-a-top">
          <span class="og-n">§ ${bn(a.n)}</span>
          ${a.revised ? `<span class="og-rev">ষষ্ঠ সংস্করণে সংশোধিত</span>` : ''}
          <button class="og-mark${marked ? ' on' : ''}" data-mark="${a.n}"
                  aria-label="চিহ্নিত করুন" aria-pressed="${marked}">
            <i class='bx ${marked ? 'bxs-bookmark' : 'bx-bookmark'}'></i>
          </button>
        </div>
        ${a.body.map(t => `<p>${esc(t)}</p>`).join('')}
        ${fn}
      </article>`;
  }

  /* Render one chapter, not the whole book. End to end the Organon lays out
     to ~182,000px — 215 phone screens — and the browser pays ~208ms of layout
     for it, none of which the reader can use. A chapter is 8-40 aphorisms,
     which is both a sane scroll and a sane unit of study. Search below still
     covers all 291. */
  function renderStream() {
    const s = S.data.sections[S.secIx.get(S.sec)];
    const list = S.data.aphorisms.filter(a => a.section === S.sec);
    $('orgStream').innerHTML =
      `<div class="og-sechead" id="s-${esc(s.id)}">
         <i class='bx ${esc(s.icon)}'></i>
         <h3>${esc(s.title)}</h3>
         <span>§ ${bn(s.from)}–${bn(s.to)}</span>
       </div>` + list.map(aphorismHtml).join('');
    renderWhere(s, list.length);
    renderPager();
    markTocActive(S.sec);
    store.set(SEC_KEY, S.sec);
  }

  function renderWhere(s, count) {
    $('orgWhere').innerHTML =
      `<i class='bx ${esc(s.icon)}'></i><b>${esc(s.title)}</b>
       <span>${bn(count)}টি সূত্র · § ${bn(s.from)}–${bn(s.to)}</span>`;
  }

  function renderPager() {
    const i = S.secIx.get(S.sec);
    const all = S.data.sections;
    const prev = all[i - 1], next = all[i + 1];
    const btn = (s, dir) => s
      ? `<button class="og-pg ${dir}" data-sec="${esc(s.id)}">
           ${dir === 'prev' ? `<i class='bx bx-chevron-right'></i>` : ''}
           <span><small>${dir === 'prev' ? 'আগের অধ্যায়' : 'পরের অধ্যায়'}</small>${esc(s.title)}</span>
           ${dir === 'next' ? `<i class='bx bx-chevron-left'></i>` : ''}
         </button>`
      : `<button class="og-pg ${dir}" disabled><span><small>${
           dir === 'prev' ? 'এটিই প্রথম অধ্যায়' : 'এটিই শেষ অধ্যায়'}</small></span></button>`;
    $('orgPager').innerHTML =
      btn(prev, 'prev') +
      `<button class="og-pg-top" id="orgPagerTop" aria-label="উপরে ফিরুন"><i class='bx bx-up-arrow-alt'></i></button>` +
      btn(next, 'next');
  }

  function setSection(id, { scroll = true } = {}) {
    if (!S.secIx.has(id)) return;
    S.sec = id;
    if (S.q) { $('orgSearch').value = ''; S.q = ''; $('orgSearchX').hidden = true; $('orgStatus').hidden = true; }
    renderStream();
    closeToc();
    if (scroll) scrollToEl($('s-' + id));
    history.replaceState(null, '', '#s-' + id);
  }

  /* content-visibility means off-screen cards have only an estimated height,
     so the first scroll can land short once the real ones resolve. Correcting
     on the next frame costs nothing and removes the drift. */
  function scrollToEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestAnimationFrame(() => setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 260));
  }

  function renderMarks() {
    const n = S.marks.size;
    const pill = $('orgMarkN');
    pill.textContent = bn(n);
    pill.classList.toggle('on', n > 0);
    const host = $('orgMarkStream');
    if (!n) {
      host.innerHTML = emptyBox('bx-bookmark',
        'এখনও কোনো সূত্র চিহ্নিত করা হয়নি। পাঠের যেকোনো সূত্রে বুকমার্ক চিহ্নে ক্লিক করুন।');
      return;
    }
    host.innerHTML = [...S.marks].sort((a, b) => a - b)
      .map(x => aphorismHtml(S.byNum.get(x))).join('');
  }

  /* ================= search =================
     Plain substring over the Bangla, which is what a reader actually wants
     here: they half-remember a phrase, not a stem. Matching is done on the
     source strings and the highlight is re-escaped, so a query containing
     < or & cannot inject markup. */
  function runSearch(q) {
    S.q = q.trim();
    const stream = $('orgStream');
    const status = $('orgStatus');
    $('orgSearchX').hidden = !S.q;

    if (!S.q) {
      renderStream();
      status.hidden = true;
      $('orgPager').hidden = false;
      return;
    }
    // searching leaves chapter mode and looks at the whole book
    const hits = S.data.aphorisms.filter(a =>
      a.body.some(t => t.includes(S.q)) || a.footnotes.some(t => t.includes(S.q)));

    status.hidden = false;
    status.textContent = hits.length
      ? `“${S.q}” — গোটা অর্গাননে ${bn(hits.length)}টি সূত্রে পাওয়া গেছে`
      : `“${S.q}” — কোনো সূত্রে পাওয়া যায়নি`;
    $('orgWhere').innerHTML =
      `<i class='bx bx-search'></i><b>খোঁজার ফলাফল</b><span>সব অধ্যায় জুড়ে</span>`;
    $('orgPager').hidden = true;

    stream.innerHTML = hits.length
      ? hits.map(a => highlight(aphorismHtml(a), S.q)).join('')
      : emptyBox('bx-search-alt', 'অন্য শব্দ দিয়ে চেষ্টা করুন।');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* Highlight only inside text nodes of the already-escaped card markup, so
     the <p>/<button> tags themselves can never be matched and broken. */
  function highlight(html, q) {
    const eq = esc(q);
    if (!eq) return html;
    return html.replace(/>([^<]+)</g, (m, text) =>
      text.includes(eq)
        ? '>' + text.split(eq).join(`<mark class="og-hl">${eq}</mark>`) + '<'
        : m);
  }

  /* ================= navigation ================= */
  /* A § can be anywhere in the book, so jumping to one means switching to its
     chapter first — otherwise the card simply is not in the DOM. */
  function gotoAphorism(n) {
    n = Number(n);
    if (!S.byNum.has(n)) {
      if (window.Shell) Shell.toast(`§ ${bn(n)} নামে কোনো সূত্র নেই।`, 'warn');
      return;
    }
    showPanel('read');
    const sec = S.secOf.get(n);
    if (sec !== S.sec || S.q) {
      S.sec = sec;
      if (S.q) { $('orgSearch').value = ''; S.q = ''; $('orgSearchX').hidden = true; }
      $('orgStatus').hidden = true;
      $('orgPager').hidden = false;
      renderStream();
    }
    closeToc();
    requestAnimationFrame(() => {
      const el = $('a' + n);
      if (!el) return;
      scrollToEl(el);
      el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 1800);
      history.replaceState(null, '', '#a' + n);
    });
  }

  function gotoSection(id) {
    showPanel('read');
    setSection(id);
  }

  function markTocActive(id) {
    document.querySelectorAll('.og-toc-i').forEach(b =>
      b.classList.toggle('on', b.dataset.sec === id));
  }

  function showPanel(name) {
    document.querySelectorAll('.page-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.panel === name));
    document.querySelectorAll('.page-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'panel-' + name));
  }

  function openFromHash() {
    const h = location.hash;
    if (/^#a\d+$/.test(h)) gotoAphorism(h.slice(2));
    else if (/^#s-/.test(h)) gotoSection(h.slice(3));
    else if (h === '#read') showPanel('read');
    else if (h === '#marks') showPanel('marks');
    else if (h === '#principles') showPanel('principles');
  }

  const closeToc = () => $('orgToc').classList.remove('open');

  /* ================= bookmarks ================= */
  function toggleMark(n) {
    n = Number(n);
    if (S.marks.has(n)) S.marks.delete(n); else S.marks.add(n);
    store.set(MARK_KEY, [...S.marks]);
    // both panels can be showing the same aphorism; keep them in step
    document.querySelectorAll(`[data-mark="${n}"]`).forEach(b => {
      const on = S.marks.has(n);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.innerHTML = `<i class='bx ${on ? 'bxs-bookmark' : 'bx-bookmark'}'></i>`;
    });
    renderMarks();
  }

  /* ================= type size ================= */
  function applyFont() {
    document.documentElement.style.setProperty('--og-read', S.font + 'rem');
  }
  function nudgeFont(dir) {
    S.font = Math.min(FONT_MAX, Math.max(FONT_MIN,
      +(S.font + dir * FONT_STEP).toFixed(4)));
    store.set(FONT_KEY, S.font);
    applyFont();
  }

  /* ================= wiring ================= */
  function wire() {
    document.querySelectorAll('.page-tab-btn').forEach(b =>
      b.addEventListener('click', () => showPanel(b.dataset.panel)));

    // one delegated handler for every § chip, bookmark and contents row
    document.addEventListener('click', e => {
      const ref = e.target.closest('[data-goto]');
      if (ref) return gotoAphorism(ref.dataset.goto);
      const mk = e.target.closest('[data-mark]');
      if (mk) return toggleMark(mk.dataset.mark);
      const sec = e.target.closest('[data-sec]');
      if (sec) return gotoSection(sec.dataset.sec);
    });

    let t = null;
    $('orgSearch').addEventListener('input', e => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => runSearch(v), 180);
    });
    $('orgSearchX').addEventListener('click', () => {
      $('orgSearch').value = '';
      runSearch('');
      $('orgSearch').focus();
    });

    // the jump box takes Bangla or English digits — a reader typing ১৫৩ and a
    // reader typing 153 both mean §153
    $('orgJump').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const raw = e.target.value.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
      const n = parseInt(raw, 10);
      if (n) { gotoAphorism(n); e.target.value = ''; }
    });

    $('orgFontUp').addEventListener('click', () => nudgeFont(+1));
    $('orgFontDn').addEventListener('click', () => nudgeFont(-1));

    $('orgTocBtn').addEventListener('click', () => $('orgToc').classList.toggle('open'));
    $('orgTocX').addEventListener('click', closeToc);

    // the pager's top button is re-rendered on every chapter change
    document.addEventListener('click', e => {
      if (e.target.closest('#orgPagerTop, #orgUp')) toTop();
    });

    // The floating button and the pager's own top button do the same job, so
    // the floater stands down whenever the pager is on screen rather than
    // hovering over it.
    const up = $('orgUp');
    let pagerVisible = false, ticking = false;
    const syncUp = () => up.classList.toggle('on', window.scrollY > 900 && !pagerVisible);
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { syncUp(); ticking = false; });
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        pagerVisible = e.isIntersecting;
        syncUp();
      }, { rootMargin: '0px 0px -40px 0px' }).observe($('orgPager'));
    }

    window.addEventListener('hashchange', openFromHash);
  }

  function toTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
