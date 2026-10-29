/* Canonical remedy catalog.
   Other modules store `id` (a foreign key). Display names live here. */
(function (global) {
  'use strict';

  const PATH = 'assets/data/remedies/catalog.json';
  let list = [];
  const byId = new Map();
  let ready = null;

  function index(raw) {
    list = (raw && raw.remedies) || [];
    byId.clear();
    list.forEach((rx, i) => {
      rx.index = i; // repertory compact grades still use this 0-based position
      byId.set(rx.id, rx);
    });
    return api;
  }

  function load() {
    if (ready) return ready;
    ready = fetch(PATH)
      .then(r => {
        if (!r.ok) throw new Error('catalog ' + r.status);
        return r.json();
      })
      .then(index)
      .catch(err => {
        ready = null;
        console.error('Remedy catalog failed to load', err);
        return api;
      });
    return ready;
  }

  function get(id) {
    return byId.get(id) || null;
  }

  function label(id, lang) {
    const r = get(id);
    if (!r) return id || '';
    if (lang === 'en') return r.name;
    return r.bangla || r.name;
  }

  function abbr(id) {
    const r = get(id);
    return r ? (r.abbr_display || r.abbr) : (id || '');
  }

  const api = {
    load: load,
    get: get,
    label: label,
    abbr: abbr,
    all: function () { return list; }
  };

  global.RemedyStore = api;
})(window);
