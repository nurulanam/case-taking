/* ==========================================================================
   ড্যাশবোর্ড — practitioner's opening screen

   Every number here is counted from records the doctor actually saved. There
   is no patient table in this app: a "patient" is someone with at least one
   saved prescription, and the case draft is the one case in progress. So the
   tiles below are derived, and the page says so rather than implying a
   register it does not have — a dashboard that invents caseloads is worse
   than one that admits its scope.

   sources: rx_saved_v1 (up to 40 prescriptions) · homeoCaseDraft ·
            repertory_case_v1 · miasm_selected_v1 · clinic_profile_v1
   ========================================================================== */
'use strict';

(function () {
  const bn = Shell.bnNum;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই',
                  'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
  const DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

  /* Dates are compared as plain YYYY-MM-DD strings in local time. Going via
     Date objects would drag timezone into it, and a follow-up "today" that
     flips at 6am because the browser is on UTC is a real bug in a clinic. */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const TODAY = iso(new Date());

  function bnDate(s) {
    if (!s) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${bn(+m[3])} ${MONTHS[+m[2] - 1]} ${bn(m[1])}`;
  }

  /* whole days between two YYYY-MM-DD, positive = b is later */
  function dayDiff(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }

  /* ================= data ================= */
  function load() {
    const rx = (Shell.store.get('rx_saved_v1', []) || []).filter(r => r && r.patient);

    // one record per patient, newest first — a patient with four visits is
    // one patient, not four
    const byPatient = new Map();
    rx.forEach(r => {
      const key = String(r.patient).trim().toLowerCase();
      if (!key) return;
      const f = r.fields || {};
      const prev = byPatient.get(key);
      const rec = {
        name: String(r.patient).trim(),
        caseNo: r.caseNo || (f.caseNo || ''),
        date: r.date || '',
        remedy: r.summary || '',
        followUpDate: f.followUpDate || '',
        followUp: f.followUp || '',
        diagnosis: f.diagnosis || '',
        visits: (prev ? prev.visits : 0) + 1,
      };
      // keep the most recent visit as the patient's current state
      if (!prev || (rec.date || '') >= (prev.date || '')) {
        byPatient.set(key, Object.assign(rec, { visits: rec.visits }));
      } else {
        prev.visits = rec.visits;
      }
    });
    const patients = [...byPatient.values()];

    const withFu = patients.filter(p => p.followUpDate);
    return {
      rx,
      patients,
      dueToday: withFu.filter(p => p.followUpDate === TODAY),
      overdue: withFu.filter(p => p.followUpDate < TODAY),
      upcoming: withFu.filter(p => p.followUpDate > TODAY),
      draft: Shell.store.get('homeoCaseDraft', null),
      rep: Shell.store.get('repertory_case_v1', null),
      miasm: Shell.store.get('miasm_selected_v1', null),
    };
  }

  /* a patient's state, from their latest prescription's follow-up date */
  function status(p) {
    if (!p.followUpDate) return { cls: 'done', label: 'ফলোআপ নেই' };
    if (p.followUpDate === TODAY) return { cls: 'today', label: 'আজ ফলোআপ' };
    if (p.followUpDate < TODAY) {
      const d = dayDiff(p.followUpDate, TODAY);
      return { cls: 'late', label: `${bn(d)} দিন পার` };
    }
    return { cls: 'ok', label: 'নির্ধারিত' };
  }

  /* ================= render ================= */
  function greeting() {
    const prof = (Shell.profile && Shell.profile.get()) || {};
    const name = (prof.docName || '').trim();
    $('dhHello').innerHTML = name
      ? `${esc(Shell.getGreeting())}, <b>${esc(name)}</b>`
      : `${esc(Shell.getGreeting())}`;

    const d = new Date();
    $('dhDate').innerHTML =
      `<i class='bx bx-calendar'></i> আজ ${DAYS[d.getDay()]}, ` +
      `${bn(d.getDate())} ${MONTHS[d.getMonth()]} ${bn(d.getFullYear())}`;

    if (!name) {
      $('dhNameHint').hidden = false;
    }
  }

  function stats(D) {
    const cards = [
      { n: D.patients.length, l: 'রোগী', i: 'bx-group', c: 'var(--primary)',
        bg: 'var(--primary-bg)', href: '#recent' },
      { n: D.upcoming.length + D.dueToday.length, l: 'ফলোআপ নির্ধারিত', i: 'bx-folder-open',
        c: '#0284c7', bg: 'rgba(2,132,199,.14)', href: '#recent' },
      { n: D.dueToday.length, l: 'আজ ফলোআপ', i: 'bx-calendar-check',
        c: 'var(--warning)', bg: 'rgba(245,158,11,.16)', href: '#followup',
        cls: D.dueToday.length ? 'is-due' : '' },
      { n: D.overdue.length, l: 'ফলোআপ বাকি', i: 'bx-time-five',
        c: 'var(--danger)', bg: 'var(--danger-bg)', href: '#followup',
        cls: D.overdue.length ? 'is-alert' : '' },
    ];
    $('dhStats').innerHTML = cards.map(s => `
      <a class="dh-stat ${s.cls || ''}" href="${s.href}">
        <span class="dh-stat-ic" style="background:${s.bg};color:${s.c}">
          <i class='bx ${s.i}'></i></span>
        <span class="dh-stat-tx"><b>${bn(s.n)}</b><span>${s.l}</span></span>
      </a>`).join('');
  }

  function followups(D) {
    // overdue first — those are the ones at risk of being forgotten
    const rows = [...D.overdue.map(p => ({ p, late: true })),
                  ...D.dueToday.map(p => ({ p, late: false }))];
    $('dhFuCount').textContent = bn(rows.length);
    $('dhFuBody').innerHTML = rows.length ? `
      <div class="dh-fu">${rows.map(({ p, late }) => {
        const d = late ? dayDiff(p.followUpDate, TODAY) : 0;
        return `
        <a class="dh-fu-row ${late ? 'late' : ''}" href="#"
           data-patient="${esc(p.name)}">
          <span class="dh-fu-txt">
            <b>${esc(p.name)}</b>
            <span>${esc(p.remedy || p.diagnosis || 'ওষুধ উল্লেখ নেই')}</span>
          </span>
          <span class="dh-fu-when">${late ? bn(d) + ' দিন পার' : 'আজ'}</span>
        </a>`;
      }).join('')}</div>` : `
      <div class="dh-empty">
        <i class='bx bx-calendar-check'></i>
        <p>আজ কোনো ফলোআপ নেই। প্রেসক্রিপশনে <b>পরবর্তী সাক্ষাতের তারিখ</b> দিলে
           রোগী এখানে দেখা যাবে।</p>
      </div>`;
  }

  function recent(D) {
    // newest visit first
    const rows = [...D.patients].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
    $('dhRecentCount').textContent = bn(D.patients.length);
    if (!rows.length) {
      $('dhRecent').innerHTML = `
        <div class="dh-empty">
          <i class='bx bx-folder-open'></i>
          <p>এখনো কোনো কেস সংরক্ষিত নেই। <a href="case.html">নতুন কেস</a> নিয়ে
             প্রেসক্রিপশন সংরক্ষণ করলে রোগী এখানে দেখা যাবে।</p>
        </div>`;
      return;
    }
    $('dhRecent').innerHTML = `
      <div class="dh-tbl-wrap">
        <table class="dh-tbl">
          <thead><tr>
            <th>রোগী</th><th>কেস নম্বর</th><th>শেষ সাক্ষাৎ</th><th>ওষুধ</th><th>ফলোআপ</th>
          </tr></thead>
          <tbody>${rows.map(p => {
            const st = status(p);
            return `<tr data-patient="${esc(p.name)}">
              <td class="dh-pt">${esc(p.name)}${p.visits > 1
                  ? ` <small class="dh-mono">·${bn(p.visits)} বার</small>` : ''}</td>
              <td class="dh-mono">${esc(p.caseNo || '—')}</td>
              <td class="dh-mono">${esc(bnDate(p.date) || '—')}</td>
              <td class="dh-rx">${esc(p.remedy || '—')}</td>
              <td><span class="dh-pill ${st.cls}">${st.label}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <p class="dh-note">এই তালিকা সংরক্ষিত প্রেসক্রিপশন থেকে তৈরি। সর্বশেষ ৪০টি
         প্রেসক্রিপশন এই ব্রাউজারে থাকে।</p>`;
  }

  /* work left half-finished, which is what a doctor returns to */
  function inProgress(D) {
    const rows = [];
    if (D.draft && typeof D.draft === 'object') {
      const filled = Object.values(D.draft).filter(v => v && String(v).trim()).length;
      if (filled) rows.push({
        icon: 'bx-clipboard', href: 'case.html', title: 'কেস খসড়া',
        sub: `${bn(filled)}টি ঘর পূরণ হয়েছে${D.draft.patientName ? ' · ' + D.draft.patientName : ''}`
      });
    }
    if (D.rep && D.rep.book && (D.rep.picked || []).length) rows.push({
      icon: 'bx-book-bookmark', href: 'repertory.html', title: 'রেপার্টরি বিশ্লেষণ',
      sub: `${bn(D.rep.picked.length)}টি রুব্রিক নির্বাচিত`
    });
    if (Array.isArray(D.miasm) && D.miasm.length) rows.push({
      icon: 'bx-analyse', href: 'miasm.html', title: 'মায়াজম বিশ্লেষণ',
      sub: `${bn(D.miasm.length)}টি রুব্রিক নির্বাচিত`
    });
    if (!rows.length) { $('dhProgress').hidden = true; return; }
    $('dhProgressBody').innerHTML = `<div class="dh-fu">${rows.map(r => `
      <a class="dh-fu-row" href="${r.href}">
        <span class="dh-fu-txt"><b>${esc(r.title)}</b><span>${esc(r.sub)}</span></span>
        <span class="dh-fu-when">চালু করুন</span>
      </a>`).join('')}</div>`;
  }

  /* ================= patient panel =================
     A hit opens on the dashboard rather than navigating to the prescription
     list — the doctor asked for the answer here, and leaving the page threw
     away the day they were looking at. */
  function showPatient(D, name) {
    const key = String(name).trim().toLowerCase();
    const p = D.patients.find(x => x.name.toLowerCase() === key);
    if (!p) return;
    // every visit for this person, newest first
    const visits = D.rx
      .filter(r => String(r.patient).trim().toLowerCase() === key)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const st = status(p);
    const f0 = (visits[0] && visits[0].fields) || {};
    // one readable line of facts beats a row of chips
    const facts = [
      p.caseNo && `কেস ${p.caseNo}`,
      f0.age && `${f0.age} বছর`,
      f0.gender,
      `${bn(visits.length)} বার সাক্ষাৎ`,
      p.diagnosis,
    ].filter(Boolean).join(' · ');

    $('dhPatient').innerHTML = `
      <div class="dh-pt-h">
        <span class="dh-pt-av">${esc(p.name.trim().charAt(0))}</span>
        <span class="dh-pt-id">
          <h3>${esc(p.name)}</h3>
          <span class="dh-pt-sub">${esc(facts)}</span>
        </span>
        <span class="dh-pill ${st.cls}">${st.label}</span>
        <button class="dh-pt-close" id="dhPtClose" aria-label="বন্ধ করুন"><i class='bx bx-x'></i></button>
      </div>
      <div class="dh-pt-sec"><i class='bx bx-history'></i> সাক্ষাতের ইতিহাস</div>
      <div class="dh-visits">
        ${visits.map((v, i) => {
          const f = v.fields || {};
          return `<div class="dh-visit${i === 0 ? ' latest' : ''}">
            <span class="dh-visit-d">${esc(bnDate(v.date) || '—')}</span>
            <span class="dh-visit-r">${esc(v.summary || 'ওষুধ উল্লেখ নেই')}</span>
            ${f.followUpDate ? `<span class="dh-visit-f">ফলোআপ ${esc(bnDate(f.followUpDate))}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="dh-pt-act">
        <a class="primary" href="prescription.html#new"><i class='bx bx-receipt'></i> নতুন প্রেসক্রিপশন</a>
        <a href="prescription.html#saved"><i class='bx bx-folder-open'></i> সংরক্ষিত প্রেসক্রিপশন</a>
        <a href="case.html"><i class='bx bx-clipboard'></i> নতুন কেস</a>
      </div>`;
    $('dhPatient').hidden = false;
    $('dhPtClose').addEventListener('click', () => {
      $('dhPatient').hidden = true;
      $('dhSearch').value = '';
      $('dhSearchX').hidden = true;
      $('dhKbd').hidden = false;      // the / hint belongs back on an empty field
      $('dhSearch').focus();
    });
    $('dhPatient').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function search(D) {
    const box = $('dhSearch');
    const res = $('dhRes');
    const clear = $('dhSearchX');
    const close = () => {
      res.hidden = true; res.innerHTML = '';
      cursor = -1;
      box.setAttribute('aria-expanded', 'false');
    };

    function run() {
      const q = box.value.trim().toLowerCase();
      clear.hidden = !q;
      $('dhKbd').hidden = !!q;
      if (!q) return close();
      // no saved prescriptions at all is a different problem from no match,
      // and saying so is what stops the box looking broken on a fresh install
      if (!D.patients.length) {
        res.hidden = false;
        box.setAttribute('aria-expanded', 'true');
        res.innerHTML = `<div class="dh-none">এখনো কোনো রোগী সংরক্ষিত নেই।<br>
          <a href="case.html">নতুন কেস</a> নিয়ে প্রেসক্রিপশন সংরক্ষণ করলে এখানে খুঁজে পাবেন।</div>`;
        return;
      }
      const hit = D.patients
        .filter(p => p.name.toLowerCase().includes(q) ||
                     String(p.caseNo).toLowerCase().includes(q))
        .slice(0, 8);
      res.hidden = false;
      box.setAttribute('aria-expanded', 'true');
      res.innerHTML = hit.length
        ? hit.map(p => `<a href="#" role="option" data-open="${esc(p.name)}">
             <b>${esc(p.name)}</b>
             <small>${esc(p.caseNo || bnDate(p.date))}</small></a>`).join('')
        : `<div class="dh-none">“${esc(box.value.trim())}” নামে কোনো রোগী পাওয়া যায়নি।<br>
             <a href="case.html">নতুন কেস শুরু করুন</a></div>`;
    }

    /* Keyboard: `/` from anywhere focuses the field, arrows walk the list and
       Enter opens the highlighted row. A dashboard used every consulting day
       should not need the mouse to find a patient. */
    let cursor = -1;
    const opts = () => [...res.querySelectorAll('[data-open]')];
    function highlight(i) {
      const list = opts();
      if (!list.length) return;
      cursor = (i + list.length) % list.length;
      list.forEach((el, n) => el.classList.toggle('on', n === cursor));
      list[cursor].scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.isContentEditable) return;
      e.preventDefault();
      box.focus();
      box.select();
    });

    box.addEventListener('input', () => { cursor = -1; run(); });
    box.addEventListener('focus', run);
    $('dhGo').addEventListener('click', () => {
      run();
      const first = res.querySelector('[data-open]');
      if (first) { showPatient(D, first.dataset.open); close(); }
      else box.focus();
    });
    clear.addEventListener('click', () => {
      box.value = ''; clear.hidden = true; $('dhKbd').hidden = false; close(); box.focus();
    });
    // enter picks the only match, which is how a name is usually typed
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); box.blur(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); return highlight(cursor + 1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); return highlight(cursor - 1); }
      if (e.key !== 'Enter') return;
      const list = opts();
      const pick = list[cursor] || list[0];
      if (pick) { e.preventDefault(); showPatient(D, pick.dataset.open); close(); }
    });
    res.addEventListener('click', e => {
      const a = e.target.closest('[data-open]');
      if (!a) return;
      e.preventDefault();
      showPatient(D, a.dataset.open);
      close();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.dh-search')) close();
    });

    // rows elsewhere on the page open the same panel
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-patient]');
      if (!el) return;
      e.preventDefault();
      showPatient(D, el.dataset.patient);
    });
  }

  /* ================= boot ================= */
  document.addEventListener('DOMContentLoaded', () => {
    const D = load();
    greeting();
    stats(D);
    followups(D);
    recent(D);
    inProgress(D);
    search(D);

    Shell.setChip(D.patients.length
      ? `${bn(D.patients.length)}জন রোগী · অফলাইন`
      : 'অফলাইন · স্থানীয় সংরক্ষণ', 'bx-hdd', true);
  });
})();
