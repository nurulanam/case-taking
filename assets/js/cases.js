/* ==========================================================================
   কেসের তালিকা — the saved-case list, a sub-page of case taking.

   Reads CaseStore only. Everything shown here is a real stored value: no
   counts are estimated and no clinical field is inferred, so a case that was
   half-taken looks half-taken rather than being padded out.
   ========================================================================== */
(() => {
  'use strict';

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DRAFT_KEY = 'homeoCaseDraft';

  const q       = document.getElementById('clQ');
  const qx      = document.getElementById('clQx');
  const fGen    = document.getElementById('clGender');
  const fType   = document.getElementById('clType');
  const fSort   = document.getElementById('clSort');
  const listEl  = document.getElementById('clList');
  const countEl = document.getElementById('clCount');
  const subEl   = document.getElementById('clSub');
  const draftEl = document.getElementById('clDraft');

  let all = [];

  /* ---------------- dates ---------------- */
  const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই',
                    'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

  function dateBn(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return Shell.bnNum(d.getDate()) + ' ' + BN_MONTH[d.getMonth()] + ' ' + Shell.bnNum(d.getFullYear());
  }

  /* Relative age of a record, derived only from its stored timestamp — a
     record without one loses this line rather than being given a made-up
     date. */
  function agoBn(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'এইমাত্র';
    if (mins < 60) return Shell.bnNum(mins) + ' মিনিট আগে';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return Shell.bnNum(hrs) + ' ঘণ্টা আগে';
    const days = Math.floor(hrs / 24);
    if (days < 30) return Shell.bnNum(days) + ' দিন আগে';
    const mo = Math.floor(days / 30);
    if (mo < 12) return Shell.bnNum(mo) + ' মাস আগে';
    return Shell.bnNum(Math.floor(mo / 12)) + ' বছর আগে';
  }

  /* ---------------- filter options ----------------
     Built from the values actually present in the saved cases rather than a
     hardcoded list: the form lets a practitioner type an "অন্যান্য" value, and
     a fixed dropdown would silently hide those cases from filtering. */
  function fillFilters() {
    const fill = (sel, values, label) => {
      const cur = sel.value;
      sel.innerHTML = '<option value="">সব ' + label + '</option>' +
        values.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
      if (values.indexOf(cur) >= 0) sel.value = cur;
    };
    const uniq = key => [...new Set(all.map(r => r[key]).filter(Boolean))].sort();
    fill(fGen, uniq('gender'), 'লিঙ্গ');
    fill(fType, uniq('caseType'), 'ধরন');
  }

  /* ---------------- search ----------------
     Substring over the fields a practitioner would actually recall a case by.
     Deliberately not the whole record: matching every field meant a query like
     "৩০" hit any case with 30 anywhere inside it. */
  function haystack(r) {
    return [r.patient, r.caseNo, r.complaint, r.category, r.remedy, r.phone]
      .filter(Boolean).join('   ').toLowerCase();
  }

  function visible() {
    const term = q.value.trim().toLowerCase();
    const out = all.filter(r => {
      if (fGen.value && r.gender !== fGen.value) return false;
      if (fType.value && r.caseType !== fType.value) return false;
      if (term && haystack(r).indexOf(term) < 0) return false;
      return true;
    });
    const by = fSort.value;
    const t = r => String(r.updatedAt || r.createdAt || '');
    if (by === 'recent') out.sort((a, b) => t(b).localeCompare(t(a)));
    else if (by === 'oldest') out.sort((a, b) => t(a).localeCompare(t(b)));
    else if (by === 'name') out.sort((a, b) => (a.patient || '').localeCompare(b.patient || '', 'bn'));
    else if (by === 'caseNo') out.sort((a, b) => (a.caseNo || '').localeCompare(b.caseNo || '', 'bn', { numeric: true }));
    return out;
  }

  /* ---------------- rendering ---------------- */
  function initial(name) {
    const s = String(name || '').trim();
    return s ? s[0] : '?';
  }

  function chip(text, cls) {
    return text ? '<span class="cl-chip ' + (cls || '') + '">' + esc(text) + '</span>' : '';
  }

  function cardHtml(r) {
    const meta = [CaseStore.ageText(r), r.gender, r.phone].filter(Boolean);
    const complaint = r.complaint
      ? esc(r.complaint.slice(0, 140)) + (r.complaint.length > 140 ? '…' : '')
      : '';
    return '' +
      '<article class="cl-card" data-id="' + esc(r.id) + '">' +
        '<div class="cl-av" aria-hidden="true">' + esc(initial(r.patient)) + '</div>' +
        '<div class="cl-body">' +
          '<div class="cl-l1">' +
            '<h3>' + esc(r.patient || 'নামহীন কেস') + '</h3>' +
            (r.caseNo ? '<span class="cl-no">' + esc(r.caseNo) + '</span>' : '') +
            chip(r.caseType, 'type') +
            chip(r.visitType, '') +
          '</div>' +
          (meta.length ? '<div class="cl-l2">' + meta.map(esc).join(' · ') + '</div>' : '') +
          ((r.category || complaint)
            ? '<div class="cl-l3">' +
                (r.category ? '<b>' + esc(r.category) + '</b>' : '') +
                (complaint ? '<span>' + complaint + '</span>' : '') +
              '</div>'
            : '') +
          (r.remedy
            ? '<div class="cl-rx"><i class="bx bx-capsule"></i> ' + esc(r.remedy) +
              (r.potency ? ' · ' + esc(r.potency) : '') + '</div>'
            : '') +
          '<div class="cl-l4">' +
            (r.visitDate ? '<span><i class="bx bx-calendar"></i> ' + dateBn(r.visitDate) + '</span>' : '') +
            '<span title="' + esc(dateBn(r.updatedAt)) + '"><i class="bx bx-time-five"></i> ' + esc(agoBn(r.updatedAt)) + '</span>' +
            '<span><i class="bx bx-list-check"></i> ' + Shell.bnNum(r.filled || 0) + 'টি ঘর পূরণ</span>' +
          '</div>' +
        '</div>' +
        '<div class="cl-act">' +
          '<button class="cl-btn sm" data-act="open" type="button"><i class="bx bx-folder-open"></i> খুলুন</button>' +
          '<button class="cl-btn sm" data-act="rx" type="button"><i class="bx bx-receipt"></i> প্রেসক্রিপশন</button>' +
          '<button class="cl-btn sm danger" data-act="del" type="button" aria-label="মুছুন"><i class="bx bx-trash"></i></button>' +
        '</div>' +
      '</article>';
  }

  function render() {
    const rows = visible();
    const total = all.length;

    subEl.textContent = total
      ? 'এই ব্রাউজারে ' + Shell.bnNum(total) + 'টি কেস সংরক্ষিত আছে।'
      : 'এখনও কোনো কেস সংরক্ষিত হয়নি।';

    if (!total) {
      countEl.textContent = '';
      listEl.innerHTML =
        '<div class="cl-empty">' +
          '<i class="bx bx-folder-open"></i>' +
          '<h3>কোনো সংরক্ষিত কেস নেই</h3>' +
          '<p>কেস টেকিং ফর্মে রোগীর নাম লিখে প্রথম ধাপের “পরবর্তী” চাপলে কেসটি এখানে জমা হবে।</p>' +
          '<a class="cl-btn primary" href="case.html?new=1"><i class="bx bx-plus"></i> নতুন কেস শুরু করুন</a>' +
        '</div>';
      return;
    }

    countEl.textContent = rows.length === total
      ? Shell.bnNum(total) + 'টি কেস'
      : Shell.bnNum(rows.length) + ' / ' + Shell.bnNum(total) + 'টি কেস';

    if (!rows.length) {
      listEl.innerHTML =
        '<div class="cl-empty">' +
          '<i class="bx bx-search-alt"></i>' +
          '<h3>কিছু মেলেনি</h3>' +
          '<p>অন্য শব্দ দিয়ে খুঁজুন, বা ছাঁকনি সরিয়ে দেখুন।</p>' +
          '<button class="cl-btn" id="clReset" type="button"><i class="bx bx-reset"></i> ছাঁকনি সরান</button>' +
        '</div>';
      const rb = document.getElementById('clReset');
      if (rb) rb.addEventListener('click', () => {
        q.value = ''; fGen.value = ''; fType.value = '';
        qx.hidden = true; render();
      });
      return;
    }

    listEl.innerHTML = '<div class="cl-grid">' + rows.map(cardHtml).join('') + '</div>';
  }

  /* ---------------- the in-progress draft ----------------
     The draft is a different thing from a saved case: one slot, overwritten by
     whichever case is open. Showing it apart from the list keeps that
     difference visible instead of letting it read as another record. */
  function renderDraft() {
    const d = Shell.store.get(DRAFT_KEY, null);
    const name = d && d.patientName;
    if (!d || !name) { draftEl.hidden = true; return; }
    const filed = all.some(r => r.id === d.__caseId);
    draftEl.hidden = false;
    draftEl.innerHTML =
      '<div class="cl-draft-in">' +
        '<i class="bx bx-edit-alt"></i>' +
        '<div class="cl-draft-tx">' +
          '<b>ফর্মে খোলা আছে — ' + esc(name) + '</b>' +
          '<span>' +
            (d.__step ? 'ধাপ ' + Shell.bnNum(d.__step) + ' পর্যন্ত পূরণ' : 'শুরু করা হয়েছে') +
            (filed ? ' · তালিকায় সংরক্ষিত' : ' · এখনও তালিকায় জমা হয়নি') +
          '</span>' +
        '</div>' +
        '<a class="cl-btn sm primary" href="case.html"><i class="bx bx-right-arrow-alt"></i> ফর্মে যান</a>' +
      '</div>';
  }

  /* ---------------- actions ---------------- */

  /* Opening a case loads its stored field map into the single draft slot the
     form reads. That slot may hold someone else's unfinished case, so this
     asks first — silently discarding an in-progress case would lose work that
     was never filed anywhere. */
  function openCase(rec) {
    const cur = Shell.store.get(DRAFT_KEY, null);
    const curName = cur && cur.patientName;
    if (curName && cur.__caseId !== rec.id) {
      const filed = all.some(r => r.id === cur.__caseId);
      const who = rec.patient || 'নামহীন কেস';
      const warn = filed
        ? 'ফর্মে এখন “' + curName + '”-এর কেস খোলা আছে (তালিকায় সংরক্ষিত)। “' + who + '”-এর কেস খুললে সেটি ফর্ম থেকে সরে যাবে।'
        : 'ফর্মে এখন “' + curName + '”-এর খসড়া আছে, যা এখনও তালিকায় জমা হয়নি। “' + who + '”-এর কেস খুললে ওই খসড়া মুছে যাবে।';
      if (!confirm(warn + ' আপনি কি এগিয়ে যেতে চান?')) return;
    }
    const data = Object.assign({}, rec.data || {});
    data.__caseId = rec.id;
    Shell.store.set(DRAFT_KEY, data);
    if (rec.patient) {
      Shell.bridge.patch({ from: 'cases', patient: rec.patient, caseNo: rec.caseNo || '' });
    }
    location.href = 'case.html';
  }

  function delCase(rec) {
    if (!confirm('“' + (rec.patient || 'নামহীন কেস') + '”-এর কেসটি স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?')) return;
    CaseStore.remove(rec.id);
    /* If the open draft was this case it now points at a record that no longer
       exists; dropping the id stops the form from re-filing it under the same
       key on its next save. */
    const cur = Shell.store.get(DRAFT_KEY, null);
    if (cur && cur.__caseId === rec.id) {
      delete cur.__caseId;
      Shell.store.set(DRAFT_KEY, cur);
    }
    reload();
    Shell.toast('কেসটি মুছে ফেলা হয়েছে।', 'ok');
  }

  function exportAll() {
    if (!all.length) { Shell.toast('রপ্তানি করার মতো কোনো কেস নেই।', 'warn'); return; }
    const payload = {
      app: 'হোমিও কেস স্টুডিও',
      exported: new Date().toISOString(),
      count: all.length,
      cases: all
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                  '-' + String(d.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'cases-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Shell.toast(Shell.bnNum(all.length) + 'টি কেস রপ্তানি হয়েছে।', 'ok');
  }

  /* ---------------- wiring ---------------- */
  function reload() {
    all = CaseStore.sorted();
    fillFilters();
    renderDraft();
    render();
  }

  function init() {
    Shell.init();
    reload();

    let t = null;
    q.addEventListener('input', () => {
      qx.hidden = !q.value;
      clearTimeout(t);
      t = setTimeout(render, 120);
    });
    qx.addEventListener('click', () => { q.value = ''; qx.hidden = true; render(); q.focus(); });
    [fGen, fType, fSort].forEach(el => el.addEventListener('change', render));
    document.getElementById('clExport').addEventListener('click', exportAll);

    /* One delegated handler: the cards are re-rendered on every keystroke, so
       per-button listeners would be torn down and rebound constantly. */
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = btn.closest('.cl-card');
      const rec = card && CaseStore.get(card.dataset.id);
      if (!rec) return;
      const act = btn.dataset.act;
      if (act === 'open') openCase(rec);
      else if (act === 'del') delCase(rec);
      else if (act === 'rx') {
        Shell.bridge.patch({ from: 'cases', patient: rec.patient || '', caseNo: rec.caseNo || '' });
        location.href = 'prescription.html?from=case';
      }
    });

    // "/" focuses the search box, matching the dashboard
    document.addEventListener('keydown', e => {
      if (e.key !== '/') return;
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      e.preventDefault();
      q.focus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
