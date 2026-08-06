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
        { id: 'case', href: 'case.html', icon: 'bx-clipboard', label: 'কেস টেকিং ফর্ম', meta: '৯ ধাপ' }
      ]
    },
    {
      group: 'বিশ্লেষণ টুল',
      items: [
        { id: 'acutes', href: 'acutes.html', icon: 'bx-sitemap', label: 'তীব্র রোগের তত্ত্ব', meta: '৬২' },
        { id: 'miasm', href: 'miasm.html', icon: 'bx-analyse', label: 'মায়াজম বিশ্লেষক', meta: '৬৩' },
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
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    del(key) { try { localStorage.removeItem(key); } catch (e) {} }
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
    if (sidebar) sidebar.innerHTML = sidebarHtml(active);
    if (topbar) topbar.innerHTML = topbarHtml(page);

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

  global.Shell = { APP, NAV, bnNum, store, toast, addAction, setChip, init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
