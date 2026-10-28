/* ==========================================================================
   রোগীর বিবরণ — Start New Case lives here, not on the case form.
   ========================================================================== */
(() => {
  'use strict';

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই',
                    'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

  function dateBn(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return Shell.bnNum(d.getDate()) + ' ' + BN_MONTH[d.getMonth()] + ' ' + Shell.bnNum(d.getFullYear());
  }

  function patientCases(p) {
    const nameKey = String(p.name || '').trim().toLowerCase();
    return CaseStore.sorted().filter(c =>
      (c.data && c.data.patientId === p.id) ||
      String(c.patient || '').trim().toLowerCase() === nameKey);
  }

  const TYPES = [
    { id: 'acute', value: 'আকস্মিক', icon: 'bx-bolt-circle',
      title: 'আকস্মিক কেস', sub: 'হঠাৎ শুরু, স্বল্পমেয়াদি অসুখ — জ্বর, সর্দি, আঘাত, তীব্র ব্যথা।' },
    { id: 'chronic', value: 'দীর্ঘস্থায়ী', icon: 'bx-time-five',
      title: 'দীর্ঘস্থায়ী কেস', sub: 'চলমান বা পুনরাবৃত্ত রোগ — গভীর ইতিহাস ও সাধারণ লক্ষণ দরকার।' },
    { id: 'followup', value: 'ফলোআপ', icon: 'bx-revision',
      title: 'ফলোআপ', sub: 'আগের কেস পর্যালোচনা — শেষ সাক্ষাতের পর কী বদলেছে তা নথিভুক্ত।' }
  ];

  const MODES = [
    { id: 'guided', icon: 'bx-list-check',
      title: 'গাইডেড কেস টেকিং', sub: 'ধাপে ধাপে অভিযোগ, বিশেষ লক্ষণ, জেনারেলস, মানসিক ইতিহাস — প্রতি ধাপ আলাদা সংরক্ষিত।' },
    { id: 'direct', icon: 'bx-book-bookmark',
      title: 'সরাসরি রেপার্টরাইজেশন', sub: 'ফর্ম এড়িয়ে রেপার্টরিতে রুব্রিক বাছুন — লক্ষণ ইতিমধ্যে স্পষ্ট হলে।' }
  ];

  function startCase(p, typeId, modeId) {
    const type = TYPES.find(t => t.id === typeId);
    if (!type) return;
    const qs = new URLSearchParams({
      patient: p.id,
      type: typeId,
      new: '1'
    });
    if (typeId !== 'followup' && modeId) qs.set('mode', modeId);
    location.href = 'case.html?' + qs.toString();
  }

  function pickerHtml(p, stage, typeId) {
    if (stage === 'type') {
      return `
        <button class="cg-back" type="button" data-back="home"><i class='bx bx-arrow-back'></i> ফিরে যান</button>
        <div class="pt-sec-h"><h3>কেসের ধরন বেছে নিন</h3></div>
        <div class="cg-grid">${TYPES.map(t => `
          <button class="cg-card" type="button" data-pick-type="${t.id}">
            <i class='bx ${t.icon}'></i>
            <b>${t.title}</b>
            <span>${t.sub}</span>
          </button>`).join('')}</div>`;
    }
    const t = TYPES.find(x => x.id === typeId);
    return `
      <button class="cg-back" type="button" data-back="type"><i class='bx bx-arrow-back'></i> ধরন বদলান</button>
      <div class="pt-sec-h"><h3>${esc(t ? t.title : '')} — পদ্ধতি</h3></div>
      <div class="cg-grid">${MODES.map(m => `
        <button class="cg-card" type="button" data-pick-mode="${m.id}">
          <i class='bx ${m.icon}'></i>
          <b>${m.title}</b>
          <span>${m.sub}</span>
        </button>`).join('')}</div>`;
  }

  function render(p) {
    const page = document.getElementById('ptPage');
    const cases = patientCases(p);
    const age = PatientStore.ageText(p);
    const facts = [
      ['বয়স', age || '—'],
      ['লিঙ্গ', p.gender || '—'],
      ['মোবাইল', p.phone || '—'],
      ['পেশা', p.occupation || '—'],
      ['বৈবাহিক অবস্থা', p.maritalStatus || '—'],
      ['রক্তের গ্রুপ', p.bloodGroup || '—'],
      ['ওজন', p.weight ? p.weight + ' কেজি' : '—'],
      ['উচ্চতা', p.height || '—']
    ];

    page.innerHTML = `
      <p style="margin:0 0 .6rem;"><a class="cg-back" href="patients.html" style="margin:0;"><i class='bx bx-arrow-back'></i> সব রোগী</a></p>
      <section class="pt-hero">
        <span class="pt-av">${esc((p.name || '?').trim().charAt(0))}</span>
        <div class="pt-hero-id">
          <h2>${esc(p.name || 'নামহীন')}</h2>
          <p>${esc([age, p.gender, p.phone].filter(Boolean).join(' · ') || 'বিবরণ অসম্পূর্ণ')}</p>
        </div>
        <div class="pt-hero-act">
          <button class="pt-btn primary" type="button" id="ptStart"><i class='bx bx-plus'></i> নতুন কেস শুরু</button>
          <a class="pt-btn" href="patients.html?edit=${esc(p.id)}"><i class='bx bx-edit'></i> সম্পাদনা</a>
        </div>
      </section>
      ${p.address || p.notes ? `<p style="margin:-.4rem 0 1rem;color:var(--text-muted);font-size:.875rem;">
        ${p.address ? esc(p.address) : ''}${p.address && p.notes ? ' · ' : ''}${p.notes ? esc(p.notes) : ''}
      </p>` : ''}
      <div class="pt-facts">${facts.map(([k, v]) =>
        `<div class="pt-fact"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <div id="ptPicker" hidden></div>
      <div class="pt-sec-h">
        <h3>সংরক্ষিত কেস <small style="color:var(--text-muted);font-weight:500;">${Shell.bnNum(cases.length)}</small></h3>
      </div>
      <div id="ptCases">${cases.length ? `<div class="cl-grid">${cases.map(c => `
        <div class="cl-card">
          <div class="cl-card-h">
            <b>${esc(c.caseNo || 'কেস নম্বর নেই')}</b>
            <span class="pt-pill">${esc(c.caseType || 'ধরন নেই')}</span>
          </div>
          <p class="cl-card-sub">${esc(c.complaint || 'অভিযোগ লেখা হয়নি')}</p>
          <p class="cl-card-meta">${esc(dateBn(c.visitDate || c.updatedAt) || '')}${c.data && c.data.caseMode ? ' · ' + esc(c.data.caseMode) : ''}</p>
          <div class="cl-card-act">
            <button class="cl-btn sm primary" type="button" data-open="${esc(c.id)}">খুলুন</button>
          </div>
        </div>`).join('')}</div>` : `<div class="pt-empty"><i class='bx bx-clipboard'></i>
          <p>এই রোগীর কোনো কেস নেই। <b>নতুন কেস শুরু</b> চাপুন।</p></div>`}</div>`;

    document.getElementById('ptStart').addEventListener('click', () => showPicker(p, 'type'));
    page.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = CaseStore.get(btn.dataset.open);
        if (!rec) return;
        const data = Object.assign({}, rec.data || {});
        data.__caseId = rec.id;
        Shell.store.set('homeoCaseDraft', data);
        location.href = 'case.html';
      });
    });
  }

  let pickType = null;
  function showPicker(p, stage, typeId) {
    const box = document.getElementById('ptPicker');
    box.hidden = false;
    if (stage === 'type') pickType = null;
    box.innerHTML = pickerHtml(p, stage, typeId || pickType);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.querySelector('[data-back]')?.addEventListener('click', () => {
      const to = box.querySelector('[data-back]').dataset.back;
      if (to === 'home') box.hidden = true;
      else showPicker(p, 'type');
    });
    box.querySelectorAll('[data-pick-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickType = btn.dataset.pickType;
        if (pickType === 'followup') startCase(p, 'followup');
        else showPicker(p, 'mode', pickType);
      });
    });
    box.querySelectorAll('[data-pick-mode]').forEach(btn => {
      btn.addEventListener('click', () => startCase(p, pickType, btn.dataset.pickMode));
    });
  }

  function init() {
    Shell.init();
    const id = new URLSearchParams(location.search).get('id');
    const p = id && PatientStore.get(id);
    if (!p) {
      document.getElementById('ptPage').innerHTML =
        `<div class="pt-empty"><i class='bx bx-user-x'></i>
          <p>রোগী পাওয়া যায়নি। <a href="patients.html">তালিকায় ফিরুন</a> অথবা
          <a href="patients.html?new=1">নতুন নিবন্ধন</a> করুন।</p></div>`;
      return;
    }
    document.title = (p.name || 'রোগী') + ' — হোমিও কেস স্টুডিও';
    document.body.dataset.title = p.name || 'রোগীর বিবরণ';
    Shell.setChip(PatientStore.ageText(p) || 'রোগী', 'bx-user', false);
    render(p);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
