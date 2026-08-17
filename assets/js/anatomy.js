/* ==========================================================================
   শরীর-চিত্রে রুব্রিক — body map -> Kent chapter picker
   Tapping a region hands the repertory a book and a chapter number; the
   repertory does the loading. Counts come from anatomy.json, which is
   generated from the built repertory, so the figure cannot drift from the book.
   ========================================================================== */
'use strict';

(function () {
  const bn = window.Shell ? Shell.bnNum : (v => String(v));
  const store = window.Shell ? Shell.store
    : { get: (k, d) => d, set: () => {}, del: () => {} };
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICON = {
    head: 'bx-been', eye: 'bx-show', ear: 'bx-volume-full', nose: 'bx-wind',
    face: 'bx-happy', mouth: 'bx-message-rounded-dots', throat: 'bx-microphone',
    chest: 'bx-lungs', stomach: 'bx-restaurant', abdomen: 'bx-circle',
    urinary: 'bx-droplet', genitals: 'bx-male-female', arm: 'bx-hand',
    leg: 'bx-walk', backhead: 'bx-been', nape: 'bx-chevron-up-circle',
    back: 'bx-been', rectum: 'bx-circle', backarm: 'bx-hand', backleg: 'bx-walk'
  };

  const S = { data: null, view: 'model', sel: null, byId: new Map() };

  document.addEventListener('DOMContentLoaded', () => {
    fetch('assets/data/anatomy.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(json => {
        S.data = json;
        json.regions.forEach(r => S.byId.set(r.id, r));
        renderStats();
        renderList();
        renderFixed();
        renderSel();
        wire();
        // 3D is the default view and starts loading with the page rather than
        // waiting for a tab click
        setView('model');
      })
      .catch(e => {
        console.error('শরীর-চিত্রের ডেটা লোড ব্যর্থ:', e);
        $('anSel').innerHTML =
          `<div class="an-sel-empty"><i class='bx bx-error'></i>
             <span>শরীর-চিত্রের ডেটা লোড করা যায়নি।</span></div>`;
      });
  });

  function renderStats() {
    const m = S.data.metadata;
    $('anCh').textContent = bn(m.chapters_total);
    $('anRub').textContent = bn(m.rubrics_total);
    $('anDisc').textContent = m.note_bn + ' উৎস: ' + m.source_bn + '।';
    if (window.Shell) Shell.setChip('কেন্ট রিপার্টরী', 'bx-body', true);
  }

  /* ── one row: a region, or a bare chapter ── */
  const rowRegion = r => `
    <button class="an-i" data-pick="${esc(r.id)}">
      <i class='bx ${esc(ICON[r.id] || 'bx-radio-circle')}'></i>
      <span class="an-i-bn">${esc(r.label)}
        <small>${r.chapters.map(c => esc(c.bn)).join(' · ')}</small></span>
      <span class="an-i-n">${bn(r.rubrics)}</span>
    </button>`;

  const rowChapter = c => `
    <button class="an-i" data-chapter="${c.num}">
      <i class='bx bx-book-open'></i>
      <span class="an-i-bn">${esc(c.bn)}<small>${esc(c.en)}</small></span>
      <span class="an-i-n">${bn(c.rubrics)}</span>
    </button>`;

  function renderList() {
    // the 3D model shows the whole body at once, so list every region there
    const rows = S.view === 'model'
      ? S.data.regions
      : S.data.regions.filter(r => r.view === S.view);
    $('anList').innerHTML = rows.map(rowRegion).join('');
    syncActive();
    markCalTarget();
  }

  function renderFixed() {
    $('anWhole').innerHTML = S.data.wholebody.map(rowChapter).join('');
    $('anNonlocal').innerHTML = S.data.nonlocal.map(rowChapter).join('');
  }

  function renderSel() {
    const host = $('anSel');
    if (!S.sel) {
      host.innerHTML = `
        <div class="an-sel-empty">
          <i class='bx bx-pointer'></i>
          <span>শরীরের কোনো অংশে চাপ দিন — সেই অংশের অধ্যায়গুলি এখানে দেখাবে।</span>
        </div>`;
      return;
    }
    const r = S.sel;
    host.innerHTML = `
      <div class="an-sel-head">
        <div class="an-sel-ic"><i class='bx ${esc(ICON[r.id] || 'bx-radio-circle')}'></i></div>
        <div>
          <h3>${esc(r.label)}</h3>
          <p>${bn(r.chapters.length)}টি অধ্যায় · ${bn(r.rubrics)}টি রুব্রিক</p>
        </div>
      </div>
      <div class="an-ch">${r.chapters.map(rowChapter).join('')}</div>
      <button class="an-open" data-chapter="${r.chapters[0].num}">
        <i class='bx bx-book-bookmark'></i> ${esc(r.chapters[0].bn)} অধ্যায় খুলুন
      </button>`;
  }

  function pick(id) {
    const r = S.byId.get(id);
    if (!r) return;
    // while calibrating, picking a region arms it for the next model click
    // instead of navigating
    if (M.cal) { M.calId = id; markCalTarget(); return; }
    // a region can live on the other view (the list is per-view, the figure
    // is not) — follow it rather than selecting something invisible. The 3D
    // model carries every region, so it never needs to switch.
    if (S.view !== 'model' && r.view !== S.view) setView(r.view);
    S.sel = r;
    renderSel();
    syncActive();
  }

  /* keep the SVG figure, the 3D hotspots and the list on the same selection */
  function syncActive() {
    const id = S.sel ? S.sel.id : null;
    document.querySelectorAll('.an-r, .an-hs').forEach(el =>
      el.classList.toggle('on', el.dataset.region === id));
    document.querySelectorAll('#anList .an-i').forEach(el =>
      el.classList.toggle('on', el.dataset.pick === id));
  }

  function setView(v) {
    S.view = v;
    $('anViewFront').hidden = v !== 'front';
    $('anViewBack').hidden = v !== 'back';
    $('anViewModel').hidden = v !== 'model';
    document.querySelectorAll('.an-vb').forEach(b =>
      b.classList.toggle('active', b.dataset.view === v));
    renderList();
    if (v === 'model') init3d();
  }

  /* ==================== 3D ====================
     Loads with the page: 3D is the primary view. The viewer bundle is 933 KB
     and the model 5.8 MB, so this is a real cost on a slow connection — the
     drawn figure stays one tap away and takes over automatically if WebGL or
     the model file is unavailable. */
  const M = { started: false, ready: false, cfg: null, cal: false, calId: null,
              saved: {} };
  const CAL_KEY = 'anatomy_hotspots_cal_v1';

  function msg(html) { $('an3dMsg').innerHTML = html; $('an3dMsg').hidden = false; }

  async function init3d() {
    if (M.started) return;
    M.started = true;
    try {
      M.cfg = await (await fetch('assets/data/anatomy_hotspots.json')).json();
    } catch (e) {
      return msg(`<i class='bx bx-error'></i><p>হটস্পট কনফিগ পড়া যায়নি।</p>`);
    }
    M.saved = store.get(CAL_KEY, {});

    // A missing model is the expected first-run state, not an error — say so
    // plainly and point at the file, rather than showing a broken viewer.
    const head = await fetch(M.cfg.model, { method: 'HEAD' }).catch(() => null);
    if (!head || !head.ok) {
      return msg(`<i class='bx bx-cube'></i>
        <p><b>৩ডি মডেল ফাইলটি এখনও যোগ করা হয়নি।</b><br>
        লাইসেন্সের কারণে মডেলটি অ্যাপের সঙ্গে দেওয়া যায়নি — নিজে নামিয়ে এই জায়গায় রাখুন:
        <code>${esc(M.cfg.model)}</code><br>
        পদ্ধতি লেখা আছে <code>assets/data/models/README.md</code> ফাইলে।</p>
        <button class="an-3dbtn" data-view-switch="front"><i class='bx bx-user'></i> ছবির দৃশ্যে ফিরুন</button>`);
    }

    try {
      await import('../vendor/model-viewer/model-viewer.min.js');
    } catch (e) {
      console.error(e);
      return msg(`<i class='bx bx-error'></i><p>৩ডি ভিউয়ার চালু করা যায়নি — এই ব্রাউজারে
        WebGL সম্ভবত বন্ধ। ছবির দৃশ্য ব্যবহার করুন।</p>
        <button class="an-3dbtn" data-view-switch="front"><i class='bx bx-user'></i> ছবির দৃশ্যে ফিরুন</button>`);
    }
    build3d();
  }

  function build3d() {
    const spots = Object.assign({}, M.cfg.hotspots, M.saved);
    const mv = document.createElement('model-viewer');
    mv.id = 'anMV';
    mv.setAttribute('src', M.cfg.model);
    mv.setAttribute('alt', 'মানবদেহের ৩ডি মডেল');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('touch-action', 'pan-y');
    mv.setAttribute('shadow-intensity', '0.9');
    mv.setAttribute('exposure', '1.05');
    mv.setAttribute('environment-image', 'neutral');
    // The model is centred on the origin and ~1.8 units tall, so frame it
    // explicitly — model-viewer's auto-framing pulled the camera in far too
    // close and cropped the body.
    mv.setAttribute('camera-target', '0m 0m 0m');
    mv.setAttribute('camera-orbit', '0deg 90deg 3.8m');
    mv.setAttribute('min-camera-orbit', 'auto auto 0.9m');
    mv.setAttribute('max-camera-orbit', 'auto auto 7m');
    mv.setAttribute('field-of-view', '32deg');
    mv.setAttribute('min-field-of-view', '10deg');
    mv.setAttribute('max-field-of-view', '45deg');
    mv.setAttribute('interaction-prompt', 'none');

    S.data.regions.forEach((r, i) => {
      const s = spots[r.id];
      if (!s) return;
      const b = document.createElement('button');
      b.className = 'an-hs';
      b.slot = `hotspot-${r.id}`;
      b.dataset.position = s.position;
      b.dataset.normal = s.normal || '0 0 1';
      b.dataset.region = r.id;
      b.setAttribute('aria-label', `${r.label} — ${r.rubrics} রুব্রিক`);
      b.innerHTML = `<span class="an-hs-l">${esc(r.label)}` +
                    `<span class="an-hs-n">${bn(r.rubrics)}</span></span>`;
      mv.appendChild(b);
    });

    $('an3dMsg').hidden = true;
    $('an3dHost').appendChild(mv);
    M.mv = mv;
    $('an3dBar').hidden = false;
    $('an3dCtl').hidden = false;
    $('an3dView').hidden = false;
    const attr = (M.cfg.attribution || '').trim();
    $('an3dAttr').textContent = attr ? `মডেল: ${attr}` : '';
    if (!attr) $('an3dAttr').title = 'CC-BY-SA মডেল হলে কৃতজ্ঞতা স্বীকার বাধ্যতামূলক';

    mv.addEventListener('load', () => {
      M.ready = true;
      syncActive();
      // model-viewer exposes materials by name, and the merge tool names one
      // node per organ — so the skin can be faded without touching the organs
      M.mats = (mv.model && mv.model.materials || []);
      M.skinMat = M.mats.filter(m => /skin/i.test(m.name || ''));
      applySkin($('anSkin').value);
      renderOrganList();
    });
    mv.addEventListener('error', () =>
      msg(`<i class='bx bx-error'></i><p>মডেল ফাইলটি পড়া যায়নি — ফাইলটি কি সত্যিই
        <code>.glb</code>? <code>python3 tools/model_check.py</code> দিয়ে পরীক্ষা করুন।</p>`));

    // calibration: click the model, record where the ray hit the surface
    mv.addEventListener('click', ev => {
      if (!M.cal || !M.calId) return;
      const hit = mv.positionAndNormalFromPoint(ev.clientX, ev.clientY);
      if (!hit) return Shell && Shell.toast('মডেলের গায়ে ক্লিক করুন।', 'warn');
      M.saved[M.calId] = { position: hit.position.toString(), normal: hit.normal.toString() };
      store.set(CAL_KEY, M.saved);
      const b = mv.querySelector(`[data-region="${M.calId}"]`);
      if (b) { b.dataset.position = hit.position.toString(); b.dataset.normal = hit.normal.toString(); }
      Shell && Shell.toast(`${S.byId.get(M.calId).label} — অবস্থান রাখা হলো।`, 'ok');
      M.calId = null;
      markCalTarget();
    });
  }

  /* 0 = organs fully exposed, 100 = opaque body. Alpha mode has to flip too:
     a BLEND material at alpha 1 still sorts as transparent and flickers. */
  function applySkin(v) {
    const a = Math.max(0, Math.min(100, +v)) / 100;
    (M.skinMat || []).forEach(m => {
      const c = m.pbrMetallicRoughness.baseColorFactor.slice(0, 3);
      m.pbrMetallicRoughness.setBaseColorFactor([...c, a]);
      if (m.setAlphaMode) m.setAlphaMode(a >= 0.99 ? 'OPAQUE' : 'BLEND');
    });
  }

  /* ── camera ──
     Zoom is the orbit radius, not field-of-view: changing fov distorts the
     body, moving the camera does not. */
  function orbit(parts) {
    if (!M.mv) return null;
    const cur = M.mv.getCameraOrbit();
    return Object.assign({ theta: cur.theta, phi: cur.phi, radius: cur.radius }, parts);
  }
  function setOrbit(o) {
    if (!M.mv || !o) return;
    const deg = r => (r * 180 / Math.PI).toFixed(1);
    M.mv.cameraOrbit = `${deg(o.theta)}deg ${deg(o.phi)}deg ${o.radius.toFixed(3)}m`;
  }
  function zoom(f) {
    const o = orbit({});
    if (!o) return;
    setOrbit(Object.assign(o, { radius: Math.min(7, Math.max(0.9, o.radius * f)) }));
  }
  function preset(thetaDeg) {
    if (!M.mv) return;
    M.mv.cameraOrbit = `${thetaDeg}deg 90deg 3.8m`;
    document.querySelectorAll('[data-orbit]').forEach(b =>
      b.classList.toggle('active', +b.dataset.orbit === +thetaDeg));
  }
  function resetCam() {
    if (!M.mv) return;
    M.mv.cameraTarget = '0m 0m 0m';
    M.mv.fieldOfView = '32deg';
    preset(0);
  }

  /* ── per-organ visibility ──
     The merge tool names one material per organ, so each can be faded out
     individually — which is how you actually look at a liver behind a gut. */
  const ORG_KEY = 'anatomy_organs_off_v1';
  function renderOrganList() {
    const names = (M.cfg.organ_names) || {};
    const off = new Set(store.get(ORG_KEY, []));
    M.alpha = M.alpha || {};
    const rows = M.mats.map(m => {
      const key = (m.name || '').replace(/^mat-/, '');
      if (/skin/i.test(key)) return '';           // skin has its own slider
      const c = m.pbrMetallicRoughness.baseColorFactor;
      M.alpha[key] = M.alpha[key] === undefined ? c[3] : M.alpha[key];
      const rgb = `rgb(${c.slice(0, 3).map(v => Math.round(v * 255)).join(',')})`;
      return `<button class="an-org${off.has(key) ? ' off' : ''}" data-organ="${esc(key)}">
                <span class="sw" style="background:${rgb}"></span>${esc(names[key] || key)}
              </button>`;
    }).join('');
    $('anOrganList').innerHTML = rows;
    off.forEach(k => setOrganVisible(k, false));
  }
  function setOrganVisible(key, on) {
    const m = M.mats.find(x => (x.name || '').replace(/^mat-/, '') === key);
    if (!m) return;
    const c = m.pbrMetallicRoughness.baseColorFactor.slice(0, 3);
    const a = on ? (M.alpha[key] ?? 1) : 0;
    m.pbrMetallicRoughness.setBaseColorFactor([...c, a]);
    if (m.setAlphaMode) m.setAlphaMode(a >= 0.99 ? 'OPAQUE' : 'BLEND');
  }
  function toggleOrgan(key) {
    const off = new Set(store.get(ORG_KEY, []));
    const nowOff = !off.has(key);
    if (nowOff) off.add(key); else off.delete(key);
    store.set(ORG_KEY, [...off]);
    setOrganVisible(key, !nowOff);
    const b = document.querySelector(`[data-organ="${key}"]`);
    if (b) b.classList.toggle('off', nowOff);
  }

  function markCalTarget() {
    document.querySelectorAll('#anList .an-i').forEach(el =>
      el.classList.toggle('an-cal-live', M.cal && el.dataset.pick === M.calId));
  }

  function toggleCal() {
    M.cal = !M.cal;
    M.calId = null;
    $('anCal').classList.toggle('on', M.cal);
    $('anCalCopy').hidden = !M.cal;
    $('anCalReset').hidden = !M.cal;
    markCalTarget();
    if (M.cal) {
      setView('model');
      Shell && Shell.toast('পাশের তালিকা থেকে একটি অংশ বেছে নিন, তারপর মডেলের সেই জায়গায় ক্লিক করুন।', 'info');
    }
  }

  function copyCal() {
    const merged = Object.assign({}, M.cfg.hotspots, M.saved);
    const txt = JSON.stringify(merged, null, 2);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => Shell && Shell.toast('হটস্পট JSON কপি হয়েছে — anatomy_hotspots.json-এ বসান।', 'ok'))
      .catch(() => { console.log(txt); Shell && Shell.toast('ক্লিপবোর্ড পাওয়া যায়নি — কনসোলে ছাপা হয়েছে।', 'warn'); });
  }

  /* Hand off to the repertory. It reads these on boot, loads the book and
     preselects the chapter — see the deep-link block in repertory.js. */
  function openChapter(num) {
    const book = S.data.metadata.book || 'kent';
    location.href = `repertory.html?book=${encodeURIComponent(book)}&ch=${encodeURIComponent(num)}`;
  }

  function wire() {
    document.querySelectorAll('.an-vb').forEach(b =>
      b.addEventListener('click', () => setView(b.dataset.view)));

    document.addEventListener('click', e => {
      const sw = e.target.closest('[data-view-switch]');
      if (sw) return setView(sw.dataset.viewSwitch);
      const reg = e.target.closest('[data-region]');
      if (reg) return pick(reg.dataset.region);
      const li = e.target.closest('[data-pick]');
      if (li) return pick(li.dataset.pick);
      const ch = e.target.closest('[data-chapter]');
      if (ch) return openChapter(ch.dataset.chapter);
    });

    $('anSkin').addEventListener('input', e => applySkin(e.target.value));

    document.addEventListener('click', e => {
      const cam = e.target.closest('[data-cam]');
      if (cam) {
        const a = cam.dataset.cam;
        if (a === 'in') zoom(0.78);
        else if (a === 'out') zoom(1.28);
        else resetCam();
        return;
      }
      const ob = e.target.closest('[data-orbit]');
      if (ob) return preset(+ob.dataset.orbit);
      const org = e.target.closest('[data-organ]');
      if (org) return toggleOrgan(org.dataset.organ);
    });

    $('anSpin').addEventListener('click', () => {
      if (!M.mv) return;
      const on = !M.mv.hasAttribute('auto-rotate');
      M.mv.toggleAttribute('auto-rotate', on);
      $('anSpin').classList.toggle('on', on);
    });

    $('anFull').addEventListener('click', () => {
      const host = $('anViewModel');
      if (document.fullscreenElement) document.exitFullscreen();
      else if (host.requestFullscreen) host.requestFullscreen();
    });

    $('anOrgans').addEventListener('click', () => {
      const l = $('anOrganList');
      l.hidden = !l.hidden;
      $('anOrgans').classList.toggle('on', !l.hidden);
    });
    $('anCal').addEventListener('click', toggleCal);
    $('anCalCopy').addEventListener('click', copyCal);
    $('anCalReset').addEventListener('click', () => {
      M.saved = {};
      store.del(CAL_KEY);
      Shell && Shell.toast('নির্ধারিত অবস্থান মুছে ডিফল্টে ফেরানো হলো — পাতা রিলোড করুন।', 'ok');
    });

    // SVG shapes are focusable, so make them behave like the buttons they are
    document.querySelectorAll('.an-r').forEach(el => {
      const r = S.byId.get(el.dataset.region);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      if (r) el.setAttribute('aria-label', `${r.label} — ${r.rubrics} রুব্রিক`);
      el.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(el.dataset.region); }
      });
    });
  }
})();
