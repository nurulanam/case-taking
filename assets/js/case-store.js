/* ==========================================================================
   Saved cases — the one place that knows what a stored case looks like.

   Before this file the app had no record of a case at all. case-form.js kept
   a single draft under 'homeoCaseDraft', overwritten by the next patient, and
   the dashboard reconstructed a patient list out of saved *prescriptions* —
   so a case taken and not prescribed for left no trace, and commitCase()
   said "কেস সংরক্ষিত হয়েছে" while saving only a draft. cases.html needs real
   records to list, so the records have to exist.

   Loaded by both case.html and cases.html. Keeping the shape here rather than
   in either page means the writer and the reader cannot disagree about it.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'case_saved_v1';

  /* A record is a summary plus the complete field map the form produced.
     Keeping the raw `data` verbatim is what lets a case be reopened for
     editing later; the summary exists so the list page can render, search and
     sort without walking every field of every case. */
  const FIELDS = ['caseNo', 'patientName', 'gender', 'ageYears', 'ageMonths',
                  'phone', 'visitDate', 'caseType', 'visitType', 'mainCategory',
                  'priorityComplaint', 'constitutionalRemedy', 'potency'];

  function summarise(data) {
    const d = data || {};
    const pick = k => (typeof d[k] === 'string' ? d[k].trim() : d[k]) || '';
    return {
      caseNo: pick('caseNo'),
      patient: pick('patientName'),
      gender: pick('gender'),
      ageYears: pick('ageYears'),
      ageMonths: pick('ageMonths'),
      phone: pick('phone'),
      visitDate: pick('visitDate'),
      caseType: pick('caseType'),
      visitType: pick('visitType'),
      category: pick('mainCategory'),
      complaint: pick('priorityComplaint'),
      remedy: pick('constitutionalRemedy'),
      potency: pick('potency'),
      // How much of the form is actually filled in — the list shows this so a
      // half-taken case is visibly different from a finished one.
      filled: Object.keys(d).filter(k => !k.startsWith('__')).length
    };
  }

  function all() {
    const list = Shell.store.get(KEY, []) || [];
    if (!Array.isArray(list)) return [];
    return list.filter(r => r && r.id);
  }

  function sorted() {
    return all().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function get(id) {
    return all().find(r => r.id === id) || null;
  }

  /* Ids are minted here and handed back so the caller can store one inside its
     own draft. Without a stable id, re-saving an open case appended a second
     record every time — keying on caseNo instead is not safe, because the
     practitioner is free to edit or blank it. */
  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function upsert(data, id) {
    const now = new Date().toISOString();
    const list = all();
    const rec = {
      id: id || newId(),
      ...summarise(data),
      data: data || {},
      updatedAt: now
    };
    const at = list.findIndex(r => r.id === rec.id);
    if (at >= 0) {
      rec.createdAt = list[at].createdAt || now;
      list[at] = rec;
    } else {
      rec.createdAt = now;
      list.push(rec);
    }
    return Shell.store.set(KEY, list) ? rec : null;
  }

  function remove(id) {
    const list = all().filter(r => r.id !== id);
    return Shell.store.set(KEY, list);
  }

  /* Age as the form asks it (years + months), rendered in Bangla numerals.
     Shared so the list page and the form's own summary cannot drift. */
  function ageText(rec) {
    const y = parseInt(rec.ageYears, 10);
    const m = parseInt(rec.ageMonths, 10);
    const parts = [];
    if (y > 0) parts.push(Shell.bnNum(y) + ' বছর');
    if (m > 0) parts.push(Shell.bnNum(m) + ' মাস');
    return parts.join(' ');
  }

  global.CaseStore = { KEY, FIELDS, all, sorted, get, upsert, remove, newId, summarise, ageText };
})(window);
