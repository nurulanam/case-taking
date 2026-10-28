/* ==========================================================================
   Patients — a register of people, kept apart from the cases taken on them.

   Until this file the app had no patient table. A "patient" was whoever had
   a saved prescription, and the case form's first step mixed identity with
   the consultation. Registration now lives on its own page; a case only
   starts from a person who is already on file. The shape lives here so the
   register, the details page and the case form cannot disagree about it.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'patients_v1';

  const FIELDS = ['name', 'gender', 'ageYears', 'ageMonths', 'maritalStatus',
                  'occupation', 'phone', 'address', 'weight', 'height',
                  'bloodGroup', 'notes'];

  function all() {
    migrateFromCases();
    const list = Shell.store.get(KEY, []) || [];
    if (!Array.isArray(list)) return [];
    return list.filter(r => r && r.id);
  }

  function sorted() {
    return all().sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function get(id) {
    return all().find(r => r.id === id) || null;
  }

  function findByName(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return all().find(r => String(r.name || '').trim().toLowerCase() === key) || null;
  }

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pick(data, k) {
    const v = data && data[k];
    return (typeof v === 'string' ? v.trim() : v) || '';
  }

  function upsert(data, id) {
    const now = new Date().toISOString();
    const list = all();
    const rec = { id: id || newId(), updatedAt: now };
    FIELDS.forEach(k => { rec[k] = pick(data, k); });
    rec.name = rec.name || pick(data, 'patientName');
    rec.phone = rec.phone || pick(data, 'phone') || pick(data, 'mobile');
    const i = list.findIndex(r => r.id === rec.id);
    if (i >= 0) {
      rec.createdAt = list[i].createdAt || now;
      list[i] = rec;
    } else {
      rec.createdAt = now;
      list.unshift(rec);
    }
    Shell.store.set(KEY, list);
    return rec;
  }

  function remove(id) {
    Shell.store.set(KEY, all().filter(r => r.id !== id));
  }

  function ageText(p) {
    if (!p) return '';
    const y = parseInt(p.ageYears, 10);
    const m = parseInt(p.ageMonths, 10);
    const bits = [];
    if (!isNaN(y) && y > 0) bits.push(Shell.bnNum(y) + ' বছর');
    if (!isNaN(m) && m > 0) bits.push(Shell.bnNum(m) + ' মাস');
    if (!bits.length && !isNaN(y) && y === 0) bits.push('০ বছর');
    return bits.join(' ');
  }

  /* Cases taken before there was a register still name a person. Fold those
     names in once, so opening the new list on an existing clinic is not empty
     while the case list is full. Never overwrite a patient already on file. */
  let migrated = false;
  function migrateFromCases() {
    if (migrated) return;
    const existing = Shell.store.get(KEY, null);
    if (Array.isArray(existing) && existing.length) { migrated = true; return; }
    if (!global.CaseStore) return;
    migrated = true;
    const byName = new Map();
    CaseStore.all().forEach(c => {
      const name = String(c.patient || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (byName.has(key)) return;
      const d = c.data || {};
      byName.set(key, {
        name,
        gender: c.gender || d.gender || '',
        ageYears: c.ageYears || d.ageYears || '',
        ageMonths: c.ageMonths || d.ageMonths || '',
        maritalStatus: d.maritalStatus || '',
        occupation: d.occupation || '',
        phone: c.phone || d.phone || '',
        address: d.address || '',
        weight: d.weight || '',
        height: d.height || '',
        bloodGroup: d.bloodGroup || '',
        notes: ''
      });
    });
    if (!byName.size) return;
    const now = new Date().toISOString();
    const list = [...byName.values()].map(p => Object.assign({
      id: newId(), createdAt: now, updatedAt: now
    }, p));
    Shell.store.set(KEY, list);
  }

  global.PatientStore = {
    KEY, all, sorted, get, findByName, newId, upsert, remove, ageText
  };
})(window);
