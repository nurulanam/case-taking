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
  const FONT_MIN = 0.9375, FONT_MAX = 1.5, FONT_STEP = 0.0625;

  const S = {
    data: null,
    byNum: new Map(),
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
        json.aphorisms.forEach(a => S.byNum.set(a.n, a));
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

  function renderStream() {
    const secs = new Map(S.data.sections.map(s => [s.id, s]));
    let html = '', cur = null;
    S.data.aphorisms.forEach(a => {
      if (a.section !== cur) {
        cur = a.section;
        const s = secs.get(cur);
        html += `<div class="og-sechead" id="s-${esc(s.id)}">
                   <i class='bx ${esc(s.icon)}'></i>
                   <h3>${esc(s.title)}</h3>
                   <span>§ ${bn(s.from)}–${bn(s.to)}</span>
                 </div>`;
      }
      html += aphorismHtml(a);
    });
    $('orgStream').innerHTML = html;
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
      return;
    }
    const hits = S.data.aphorisms.filter(a =>
      a.body.some(t => t.includes(S.q)) || a.footnotes.some(t => t.includes(S.q)));

    status.hidden = false;
    status.textContent = hits.length
      ? `“${S.q}” — ${bn(hits.length)}টি সূত্রে পাওয়া গেছে`
      : `“${S.q}” — কোনো সূত্রে পাওয়া যায়নি`;

    stream.innerHTML = hits.length
      ? hits.map(a => highlight(aphorismHtml(a), S.q)).join('')
      : emptyBox('bx-search-alt', 'অন্য শব্দ দিয়ে চেষ্টা করুন।');
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
  function gotoAphorism(n) {
    n = Number(n);
    if (!S.byNum.has(n)) {
      if (window.Shell) Shell.toast(`§ ${bn(n)} নামে কোনো সূত্র নেই।`, 'warn');
      return;
    }
    showPanel('read');
    if (S.q) { $('orgSearch').value = ''; runSearch(''); }
    requestAnimationFrame(() => {
      const el = $('a' + n);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 1600);
      history.replaceState(null, '', '#a' + n);
    });
  }

  function gotoSection(id) {
    showPanel('read');
    if (S.q) { $('orgSearch').value = ''; runSearch(''); }
    requestAnimationFrame(() => {
      const el = $('s-' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeToc();
      markTocActive(id);
      history.replaceState(null, '', '#s-' + id);
    });
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

    window.addEventListener('hashchange', openFromHash);

    // keep the contents pane pointing at whatever section is on screen
    const heads = [...document.querySelectorAll('.og-sechead')];
    if ('IntersectionObserver' in window && heads.length) {
      const io = new IntersectionObserver(entries => {
        const vis = entries.filter(x => x.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) markTocActive(vis.target.id.slice(2));
      }, { rootMargin: '-70px 0px -70% 0px' });
      heads.forEach(h => io.observe(h));
    }
  }
})();
