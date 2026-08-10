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
      group: 'কেস ম্যানেজমেন্ট',
      items: [
        { id: 'dashboard', href: 'index.html', icon: 'bx-grid-alt', label: 'ড্যাশবোর্ড' },
        { id: 'case', href: 'case.html', icon: 'bx-clipboard', label: 'কেস টেকিং ফর্ম', meta: '৯ ধাপ' },
        { id: 'prescription', href: 'prescription.html', icon: 'bx-receipt', label: 'প্রেসক্রিপশন' }
      ]
    },
    {
      group: 'বিশ্লেষণ টুল',
      items: [
        { id: 'acutes', href: 'acutes.html', icon: 'bx-sitemap', label: 'তীব্র রোগের তত্ত্ব', meta: '৬২' },
        { id: 'miasm', href: 'miasm.html', icon: 'bx-analyse', label: 'মায়াজম বিশ্লেষক', meta: '৬৩' },
        { id: 'tempraz', href: 'tempraz.html', icon: 'bx-brain', label: 'টেম্পরাজ বিশেষজ্ঞ পদ্ধতি', meta: '৫ স্বভাব' },
        { id: 'repertory', href: 'repertory.html', icon: 'bx-book-bookmark', label: 'রিপার্টরি', meta: '৩ বই' }
      ]
    },
    {
      group: 'রেফারেন্স',
      items: [
        { id: 'materia', href: 'materia.html', icon: 'bx-capsule', label: 'মেটেরিয়া মেডিকা', meta: '৭২৫' },
        { id: 'flowchart', href: 'acutes.html#flow', icon: 'bx-image-alt', label: 'অ্যাকিউট ফ্লো চার্ট' },
        { id: 'compare', href: 'miasm.html#compare', icon: 'bx-table', label: 'মায়াজম তুলনা' }
      ]
    },
    {
      group: 'সম্পর্কে',
      items: [
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
  function sidebarHtml(active) {
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
            ${g.items.map(it => `
              <a class="sb-link ${it.id === active ? 'active' : ''}" href="${it.href}"
                 ${it.id === active ? 'aria-current="page"' : ''}>
                <i class='bx ${it.icon}'></i>
                <span class="sb-lbl">${it.label}</span>
                ${it.meta ? `<span class="sb-meta">${it.meta}</span>` : ''}
              </a>`).join('')}
          </div>`).join('')}
      </nav>
      <div class="sb-foot">
        <span class="sb-ver"><i class='bx bx-package'></i> সংস্করণ ${APP.version}</span>
        <div style="margin-top:0.5rem;">সম্পূর্ণ অফলাইন · ডেটা শুধু এই ব্রাউজারে থাকে</div>
      </div>`;
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

    // mobile drawer
    const toggle = document.getElementById('navToggle');
    const backdrop = document.getElementById('appBackdrop');
    const setNav = open => {
      body.classList.toggle('nav-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', String(open));
    };
    if (toggle) toggle.addEventListener('click', () => setNav(!body.classList.contains('nav-open')));
    if (backdrop) backdrop.addEventListener('click', () => setNav(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });
    if (sidebar) sidebar.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
    // a resize past the breakpoint must not leave the drawer state stuck
    window.addEventListener('resize', () => { if (window.innerWidth > 860) setNav(false); });
  }

  function initDarkMode() {
    let theme = store.get('theme_preference', 'system');
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
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
        <a href="index.html" class="bn-item ${active==='dashboard'?'active':''}"><i class='bx bx-grid-alt'></i><span>ড্যাশবোর্ড</span></a>
        <a href="case.html" class="bn-item ${active==='case'?'active':''}"><i class='bx bx-clipboard'></i><span>কেস</span></a>
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

  global.Shell = { APP, NAV, bnNum, store, toast, addAction, setChip, init, bridge, getGreeting };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
