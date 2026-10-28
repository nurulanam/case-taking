/* ==========================================================================
   রোগীর তালিকা ও নিবন্ধন
   ========================================================================== */
(() => {
  'use strict';

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const formWrap = document.getElementById('ptFormWrap');
  const form = document.getElementById('ptForm');
  const listEl = document.getElementById('ptList');
  const q = document.getElementById('ptQ');
  const qx = document.getElementById('ptQx');
  const titleEl = document.getElementById('ptFormTitle');
  let editingId = null;

  function initPills() {
    document.querySelectorAll('.pills').forEach(host => {
      if (host._ready) return;
      host._ready = true;
      const name = host.dataset.pills;
      const opts = (host.dataset.options || '').split('|').filter(Boolean);
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = name;
      host.appendChild(hidden);
      opts.forEach(o => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pill';
        b.textContent = o;
        b.addEventListener('click', () => host._apply(hidden.value === o ? '' : o));
        host.appendChild(b);
      });
      host._apply = val => {
        hidden.value = val || '';
        host.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p.textContent === hidden.value));
      };
    });
  }

  function fillForm(p) {
    form.reset();
    document.querySelectorAll('.pills').forEach(h => h._apply && h._apply(''));
    if (!p) return;
    Object.keys(p).forEach(k => {
      const host = form.querySelector(`.pills[data-pills="${CSS.escape(k)}"]`);
      if (host && host._apply) { host._apply(p[k] || ''); return; }
      const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
      if (el) el.value = p[k] || '';
    });
  }

  function collect() {
    const data = {};
    form.querySelectorAll('input, textarea').forEach(el => {
      if (!el.name) return;
      data[el.name] = el.value.trim();
    });
    return data;
  }

  function openForm(p) {
    editingId = p ? p.id : null;
    titleEl.textContent = p ? 'রোগীর তথ্য সম্পাদনা' : 'নতুন রোগী নিবন্ধন';
    fillForm(p);
    formWrap.hidden = false;
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const name = form.querySelector('[name="name"]');
    if (name) name.focus();
  }

  function closeForm() {
    editingId = null;
    formWrap.hidden = true;
    form.reset();
    const params = new URLSearchParams(location.search);
    if (params.has('new')) {
      params.delete('new');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }
  }

  function render() {
    const all = PatientStore.sorted();
    const needle = q.value.trim().toLowerCase();
    const rows = needle
      ? all.filter(p => [p.name, p.phone, p.occupation, p.address]
          .filter(Boolean).join(' ').toLowerCase().includes(needle))
      : all;

    document.getElementById('ptSub').textContent = all.length
      ? `নিবন্ধিত ${Shell.bnNum(all.length)} জন রোগী। কেস নেওয়া হয় রোগীর বিবরণ থেকে।`
      : 'এখনো কোনো রোগী নিবন্ধিত নেই।';

    Shell.setChip(all.length
      ? `${Shell.bnNum(all.length)} জন রোগী`
      : 'রোগী নিবন্ধন', 'bx-group', !all.length);

    if (!rows.length) {
      listEl.innerHTML = needle
        ? `<div class="pt-empty"><i class='bx bx-search-alt'></i><p>“${esc(q.value.trim())}” নামে কেউ নেই।</p></div>`
        : `<div class="pt-empty"><i class='bx bx-user-plus'></i>
            <p>প্রথমে রোগী নিবন্ধন করুন। নিবন্ধনের পর বিবরণ পাতা থেকে কেস শুরু হবে।</p></div>`;
      return;
    }

    listEl.innerHTML = '<div class="pt-grid">' + rows.map(p => {
      const cases = window.CaseStore
        ? CaseStore.all().filter(c => c.data && c.data.patientId === p.id ||
            String(c.patient || '').trim().toLowerCase() === String(p.name || '').trim().toLowerCase())
        : [];
      const age = PatientStore.ageText(p);
      const bits = [age, p.gender, p.phone].filter(Boolean);
      return `<a class="pt-card" href="patient.html?id=${esc(p.id)}">
        <div class="pt-card-h">
          <span class="pt-av">${esc((p.name || '?').trim().charAt(0))}</span>
          <span class="pt-card-id">
            <b>${esc(p.name || 'নামহীন')}</b>
            <span>${esc(bits.join(' · ') || 'বিবরণ নেই')}</span>
          </span>
        </div>
        <div class="pt-card-meta">
          ${p.occupation ? `<span class="pt-pill">${esc(p.occupation)}</span>` : ''}
          <span class="pt-pill">${cases.length ? Shell.bnNum(cases.length) + 'টি কেস' : 'কেস নেই'}</span>
        </div>
      </a>`;
    }).join('') + '</div>';
  }

  function init() {
    Shell.init();
    initPills();
    render();

    document.getElementById('ptNewBtn').addEventListener('click', () => openForm(null));
    document.getElementById('ptCancel').addEventListener('click', closeForm);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = collect();
      if (!data.name) {
        form.querySelector('[name="name"]').reportValidity();
        return;
      }
      if (!data.gender) {
        Shell.toast('লিঙ্গ নির্বাচন করুন।', 'warn');
        return;
      }
      const rec = PatientStore.upsert(data, editingId || undefined);
      Shell.toast(editingId ? 'রোগীর তথ্য হালনাগাদ হয়েছে।' : 'রোগী নিবন্ধিত হয়েছে।', 'ok');
      location.href = 'patient.html?id=' + encodeURIComponent(rec.id);
    });

    q.addEventListener('input', () => { qx.hidden = !q.value; render(); });
    qx.addEventListener('click', () => { q.value = ''; qx.hidden = true; render(); q.focus(); });

    const params = new URLSearchParams(location.search);
    if (params.has('new')) openForm(null);
    const editId = params.get('edit');
    if (editId) {
      const rec = PatientStore.get(editId);
      if (rec) openForm(rec);
    }

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
