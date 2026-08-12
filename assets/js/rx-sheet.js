/* ==========================================================================
   The prescription sheet, as markup.

   One renderer, two callers: the prescription builder (real patient data)
   and the settings page's demo preview (sample data). Keeping it here means
   changing the letterhead or a template variant updates both — the settings
   preview can never drift from what actually prints.

   It renders only what it is handed. Nothing is decided, defaulted or
   invented here: an empty field prints as an em-dash, not as a guess.
   ========================================================================== */
(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nl = s => esc(s).replace(/\n/g, '<br>');

  function bnDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    try {
      return new Intl.DateTimeFormat('bn-BD',
        { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
    } catch (e) { return iso; }
  }

  /* profile — who is prescribing (from Shell.profile)
     rx      — this prescription: patient fields, meds[], advice, follow-up */
  function sheetHtml(profile, rx) {
    profile = profile || {};
    rx = rx || {};
    const meds = (rx.meds || []).filter(m => m && String(m.remedy || '').trim());

    // the clinic block: name, address, phone, hours — each optional
    const clinicBits = [
      profile.clinicName ? `<b class="rs-clinic-name">${esc(profile.clinicName)}</b>` : '',
      profile.clinicAddress ? nl(profile.clinicAddress) : '',
      profile.clinicHours ? `<div>${esc(profile.clinicHours)}</div>` : '',
      profile.clinicPhone || profile.docPhone
        ? `<div>মোবাইল: ${esc(profile.clinicPhone || profile.docPhone)}</div>` : ''
    ].filter(Boolean).join('');

    const medRow = m => {
      const bits = [m.potency, m.form].filter(Boolean).join(' · ');
      const how = [m.repeat, m.when, m.days].filter(Boolean).join(' · ');
      return `<tr>
        <td class="rs-rx">
          <b>${esc(m.remedy)}</b>${bits ? `<span>${esc(bits)}</span>` : ''}
          ${m.note ? `<em>${esc(m.note)}</em>` : ''}
        </td>
        <td class="rs-how">${how ? esc(how) : '<span class="rs-dim">—</span>'}</td>
      </tr>`;
    };

    const followUp = [rx.followUp, bnDate(rx.followUpDate)].filter(Boolean).join(' · ');

    return `
      <div class="rs-head">
        <div class="rs-logo">
          ${profile.docLogo ? `<img src="${profile.docLogo}" alt="লোগো"/>` : ''}
          <div class="rs-doc">
            <b>${esc(profile.docName || 'চিকিৎসকের নাম')}</b>
            ${profile.docQual ? `<span>${esc(profile.docQual)}</span>` : ''}
            ${profile.docSpecialty ? `<span>${esc(profile.docSpecialty)}</span>` : ''}
            ${profile.docReg ? `<span>রেজি. ${esc(profile.docReg)}</span>` : ''}
          </div>
        </div>
        <div class="rs-clinic">${clinicBits}</div>
      </div>

      <div class="rs-patient">
        <div><label>রোগী</label><b>${esc(rx.patientName || '—')}</b></div>
        <div><label>বয়স / লিঙ্গ</label><b>${esc([rx.age, rx.gender].filter(Boolean).join(' / ') || '—')}</b></div>
        <div><label>কেস নং</label><b>${esc(rx.caseNo || '—')}</b></div>
        <div><label>তারিখ</label><b>${esc(bnDate(rx.rxDate) || '—')}</b></div>
      </div>

      ${rx.diagnosis ? `<div class="rs-dx"><label>সংক্ষেপ</label>${esc(rx.diagnosis)}</div>` : ''}

      <div class="rs-body">
        <div class="rs-rxmark">℞</div>
        ${meds.length
          ? `<table class="rs-table"><tbody>${meds.map(medRow).join('')}</tbody></table>`
          : `<p class="rs-empty">এখনো কোনো ঔষধ লেখা হয়নি — বাঁ পাশে ঔষধের নাম দিন।</p>`}
      </div>

      ${rx.dietAdvice ? `<div class="rs-adv"><label>খাদ্য ও জীবনযাপন</label>
        <p>${nl(rx.dietAdvice)}</p></div>` : ''}
      ${rx.generalAdvice ? `<div class="rs-adv"><label>নির্দেশনা</label>
        <p>${nl(rx.generalAdvice)}</p></div>` : ''}

      <div class="rs-foot">
        <div class="rs-follow">
          ${followUp ? `<label>পরবর্তী সাক্ষাৎ</label><b>${esc(followUp)}</b>` : ''}
        </div>
        <div class="rs-sign"><span></span>চিকিৎসকের স্বাক্ষর</div>
      </div>`;
  }

  /* ---------------- paper size ----------------
     The sheet is laid out at true paper width (in mm/in), not at whatever
     width the column happens to be, so the on-screen artefact matches the
     printed one. `@page size` can't be driven by an attribute, so the print
     rule is written into a stylesheet instead. */
  const PAGES = {
    a4:     { css: 'A4',     w: '210mm', h: '297mm' },
    a5:     { css: 'A5',     w: '148mm', h: '210mm' },
    letter: { css: 'Letter', w: '8.5in', h: '11in' },
    legal:  { css: 'Legal',  w: '8.5in', h: '14in' }
  };

  function applyPage(els, size, marginMm) {
    const page = PAGES[size] || PAGES.a4;
    const margin = Number(marginMm) > 0 ? Number(marginMm) : 14;

    (Array.isArray(els) ? els : [els]).forEach(el => {
      if (!el) return;
      el.dataset.page = size || 'a4';
      el.style.width = page.w;
      // a full page tall, so the signature block sits at the real foot of the
      // paper rather than floating up under a short medicine list
      el.style.minHeight = page.h;
      el.style.padding = margin + 'mm';
      // mirrored so a full-bleed band can cancel exactly this much (see
      // the modern template's .rs-head in prescription.css)
      el.style.setProperty('--rx-pad', margin + 'mm');
    });

    let style = document.getElementById('rxPageStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rxPageStyle';
      document.head.appendChild(style);
    }
    // the sheet already carries the margin as padding, so the page box itself
    // is set flush — otherwise the two would stack and the text block shrink
    style.textContent = `@page { size: ${page.css}; margin: 0; }`;
  }

  /* Scale a true-paper-width sheet down to fit its column. Without this the
     sheet would simply overflow on any screen narrower than the paper. The
     wrapper takes the scaled height so surrounding layout still adds up. */
  function fitSheets(root) {
    (root || document).querySelectorAll('.rx-paper-fit').forEach(wrap => {
      const sheet = wrap.querySelector('.rx-sheet');
      if (!sheet) return;
      sheet.style.transform = 'none';
      wrap.style.height = '';
      const avail = wrap.clientWidth;
      const natural = sheet.offsetWidth;
      if (!avail || !natural) return;
      const k = Math.min(1, avail / natural);
      sheet.style.transform = k < 1 ? `scale(${k})` : 'none';
      wrap.style.height = (sheet.offsetHeight * k) + 'px';
    });
  }

  /* Paint one or more .rx-sheet elements, tagging each with the template so
     the CSS variants apply. Skips nulls so callers need not guard. */
  function paintSheets(els, profile, rx, template) {
    (Array.isArray(els) ? els : [els]).forEach(el => {
      if (!el) return;
      el.dataset.template = template || 'classic';
      el.innerHTML = sheetHtml(profile, rx);
    });
  }

  /* Sample content for the settings preview — plainly fictional, so nobody
     can mistake it for a real patient's record. */
  const DEMO_RX = {
    patientName: 'রহিমা বেগম (নমুনা)',
    age: '৩৪', gender: 'মহিলা', caseNo: 'C-১০১',
    rxDate: null,                     // filled with today by the caller
    diagnosis: 'দীর্ঘস্থায়ী মাইগ্রেন',
    meds: [
      { remedy: 'Pulsatilla Nigricans', potency: '200', form: 'গ্লোবিউল / বড়ি',
        repeat: 'সপ্তাহে ১ বার', when: 'সকালে খালি পেটে', days: '১৫ দিন', note: 'গঠনগত' },
      { remedy: 'Natrum Muriaticum', potency: '30', form: 'ডিলিউশন (Dilution)',
        repeat: 'দিনে ২ বার', when: 'খাওয়ার পরে', days: '৭ দিন', note: '' }
    ]
  };

  global.RxSheet = { sheetHtml, paintSheets, applyPage, fitSheets, bnDate, DEMO_RX, PAGES };
})(window);
