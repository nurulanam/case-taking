/* ==========================================================================
   Settings — the one place the practice's own details are edited.

   Three hash-routed panels (general / prescription / appearance) matching the
   sidebar submenu. The prescription page reads what is saved here and never
   asks for it again: the doctor's name, chamber and logo used to be typed on
   both pages into the same storage key, so whichever page saved last silently
   deleted the fields the other knew about.

   Both records are patch-merged through Shell (never wholesale-replaced), so
   a panel that edits only some keys cannot drop the rest.
   ========================================================================== */
(function () {
  'use strict';

  const PANELS = ['general', 'prescription', 'appearance'];

  const generalForm = document.getElementById('generalForm');
  const rxForm = document.getElementById('rxForm');
  const demoSheet = document.getElementById('demoSheet');

  const GENERAL_FIELDS = ['docName', 'docQual', 'docReg', 'docPhone', 'docSpecialty',
                          'clinicName', 'clinicPhone', 'clinicAddress', 'clinicHours'];
  const RX_FIELDS = ['dietAdvice', 'generalAdvice', 'followUp', 'pageSize', 'pageMargin'];

  const COLORS = [
    { id: 'teal', hex: '#0f766e', label: 'Teal' },
    { id: 'blue', hex: '#2563eb', label: 'Blue' },
    { id: 'purple', hex: '#7c3aed', label: 'Purple' },
    { id: 'orange', hex: '#ea580c', label: 'Orange' },
    { id: 'rose', hex: '#e11d48', label: 'Rose' }
  ];

  let docLogo = '';   // dataURL — a file input cannot hold this as its .value

  /* ==================== panels ==================== */
  function showPanel(name) {
    const id = PANELS.includes(name) ? name : 'general';
    PANELS.forEach(p => {
      const el = document.getElementById('panel-' + p);
      if (el) el.classList.toggle('active', p === id);
    });
    if (id === 'prescription') paintDemo();   // size it only once it's visible
  }

  function panelFromHash() {
    showPanel((location.hash || '').replace('#', ''));
  }

  /* ==================== general ==================== */
  function loadGeneral() {
    const p = Shell.profile.get();
    GENERAL_FIELDS.forEach(n => {
      const el = generalForm.elements[n];
      if (el) el.value = p[n] || '';
    });
    docLogo = p.docLogo || '';
    updateLogoUI();
  }

  function saveGeneral() {
    const patch = { docLogo: docLogo };
    GENERAL_FIELDS.forEach(n => {
      const el = generalForm.elements[n];
      patch[n] = el ? el.value.trim() : '';
    });
    Shell.profile.patch(patch);
    paintDemo();
    Shell.toast('চেম্বার ও চিকিৎসকের তথ্য সংরক্ষিত হয়েছে।', 'ok');
  }

  function updateLogoUI() {
    const img = document.getElementById('logoPreview');
    const empty = document.getElementById('logoEmpty');
    const rm = document.getElementById('logoRemoveBtn');
    if (docLogo) {
      img.src = docLogo; img.hidden = false; empty.hidden = true; rm.hidden = false;
    } else {
      img.hidden = true; empty.hidden = false; rm.hidden = true;
    }
  }

  function bindLogo() {
    const file = document.getElementById('logoFile');
    document.getElementById('logoPickBtn').addEventListener('click', () => file.click());
    document.getElementById('logoRemoveBtn').addEventListener('click', () => {
      docLogo = ''; file.value = '';
      updateLogoUI(); paintDemo();
    });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        // a phone photo would otherwise fill localStorage; a letterhead mark
        // never needs more than a couple of hundred pixels
        img.onload = () => {
          const MAX = 160;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          docLogo = c.toDataURL('image/png');
          updateLogoUI(); paintDemo();
        };
        img.onerror = () => Shell.toast('ছবিটি পড়া যায়নি — অন্য একটি ছবি দিন।', 'err');
        img.src = reader.result;
      };
      reader.onerror = () => Shell.toast('ফাইলটি পড়া যায়নি।', 'err');
      reader.readAsDataURL(f);
    });
  }

  /* ==================== prescription ==================== */
  // A <select> with no empty <option> cannot hold '', so assigning a blank
  // would leave it with nothing selected and save '' straight back out.
  // These carry the real defaults instead.
  const RX_DEFAULTS = { pageSize: 'a4', pageMargin: '14' };

  function loadRx() {
    const s = Shell.rxSettings.get();
    RX_FIELDS.forEach(n => {
      const el = rxForm.elements[n];
      if (el) el.value = s[n] || RX_DEFAULTS[n] || '';
    });
    const t = rxForm.querySelector(`[name="template"][value="${s.template || 'classic'}"]`);
    if (t) t.checked = true;
  }

  function currentTemplate() {
    const el = rxForm.querySelector('[name="template"]:checked');
    return el ? el.value : 'classic';
  }

  function saveRx() {
    const patch = { template: currentTemplate() };
    RX_FIELDS.forEach(n => {
      const el = rxForm.elements[n];
      patch[n] = el ? el.value.trim() : '';
    });
    Shell.rxSettings.patch(patch);
    Shell.toast('প্রেসক্রিপশনের সেটিংস সংরক্ষিত হয়েছে।', 'ok');
  }

  /* The demo uses the real renderer, so it cannot drift from what prints.
     It reflects the *form's current state*, not what was last saved, so the
     effect of a change is visible before committing to it. */
  function paintDemo() {
    if (!demoSheet) return;
    const profile = {};
    GENERAL_FIELDS.forEach(n => {
      const el = generalForm.elements[n];
      profile[n] = el ? el.value.trim() : '';
    });
    profile.docLogo = docLogo;

    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const rx = Object.assign({}, RxSheet.DEMO_RX, {
      rxDate: iso,
      dietAdvice: rxForm.elements['dietAdvice'].value.trim()
        || 'কড়া গন্ধ, কফি ও কাঁচা পেঁয়াজ এড়িয়ে চলুন। পর্যাপ্ত পানি পান করুন।',
      generalAdvice: rxForm.elements['generalAdvice'].value.trim()
        || 'ঔষধ খাওয়ার ১৫ মিনিট আগে-পরে কিছু খাবেন না।',
      followUp: rxForm.elements['followUp'].value || '১৫ দিন পর'
    });

    RxSheet.paintSheets(demoSheet, profile, rx, currentTemplate());
    RxSheet.applyPage(demoSheet,
      rxForm.elements['pageSize'].value, rxForm.elements['pageMargin'].value);
    RxSheet.fitSheets();
  }

  /* ==================== appearance ==================== */
  function bindAppearance() {
    const themePicker = document.getElementById('themePicker');
    const colorPicker = document.getElementById('colorPicker');

    const curTheme = Shell.store.get('theme_preference', 'system');
    Array.from(themePicker.children).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === curTheme);
      btn.addEventListener('click', () => {
        Array.from(themePicker.children).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const v = btn.dataset.val;
        Shell.store.set('theme_preference', v);
        document.documentElement.dataset.theme = v === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : v;
      });
    });

    const curColor = Shell.store.get('theme_color_v1', 'teal');
    colorPicker.innerHTML = COLORS.map(c => `
      <div class="color-option ${c.id === curColor ? 'active' : ''}"
           data-val="${c.id}" style="background:${c.hex};" title="${c.label}">
        <i class='bx bx-check'></i>
      </div>`).join('');
    Array.from(colorPicker.children).forEach(btn => {
      btn.addEventListener('click', () => {
        Array.from(colorPicker.children).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Shell.store.set('theme_color_v1', btn.dataset.val);
        document.documentElement.dataset.color = btn.dataset.val;
      });
    });
  }

  /* ==================== boot ==================== */
  function init() {
    loadGeneral();
    loadRx();
    bindLogo();
    bindAppearance();

    generalForm.addEventListener('submit', e => { e.preventDefault(); saveGeneral(); });
    rxForm.addEventListener('submit', e => { e.preventDefault(); saveRx(); });

    // the demo tracks both forms live, so a change is visible before saving
    generalForm.addEventListener('input', paintDemo);
    rxForm.addEventListener('input', paintDemo);
    rxForm.addEventListener('change', paintDemo);

    window.addEventListener('hashchange', panelFromHash);
    panelFromHash();
    paintDemo();

    // the demo is scaled to its column, so it has to be re-fitted whenever
    // that column's width changes
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => RxSheet.fitSheets(), 150);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
