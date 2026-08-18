/* ==========================================================================
   App shell — builds the sidebar + topbar, handles the mobile drawer,
   and exposes a tiny shared API (toasts, storage helpers, bangla numerals).
   Every page loads this before its own script.
   ========================================================================== */
(function (global) {
  'use strict';

  const APP = {
    name: 'হোমিও কেস স্টুডিও',
    tagline: 'Classical Homoeopathy Workspace',
    version: '২.১',
    mark: 'হ'
  };

  const NAV = [
    {
      group: 'কেস ব্যবস্থাপনা',
      items: [
        { id: 'dashboard', href: 'index.html', icon: 'bx-grid-alt', label: 'সারসংক্ষেপ' },
        { id: 'case', href: 'case.html', icon: 'bx-clipboard', label: 'কেস টেকিং', meta: '৯ ধাপ',
          children: [
            // These two are separate pages, not sections of one, so they carry
            // `page` instead of a hash — see subActive() below.
            { id: 'case-form', href: 'case.html', page: 'case', icon: 'bx-edit', label: 'কেস টেকিং ফর্ম' },
            { id: 'case-list', href: 'cases.html', page: 'cases', icon: 'bx-folder-open', label: 'কেসের তালিকা' }
          ] },
        { id: 'prescription', href: 'prescription.html', icon: 'bx-receipt', label: 'প্রেসক্রিপশন',
          children: [
            { id: 'rx-new', href: 'prescription.html#new', icon: 'bx-edit', label: 'নতুন প্রেসক্রিপশন' },
            { id: 'rx-saved', href: 'prescription.html#saved', icon: 'bx-folder-open', label: 'সংরক্ষিত তালিকা' }
          ] }
      ]
    },
    {
      group: 'বিশ্লেষণ ও ঔষধ নির্বাচন',
      items: [
        // acutes.html used to show these five as an in-page tab bar; they're
        // a sidebar submenu now so the page itself has more room, and each
        // child is just that section's hash — acutes.js reads it on load
        // and on hashchange (no page reload switching between them).
        { id: 'acutes', href: 'acutes.html', icon: 'bx-sitemap', label: 'তীব্র রোগ চিকিৎসা', meta: '৬২',
          children: [
            { id: 'acutes-wizard', href: 'acutes.html#wizard', icon: 'bx-search-alt-2', label: 'ঔষধ নির্বাচন' },
            { id: 'acutes-flow', href: 'acutes.html#flow', icon: 'bx-sitemap', label: 'নির্ণয় প্রবাহ' },
            { id: 'acutes-remedies', href: 'acutes.html#remedies', icon: 'bx-capsule', label: 'ঔষধ তালিকা' },
            { id: 'acutes-theory', href: 'acutes.html#theory', icon: 'bx-book-open', label: 'তীব্র রোগতত্ত্ব' },
            { id: 'acutes-hering', href: 'acutes.html#hering', icon: 'bx-check-circle', label: 'হেরিং-এর সূত্র' }
          ] },
        // miasm.html used to show these four as an in-page tab bar; they're a
        // sidebar submenu now so the split workspace gets the vertical room
        // back, and each child is just that section's hash — miasm-app.js
        // already read it on load and on hashchange.
        { id: 'miasm', href: 'miasm.html', icon: 'bx-analyse', label: 'মায়াজম বিশ্লেষক', meta: '৬৩',
          children: [
            { id: 'miasm-analyse', href: 'miasm.html#analyse', icon: 'bx-layout', label: 'মায়াজম নির্ণয়' },
            { id: 'miasm-model', href: 'miasm.html#model', icon: 'bx-slider-alt', label: 'নির্ণয়ের মানদণ্ড' },
            { id: 'miasm-miasms', href: 'miasm.html#miasms', icon: 'bx-book-open', label: 'মায়াজমের লক্ষণচিত্র' },
            { id: 'miasm-compare', href: 'miasm.html#compare', icon: 'bx-table', label: 'মায়াজম তুলনা' }
          ] },
        { id: 'tempraz', href: 'tempraz.html', icon: 'bx-brain', label: 'টেম্পরাজ বিশেষজ্ঞ পদ্ধতি', meta: '৫ স্বভাব' },
        { id: 'repertory', href: 'repertory.html', icon: 'bx-book-bookmark', label: 'রিপার্টরি', meta: '৩ বই' }
      ]
    },
    {
      group: 'গ্রন্থ ও সহায়িকা',
      items: [
        { id: 'anatomy', href: 'anatomy.html', icon: 'bx-body', label: 'শরীর-চিত্রে রুব্রিক', meta: '৩৮' },
        { id: 'materia', href: 'materia.html', icon: 'bx-capsule', label: 'মেটেরিয়া মেডিকা', meta: '৭২৫' },
        { id: 'organon', href: 'organon.html', icon: 'bx-book-content', label: 'অর্গানন অব মেডিসিন', meta: '২৯১',
          children: [
            { id: 'organon-principles', href: 'organon.html#principles', icon: 'bx-bulb', label: 'মূলনীতি' },
            { id: 'organon-read', href: 'organon.html#read', icon: 'bx-book-open', label: 'সম্পূর্ণ পাঠ' },
            { id: 'organon-marks', href: 'organon.html#marks', icon: 'bx-bookmark', label: 'পাঠচিহ্ন' }
          ] }
      ]
    },
    {
      group: 'বিন্যাস ও পরিচিতি',
      items: [
        { id: 'settings', href: 'settings.html', icon: 'bx-cog', label: 'বিন্যাস',
          children: [
            { id: 'settings-general', href: 'settings.html#general', icon: 'bx-buildings', label: 'সাধারণ' },
            { id: 'settings-rx', href: 'settings.html#prescription', icon: 'bx-receipt', label: 'প্রেসক্রিপশন' },
            { id: 'settings-look', href: 'settings.html#appearance', icon: 'bx-palette', label: 'চেহারা' }
          ] },
        { id: 'author', href: 'author.html', icon: 'bx-id-card', label: 'লেখক পরিচিতি' }
      ]
    }
  ];

  /* ---------------- helpers ---------------- */
  const bnNum = v => String(v).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, val) { 
      try { 
        localStorage.setItem(key, JSON.stringify(val)); 
        if (['homeoCaseDraft', 'repertory_case_v1', 'miasm_selected_v1'].includes(key) && typeof updateSidebarBadges === 'function') {
          updateSidebarBadges();
        }
        return true; 
      } catch (e) { return false; } 
    },
    del(key) { 
      try { 
        localStorage.removeItem(key); 
        if (['homeoCaseDraft', 'repertory_case_v1', 'miasm_selected_v1'].includes(key) && typeof updateSidebarBadges === 'function') {
          updateSidebarBadges();
        }
      } catch (e) {} 
    }
  };

  /* ---------------- toasts ---------------- */
  let toastHost = null;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toast-host';
      document.body.appendChild(toastHost);
    }
    const icons = { ok: 'bx-check-circle', warn: 'bx-error', err: 'bx-x-circle', info: 'bx-info-circle' };
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class='bx ${icons[kind] || icons.info}'></i><div>${message}</div>`;
    toastHost.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0'; el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 220);
    }, kind === 'err' ? 5200 : 3200);
  }

  /* ---------------- shell rendering ---------------- */
  // A NAV item's `children` render as a submenu, shown only while that item
  // is the active page (no separate expand/collapse click needed) — each
  // child is a same-page hash link, highlighted against location.hash so
  // e.g. acutes.html#remedies shows "ওষুধের তালিকা" as the active sub-item.
  // An empty hash means "this page's default section". Which section that is
  // differs per page (acutes → wizard, settings → general), so it's taken
  // from the active item's own first child rather than hardcoded.
  function defaultHash(active) {
    for (const g of NAV) {
      for (const it of g.items) {
        if (it.id === active && it.children && it.children.length) {
          const h = it.children[0].href;
          return h.includes('#') ? '#' + h.split('#')[1] : '';
        }
      }
    }
    return '';
  }

  function sidebarHtml(active) {
    const curHash = location.hash || defaultHash(active);
    /* Two kinds of child: a hash pointing at a section of the parent's own
       page, and a `page` pointing at a separate page (case.html vs
       cases.html). The hash-only test left a page-child permanently
       unhighlighted, so the list page looked like nothing was selected. */
    const subActive = c => c.page
      ? c.page === active
      : (c.href.includes('#') && ('#' + c.href.split('#')[1]) === curHash);
    return `
      <div class="sb-brand">
        <div class="sb-mark">${APP.mark}</div>
        <div class="sb-brand-txt">
          <div class="sb-name">${APP.name}</div>
          <div class="sb-tag">${APP.tagline}</div>
        </div>
      </div>
      <nav class="sb-scroll" aria-label="প্রধান নেভিগেশন">
        ${NAV.map(g => `
          <div class="sb-group">
            <div class="sb-group-label">${g.group}</div>
            ${g.items.map(it => {
              // An item with children is a toggle, never a link — clicking
              // it used to navigate to it.href *and* the browser would jump
              // away before the submenu had a chance to open, so the only
              // way to reach a child was to land on the parent page first
              // and back out. A <button> can't navigate by accident.
              const tag = it.children ? 'button' : 'a';
              // A child on its own page makes the parent current too, or the
              // whole group would collapse while you are standing inside it.
              const onChild = (it.children || []).some(c => c.page && c.page === active);
              const isActive = it.id === active || onChild;
              const expanded = isActive;
              return `
              <${tag} class="sb-link ${isActive ? 'active' : ''}${it.children ? ' has-sub' : ''}${expanded ? ' expanded' : ''}"
                 data-id="${it.id}"
                 ${tag === 'a' ? `href="${it.href}"` : 'type="button"'}
                 ${isActive ? 'aria-current="page"' : ''}
                 ${it.children ? `aria-expanded="${expanded}"` : ''}>
                <i class='bx ${it.icon}'></i>
                <span class="sb-lbl">${it.label}</span>
                ${it.meta ? `<span class="sb-meta">${it.meta}</span>` : ''}
                ${it.children ? `<i class='bx bx-chevron-down sb-caret'></i>` : ''}
              </${tag}>
              ${it.children ? `
                <div class="sb-submenu${expanded ? ' expanded' : ''}">
                  ${it.children.map(c => `
                    <a class="sb-sublink ${subActive(c) ? 'active' : ''}" href="${c.href}">
                      <i class='bx ${c.icon}'></i>
                      <span class="sb-lbl">${c.label}</span>
                    </a>`).join('')}
                </div>` : ''}`;
            }).join('')}
          </div>`).join('')}
      </nav>
      <div class="sb-foot">
        <span class="sb-ver"><i class='bx bx-package'></i> সংস্করণ ${APP.version}</span>
        <div style="margin-top:0.5rem;">সম্পূর্ণ অফলাইন · ডেটা শুধু এই ব্রাউজারে থাকে</div>
      </div>`;
  }

  // A has-sub button only ever toggles its own submenu open or closed — it
  // never navigates, so opening it to look for a section doesn't also jump
  // you to that page's default tab first.
  function bindSubmenuToggle() {
    document.querySelectorAll('.sb-link.has-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.nextElementSibling;
        const open = !btn.classList.contains('expanded');
        btn.classList.toggle('expanded', open);
        btn.setAttribute('aria-expanded', String(open));
        if (sub && sub.classList.contains('sb-submenu')) sub.classList.toggle('expanded', open);
      });
    });
  }

  // Keeps the sidebar submenu's active sub-item in sync when the hash
  // changes without a page reload (clicking another sub-link while already
  // on that page) — cheaper than re-rendering the whole sidebar.
  function bindSubmenuHashSync(active) {
    window.addEventListener('hashchange', () => {
      const curHash = location.hash || defaultHash(active);
      document.querySelectorAll('.sb-sublink').forEach(a => {
        const href = a.getAttribute('href') || '';
        const on = href.includes('#') && ('#' + href.split('#')[1]) === curHash;
        a.classList.toggle('active', on);
      });
    });
  }

  function topbarHtml(page) {
    return `
      <button class="tb-burger" id="navToggle" aria-label="মেনু খুলুন" aria-expanded="false">
        <i class='bx bx-menu'></i>
      </button>
      <div class="tb-titles">
        <div class="tb-crumb"><i class='bx bx-home-alt'></i> ${APP.name} <i class='bx bx-chevron-right'></i> ${page.crumb || page.title}</div>
        <div class="tb-title">${page.title}</div>
      </div>
      <div class="tb-actions" id="topbarActions"></div>`;
  }

  function init() {
    const body = document.body;
    const active = body.dataset.page || '';
    const page = { title: body.dataset.title || document.title, crumb: body.dataset.crumb };

    const sidebar = document.getElementById('appSidebar');
    const topbar = document.getElementById('appTopbar');
    if (sidebar) {
      sidebar.innerHTML = sidebarHtml(active);
      updateSidebarBadges();
      bindSubmenuToggle();
      bindSubmenuHashSync(active);
    }
    if (topbar) {
      topbar.innerHTML = topbarHtml(page);
      setupDarkModeToggle();
    }

    // Track recently visited modules (exclude dashboard)
    if (active && active !== 'dashboard') {
      let recent = store.get('recent_modules_v1', []);
      recent = recent.filter(p => p !== active);
      recent.unshift(active);
      if (recent.length > 3) recent.pop();
      store.set('recent_modules_v1', recent);
    }
    
    // Setup bottom nav for mobile
    setupBottomNav(active);
    
    // Init dark mode
    initDarkMode();

    // mobile drawer (overlay + backdrop, ≤860px) — same #navToggle button also
    // drives the desktop sidebar-collapse below, since only one of the two
    // effects is ever visible at a given viewport width.
    const MOBILE_BP = 860;
    const toggle = document.getElementById('navToggle');
    const backdrop = document.getElementById('appBackdrop');
    const setNav = open => {
      body.classList.toggle('nav-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', String(open));
    };
    if (backdrop) backdrop.addEventListener('click', () => setNav(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });
    if (sidebar) sidebar.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
    // a resize past the breakpoint must not leave the drawer state stuck
    window.addEventListener('resize', () => { if (window.innerWidth > MOBILE_BP) setNav(false); });

    // desktop sidebar collapse — reclaims the sidebar's width for content,
    // remembered across visits like the dark-mode/colour preferences
    const COLLAPSE_KEY = 'sidebar_collapsed_v1';
    if (window.innerWidth > MOBILE_BP && store.get(COLLAPSE_KEY, false)) {
      body.classList.add('sidebar-collapsed');
    }
    if (toggle) toggle.addEventListener('click', () => {
      if (window.innerWidth <= MOBILE_BP) {
        setNav(!body.classList.contains('nav-open'));
      } else {
        const collapsed = !body.classList.contains('sidebar-collapsed');
        body.classList.toggle('sidebar-collapsed', collapsed);
        store.set(COLLAPSE_KEY, collapsed);
      }
    });
  }

  function initDarkMode() {
    let theme = store.get('theme_preference', 'system');
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
    
    // Also apply theme color variation
    const color = store.get('theme_color_v1', 'teal');
    document.documentElement.dataset.color = color;
  }

  function setupDarkModeToggle() {
    const btn = addAction(`<button class="tb-btn" id="themeToggle" aria-label="থিম পরিবর্তন" title="ডার্ক মোড টগল করুন"><i class='bx bx-moon'></i></button>`);
    if (!btn) return;
    
    // Update icon based on current theme
    const updateIcon = () => {
      const isDark = document.documentElement.dataset.theme === 'dark';
      btn.innerHTML = isDark ? `<i class='bx bx-sun'></i>` : `<i class='bx bx-moon'></i>`;
    };
    
    // Run initially
    updateIcon();
    // Observe dataset theme changes if needed or just handle it on click
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      document.documentElement.dataset.theme = newTheme;
      store.set('theme_preference', newTheme);
      updateIcon();
    });
  }

  function getGreeting() {
    const hr = new Date().getHours();
    if (hr >= 5 && hr < 12) return 'শুভ সকাল';
    if (hr >= 12 && hr < 17) return 'শুভ অপরাহ্ণ';
    if (hr >= 17 && hr < 20) return 'শুভ সন্ধ্যা';
    return 'শুভ রাত্রি';
  }

  function updateSidebarBadges() {
    // Check localStorage for active work and update .sb-meta dynamically
    const draft = store.get('homeoCaseDraft', null);
    if (draft && typeof draft === 'object' && Object.keys(draft).length) {
      updateSbMeta('case', 'খসড়া');
    } else {
      updateSbMeta('case', '৯ ধাপ', true);
    }
    const rep = store.get('repertory_case_v1', null);
    if (rep && rep.picked && rep.picked.length) {
      updateSbMeta('repertory', bnNum(rep.picked.length) + 'টি');
    } else {
      updateSbMeta('repertory', '৩ বই', true);
    }
    const miasm = store.get('miasm_selected_v1', null);
    if (miasm && miasm.length) {
      updateSbMeta('miasm', bnNum(miasm.length) + 'টি');
    } else {
      updateSbMeta('miasm', '৬৩', true);
    }
  }

  function updateSbMeta(id, text, reset = false) {
    const link = document.querySelector(`.sb-link[href^="${id}.html"]`);
    if (link) {
      let meta = link.querySelector('.sb-meta');
      if (!meta) {
        meta = document.createElement('span');
        meta.className = 'sb-meta';
        link.appendChild(meta);
      }
      meta.textContent = text;
      if (reset) {
        meta.style.background = '';
        meta.style.color = '';
      } else {
        meta.style.background = 'var(--primary)';
        meta.style.color = '#fff';
      }
    }
  }

  function setupBottomNav(active) {
    if (document.getElementById('appBottomNav')) return;
    const navHtml = `
      <nav class="app-bottom-nav" id="appBottomNav">
        <a href="index.html" class="bn-item ${active==='dashboard'?'active':''}"><i class='bx bx-grid-alt'></i><span>সারসংক্ষেপ</span></a>
        <a href="case.html" class="bn-item ${active==='case'?'active':''}"><i class='bx bx-clipboard'></i><span>কেস</span></a>
        <a href="cases.html" class="bn-item ${active==='cases'?'active':''}"><i class='bx bx-folder-open'></i><span>কেস তালিকা</span></a>
        <a href="repertory.html" class="bn-item ${active==='repertory'?'active':''}"><i class='bx bx-book-bookmark'></i><span>রিপার্টরি</span></a>
        <a href="materia.html" class="bn-item ${active==='materia'?'active':''}"><i class='bx bx-capsule'></i><span>মেটেরিয়া</span></a>
      </nav>
    `;
    document.body.insertAdjacentHTML('beforeend', navHtml);
  }

  /* ---------------- topbar action helpers ---------------- */
  function addAction(html) {
    const host = document.getElementById('topbarActions');
    if (!host) return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const el = wrap.firstElementChild;
    host.appendChild(el);
    return el;
  }
  function setChip(text, icon, muted) {
    let chip = document.getElementById('tbChip');
    if (!chip) {
      chip = addAction(`<span class="tb-chip" id="tbChip"></span>`);
      if (!chip) return;
    }
    chip.className = 'tb-chip' + (muted ? ' muted' : '');
    chip.innerHTML = `<i class='bx ${icon || 'bx-check'}'></i><span class="tb-label">${text}</span>`;
  }

  /* ---------------- case <-> repertory <-> prescription bridge ----------------
     One localStorage record the three modules hand back and forth, so a case
     never has to be re-typed to be repertorised and a prescription never has to
     be re-typed from the case. Kept here rather than in any one page because all
     three read and write it, and a shape mismatch between them would silently
     drop the hand-off.

       { from, at, patient, caseNo, symptoms[], rubrics[], remedy, book }

     `symptoms` are free-text phrases lifted off the case form to seed rubric
     search; `rubrics` and `remedy` are what the repertory sends back. */
  const BRIDGE_KEY = 'case_bridge_v1';
  const bridge = {
    get() { return store.get(BRIDGE_KEY, null); },
    /* Merge rather than replace: the repertory adds rubrics/remedy to a record
       the case form created, and neither should clobber the other's fields. */
    patch(patch) {
      const cur = store.get(BRIDGE_KEY, null) || {};
      const next = Object.assign({}, cur, patch, { at: new Date().toISOString() });
      store.set(BRIDGE_KEY, next);
      return next;
    },
    clear() { store.del(BRIDGE_KEY); }
  };

  /* ---------------- clinic profile + per-module settings ----------------
     Who the prescriber is (name, degree, chamber, logo) is *one* fact about
     the practice, not something each page should ask for again. It lives
     here so the settings page owns the editing and every other page only
     reads — previously the prescription page and the settings page each had
     their own copy of the same five fields writing to the same key, and
     saving on one silently deleted what the other had added.

       clinic_profile_v1  { docName, docQual, docReg, docPhone,
                            clinicName, clinicAddress, clinicPhone,
                            clinicHours, docLogo }
       rx_settings_v1     { template, dietAdvice, generalAdvice, followUp }

     Both are patch-merged, never wholesale-replaced, so a page that knows
     about only some of the keys cannot drop the rest. */
  const PROFILE_KEY = 'clinic_profile_v1';
  const RXSET_KEY = 'rx_settings_v1';
  const LEGACY_DOC_KEY = 'rx_doctor_v1';

  function makeStore(key, migrate) {
    return {
      get() {
        let cur = store.get(key, null);
        if (!cur && typeof migrate === 'function') {
          cur = migrate();
          if (cur) store.set(key, cur);
        }
        return cur || {};
      },
      /* Merge, never replace — see the note above. */
      patch(p) {
        const next = Object.assign({}, this.get(), p);
        store.set(key, next);
        return next;
      }
    };
  }

  /* One-time lift of the old single-blob key into its two successors, so an
     existing user's letterhead and chosen template survive the split. */
  const profile = makeStore(PROFILE_KEY, () => {
    const old = store.get(LEGACY_DOC_KEY, null);
    if (!old) return null;
    return {
      docName: old.docName || '', docQual: old.docQual || '',
      docReg: old.docReg || '', docPhone: old.docPhone || '',
      clinicAddress: old.docClinic || '', docLogo: old.docLogo || ''
    };
  });

  const rxSettings = makeStore(RXSET_KEY, () => {
    const old = store.get(LEGACY_DOC_KEY, null);
    if (!old) return null;
    return { template: old.docTemplate || 'classic' };
  });

  global.Shell = { APP, NAV, bnNum, store, toast, addAction, setChip, init, bridge,
                   getGreeting, profile, rxSettings };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
