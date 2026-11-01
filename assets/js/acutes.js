// ===== Load & Parse JSON =====
let DATA = null;   // assets/data/acutes.json  (theory, miasms, remedy browser)
let BN = null;     // assets/data/acutes.bn.json (bangla remedy detail — primary source)

async function loadData() {
  try {
    const [dataResp, bnResp] = await Promise.all([
      fetch('assets/data/acutes.json'),
      fetch('assets/data/acutes.bn.json'),
      window.RemedyStore ? RemedyStore.load() : Promise.resolve()
    ]);
    DATA = await dataResp.json();
    BN = bnResp.ok ? await bnResp.json() : null;
    if (BN) indexBanglaRemedies(BN);
    indexDataRemedies(DATA.remedies);
    renderAll();
  } catch (e) {
    console.error('Could not load TOA data', e);
  }
}

// ===== Render All =====
function renderAll() {
  renderTheory();
  renderHering();
  renderRemedyBrowser();
  initFlowWizard();
  renderFlowChartTree();
}

// ===== Theory Panel =====
function renderTheory() {
  document.getElementById('overviewIntro').textContent = DATA.overview.intro_bn;
  document.getElementById('overviewCore').textContent = DATA.overview.core_concept_bn;
  document.getElementById('overviewOldVsNew').textContent = DATA.overview.old_vs_new_concept_bn;

  // Axes
  const axesGrid = document.getElementById('axesGrid');
  DATA.acute_axis.axes.forEach(axis => {
    const div = document.createElement('div');
    div.className = 'axis-card';
    div.innerHTML = `<h4>${axis.name_bn}</h4><p>${axis.question_bn}</p>
      <div class="axis-option-list">${axis.options.map(o => `<span class="axis-opt">${o.label_bn}</span>`).join('')}</div>`;
    axesGrid.appendChild(div);
  });

  // Principles
  const principlesList = document.getElementById('principlesList');
  DATA.cardinal_principles.principles_bn.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'principle-card';
    div.innerHTML = `<div class="principle-num">${i+1}</div><div><h4>${p.name_bn}</h4><p>${p.desc_bn}</p></div>`;
    principlesList.appendChild(div);
  });

  // Golden Rules
  const goldenList = document.getElementById('goldenRulesList');
  DATA.golden_rules.rules_bn.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    goldenList.appendChild(li);
  });

  // Hints
  const hintsList = document.getElementById('hintsList');
  DATA.helpful_hints.hints_bn.forEach(h => {
    const li = document.createElement('li');
    li.textContent = h;
    hintsList.appendChild(li);
  });

  // Miasms
  const miasmGrid = document.getElementById('miasmGrid');
  const miasmColors = { psora: 'success', sycosis: 'toa-amber', syphilis: 'toa-rose' };
  const miasmClass = ['miasm-psora', 'miasm-sycosis', 'miasm-syphilis'];
  DATA.miasms.levels_bn.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = `miasm-card ${miasmClass[i]}`;
    div.innerHTML = `<h4>${m.name_bn}</h4><p style="font-size:0.875rem;color:var(--text-muted);line-height:1.5;margin-top:0.25rem;">${m.desc_bn}</p>`;
    miasmGrid.appendChild(div);
  });
}

// ===== Hering Panel =====
function renderHering() {
  document.getElementById('heringDesc').textContent = DATA.herings_law.desc_bn;
  document.getElementById('suppressionWarning').textContent = DATA.herings_law.suppression_warning_bn;
  document.getElementById('acuteCureSequence').textContent = DATA.herings_law.acute_cure_sequence_bn;

  const icons = ['bx-arrow-from-top', 'bx-export', 'bx-sort-down', 'bx-revision'];
  const rulesList = document.getElementById('heringRulesList');
  DATA.herings_law.rules_bn.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'hering-item';
    div.innerHTML = `<i class="bx ${icons[i] || 'bx-check'}"></i><div><h4>${r.name_bn}</h4><p>${r.desc_bn}</p></div>`;
    rulesList.appendChild(div);
  });

  document.getElementById('disclaimerText').textContent = DATA.disclaimer_bn;
}

// ===== Remedy Browser =====
function renderRemedyBrowser(filterActivity = null, filterThermal = null, filterThirst = null) {
  const container = document.getElementById('remedyBrowserList');
  container.innerHTML = '';
  const remedies = DATA.remedies.filter(r => {
    if (filterActivity && r.activity !== filterActivity) return false;
    if (filterThermal && r.thermal !== filterThermal) return false;
    if (filterThirst && r.thirst !== filterThirst) return false;
    return true;
  });
  remedies.forEach(r => {
    const div = document.createElement('div');
    div.className = 'remedy-browser-card';
    const actLabel = { increase: 'কার্যকলাপ বৃদ্ধি', decrease: 'কার্যকলাপ হ্রাস', no_change: 'অপরিবর্তিত' };
    const actClass = { increase: 'tag-activity-inc', decrease: 'tag-activity-dec', no_change: 'tag-activity-nc' };
    div.innerHTML = `
      <div class="rbc-header" role="button" tabindex="0" aria-expanded="false" onclick="toggleRBC(this)">
        <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
          <span class="rbc-abbr">${r.abbr}</span>
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:0.9375rem;color:var(--text);">${r.name_bn}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">${r.name_en}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <div class="tag-group" style="margin:0;">
            <span class="tag ${actClass[r.activity]}">${actLabel[r.activity]}</span>
            <span class="tag ${r.thermal === 'hot' ? 'tag-hot' : 'tag-chilly'}">${r.thermal === 'hot' ? 'গরম' : 'শীতার্ত'}</span>
            <span class="tag ${r.thirst === 'thirsty' ? 'tag-thirsty' : 'tag-thirstless'}">${r.thirst === 'thirsty' ? 'তৃষ্ণার্ত' : 'তৃষ্ণাহীন'}</span>
          </div>
          <i class='bx bx-chevron-down expand-icon' style="color:var(--text-muted);font-size:1.25rem;"></i>
        </div>
      </div>
      <div class="rbc-body">
        <p style="font-size:0.875rem;color:var(--text-muted);margin-top:1rem;margin-bottom:0.75rem;font-style:italic;">${r.short_bn}</p>
        <p style="font-size:0.9375rem;line-height:1.65;color:var(--text);margin-bottom:1rem;">${r.indication_bn}</p>
        <div class="detail-section">
          <h5>মূল চাবিকাঠি</h5>
          <ul class="keynote-list">${r.keynotes_bn.map(k => `<li>${k}</li>`).join('')}</ul>
        </div>
        <div class="mod-grid" style="margin-top:1rem;">
          <div class="mod-block mod-agg">
            <strong>বৃদ্ধি কারণ</strong>
            <ul>${r.aggravation_bn.map(a => `<li>${a}</li>`).join('')}</ul>
          </div>
          <div class="mod-block mod-amel">
            <strong>উপশম কারণ</strong>
            <ul>${r.amelioration_bn.map(a => `<li>${a}</li>`).join('')}</ul>
          </div>
        </div>
        <div class="potency-box"><i class='bx bx-injection'></i>${r.potency_bn}</div>
      </div>
    `;
    const header = div.querySelector('.rbc-header');
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRBC(header); }
    });
    container.appendChild(div);
  });
}

function toggleRBC(header) {
  const card = header.closest('.remedy-browser-card');
  const body = card.querySelector('.rbc-body');
  const icon = card.querySelector('.expand-icon');
  const isOpen = body.classList.contains('open');
  document.querySelectorAll('.rbc-body.open').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.rbc-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.expand-icon').forEach(ic => ic.style.transform = '');
  if (!isOpen) {
    body.classList.add('open');
    header.setAttribute('aria-expanded', 'true');
    icon.style.transform = 'rotate(180deg)';
  }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    const fa = btn.dataset.filterActivity || null;
    const ft = btn.dataset.filterThermal || null;
    const fth = btn.dataset.filterThirst || null;
    if (btn.dataset.filter === 'all') {
      renderRemedyBrowser();
    } else {
      renderRemedyBrowser(fa, ft, fth);
    }
  });
});

// ===== Flow Chart of Acutes (transcribed from Dr. Prafull Vijayakar's original chart) =====
// R(chart number, catalog id) — names resolve lazily so FLOW can be declared
// before the catalog fetch finishes.
function R(n, id) {
  return {
    n: n, id: id,
    get en() { const rx = window.RemedyStore && RemedyStore.get(id); return rx ? rx.name : id; },
    get bn() { const rx = window.RemedyStore && RemedyStore.get(id); return rx ? (rx.bangla || rx.name) : id; },
    get ab() { const rx = window.RemedyStore && RemedyStore.get(id); return rx ? (rx.abbr_display || rx.abbr) : id; }
  };
}

// western digits -> bangla digits
function bnNum(v) { return String(v).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]); }

const T_HOT     = { key: 'hot',        bn: 'গরম',        en: 'Hot',        icon: '☀️', desc: 'একই পরিবেশে অন্যদের চেয়ে গরম বেশি লাগে, ঢাকা/কম্বল সরিয়ে ফেলে, ঠান্ডা বাতাস চায়' };
const T_CHILLY  = { key: 'chilly',     bn: 'শীতার্ত',     en: 'Chilly',     icon: '🌙', desc: 'ঠান্ডা লাগে, গায়ে কাপড়/কম্বল জড়ায়, গরমে আরাম পায়' };
const TH_THIRSTY   = { key: 'thirsty',   bn: 'তৃষ্ণার্ত',  en: 'Thirsty',    icon: '💧', desc: 'স্বাভাবিকের চেয়ে বেশি পানি পান করে' };
const TH_THIRSTLESS= { key: 'thirstless',bn: 'তৃষ্ণাহীন', en: 'Thirstless', icon: '🚫', desc: 'জ্বর থাকা সত্ত্বেও পানি পানের ইচ্ছা কমে গেছে' };

const Q_THERMAL = 'ধাপ · তাপমাত্রা (Thermal)';
const H_THERMAL = 'একই পরিবেশে অন্যদের তুলনায় রোগীর গরম নাকি ঠান্ডা বেশি লাগছে? স্বাভাবিক অবস্থার তুলনায় পরিবর্তন দেখুন।';
const Q_THIRST  = 'ধাপ · তৃষ্ণা (Thirst)';
const H_THIRST  = 'স্বাভাবিকের তুলনায় পানি পান বেড়েছে নাকি কমেছে? পরিমাণ ও চুমুকের ধরন — দুটোই লক্ষ্য করুন।';

// thermal node with a thirst split beneath it
function thermal2(base, thirstless, thirsty) {
  return Object.assign({}, base, {
    q: Q_THIRST, hint: H_THIRST,
    children: [
      Object.assign({}, TH_THIRSTLESS, { remedies: thirstless }),
      Object.assign({}, TH_THIRSTY,    { remedies: thirsty })
    ]
  });
}

const FLOW = {
  q: 'ধাপ ১ · কার্যকলাপ (Activity)',
  hint: 'অসুস্থ হওয়ার পর রোগীর কার্যকলাপ স্বাভাবিকের তুলনায় কেমন? — সরাসরি প্রশ্ন করবেন না, পর্যবেক্ষণ করুন (শিশুর ক্ষেত্রে মায়ের কাছে জানুন)।',
  children: [
    // ---------------- DECREASED ----------------
    {
      key: 'decreased', bn: 'কার্যকলাপ হ্রাস পেয়েছে', en: 'Decreased', icon: '😴',
      desc: 'নিস্তেজ, নিষ্ক্রিয় — শুয়ে থাকে বা ঘুমিয়ে পড়ে',
      q: 'ধাপ ২ · হ্রাসের ধরন', hint: 'ঘুম কি রোগীকে কাবু করে ফেলেছে, নাকি জেগে থেকেও নিস্তেজ?',
      children: [
        {
          key: 'sleep', bn: 'ঘুম প্রবল', en: 'Sleep Overpowering', icon: '🛌',
          desc: 'ঘুমে আচ্ছন্ন, জাগিয়ে রাখা যায় না — তাপমাত্রা/তৃষ্ণা বিভাজন নেই',
          remedies: [
            R(1, 'op'),
            R(2, 'ant-t'),
            R(3, 'nux-m')
          ]
        },
        {
          key: 'dullness', bn: 'নিস্তেজতা', en: 'Dullness', icon: '😶',
          desc: 'জেগে আছে কিন্তু নিস্তেজ — কিছুই করে না, শুধু শুয়ে থাকে',
          q: Q_THERMAL, hint: H_THERMAL,
          children: [
            thermal2(T_CHILLY,
              [ R(4, 'sep'),
                R(5, 'gels'),
                R(6, 'ph-ac'),
                R(7, 'ign'),
                R(8, 'staph'),
                R(9, 'ip'),
                R(10, 'nat-c'),
                R(11, 'chin') ],
              [ R(12, 'nux-v'),
                R(13, 'eup-per'),
                R(14, 'phos'),
                R(15, 'calc'),
                R(16, 'bell'),
                R(17, 'chin'),
                R(18, 'sil'),
                R(19, 'hyos') ]),
            thermal2(T_HOT,
              [ R(20, 'puls'),
                R(21, 'bry'),
                R(22, 'apis'),
                R(23, 'lach'),
                R(24, 'sulph'),
                R(25, 'lyc'),
                R(26, 'thuj'),
                R(27, 'op'),
                R(28, 'carb-v') ],
              [ R(29, 'bry'),
                R(30, 'nat-m'),
                R(31, 'sulph'),
                R(32, 'lyc'),
                R(33, 'apis'),
                R(34, 'merc') ])
          ]
        }
      ]
    },

    // ---------------- INCREASED ----------------
    {
      key: 'increased', bn: 'কার্যকলাপ বৃদ্ধি পেয়েছে', en: 'Increased', icon: '🏃',
      desc: 'অস্থির, ছটফট করে, বেশি কথা বলে — স্থির থাকতে পারে না',
      q: 'ধাপ ২ · বৃদ্ধির ধরন', hint: 'অস্থিরতা কি শরীরে, নাকি মনে (উদ্বেগ), নাকি কথায় প্রকাশ পাচ্ছে?',
      children: [
        {
          key: 'physical', bn: 'শারীরিক অস্থিরতা', en: 'Physical Restlessness', icon: '🌀',
          desc: 'শরীর ছটফট করে, বারবার অবস্থান বদলায় — মানসিক উদ্বেগ নেই',
          q: Q_THERMAL, hint: H_THERMAL + ' (এই শাখায় তৃষ্ণার বিভাজন নেই)',
          children: [
            Object.assign({}, T_CHILLY, { remedies: [
              R(35, 'rhus-t'),
              R(35, 'tarent')
            ]}),
            Object.assign({}, T_HOT, { remedies: [
              R(36, 'kali-s'),
              R(37, 'merc'),
              R(38, 'tarent')
            ]})
          ]
        },
        {
          key: 'mental', bn: 'মানসিক উদ্বেগ', en: 'Mental Anxiety', icon: '😰',
          desc: 'ভয়, উদ্বেগ, দুশ্চিন্তা — মনের অস্থিরতা প্রধান',
          q: Q_THERMAL, hint: H_THERMAL,
          children: [
            thermal2(T_CHILLY,
              [ R(39, 'ars'),
                R(40, 'cina'),
                R(41, 'chin') ],
              [ R(42, 'nux-v'),
                R(43, 'cham'),
                R(44, 'bar-c'),
                R(45, 'ferr'),
                R(46, 'ferr-p'),
                R(47, 'chin') ]),
            thermal2(T_HOT,
              [ R(48, 'puls'),
                R(49, 'sulph'),
                R(50, 'apis') ],
              [ R(51, 'tub'),
                R(52, 'merc'),
                R(53, 'op') ])
          ]
        },
        {
          key: 'verbal', bn: 'মৌখিক প্রকাশ (Verbal)', en: 'Verbal', icon: '🗣️',
          desc: 'কথার মাধ্যমে বৃদ্ধি — গান গায়, ছড়া বানায়, বা অতিরিক্ত বকবক করে',
          q: 'ধাপ ৩ · কথার ধরন', hint: 'রোগীর মুখ দিয়ে ঠিক কী বেরোচ্ছে — গান, ছড়া, নাকি একটানা বকবক?',
          children: [
            { key: 'sing', bn: 'গান গায়', en: 'Sings', icon: '🎵', desc: 'জ্বর/প্রলাপের মধ্যে গান গায়',
              remedies: [
                R(54, 'bell'),
                R(55, 'stram'),
                R(56, 'op'),
                R(57, 'verat')
              ]},
            { key: 'verses', bn: 'ছড়া/কবিতা বানায়', en: 'Makes Verses', icon: '📜', desc: 'ছন্দ মিলিয়ে কথা বলে, কবিতা রচনা করে',
              remedies: [
                R(58, 'cann-i'),
                R(59, 'lach'),
                R(60, 'coff'),
                R(61, 'ant-c'),
                R(62, 'nat-m')
              ]},
            { key: 'loquacity', bn: 'বাচালতা (Loquacity)', en: 'Loquacity', icon: '💬',
              desc: 'একটানা কথা বলে — কথার ধরন দেখে ওষুধ আলাদা হয়',
              q: 'ধাপ ৪ · বাচালতার ধরন', hint: 'কথা কীভাবে বলছে সেটাই নির্ণায়ক।',
              children: [
                { key: 'fast', bn: 'দ্রুত কথা বলে', en: 'Fast', icon: '⚡',
                  remedies: [ R(null, 'lach'), R(null, 'pyrog') ]},
                { key: 'irrational', bn: 'অযৌক্তিক কথা', en: 'Irrational', icon: '🌪️',
                  remedies: [ R(null, 'lach'), R(null, 'coff') ]},
                { key: 'business', bn: 'ব্যবসা/কাজের কথা', en: 'Business', icon: '💼',
                  remedies: [ R(null, 'bry') ]},
                { key: 'nonsense', bn: 'অর্থহীন বকবক', en: 'Nonsense', icon: '🎭',
                  remedies: [ R(null, 'arg-m') ]},
                { key: 'one_subject', bn: 'একই বিষয়ে কথা', en: 'One Subject', icon: '🔁',
                  remedies: [ R(null, 'arg-n'), R(null, 'cann-i'), R(null, 'stram') ]},
                { key: 'curses', bn: 'গালিগালাজ করে', en: 'Curses', icon: '🤬',
                  remedies: [ R(null, 'anac'), R(null, 'sanic'), R(null, 'hep'), R(null, 'nux-v'), R(null, 'tarent') ]}
              ]}
          ]
        }
      ]
    },

    // ---------------- NO CHANGE ----------------
    {
      key: 'no_change', bn: 'কোনো পরিবর্তন নেই', en: 'No Change', icon: '😐',
      desc: 'অসুস্থ হয়েও কার্যকলাপ আগের মতোই — অভিযোগ করে না, কাজ চালিয়ে যায়',
      remedies: [
        R(null, 'op'),
        R(null, 'nat-m'),
        R(null, 'sil')
      ]
    }
  ]
};

// ===== Remedy detail index (bangla json primary, data.json fallback) =====
const RX_INFO = {};
function rxKey(s) { return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, ''); }

function indexBanglaRemedies(node) {
  if (Array.isArray(node)) { node.forEach(indexBanglaRemedies); return; }
  if (!node || typeof node !== 'object') return;
  if (node['নাম'] && node['মূল_বৈশিষ্ট্য']) {
    const k = rxKey(node['নাম']);
    if (!RX_INFO[k]) {
      RX_INFO[k] = {
        icon: node['আইকন'] || '',
        key_feature: node['মূল_বৈশিষ্ট্য'],
        triangle: node['ত্রিভুজ'] || [],
        confirm: node['নিশ্চিতকরণ'] || ''
      };
    }
  }
  Object.keys(node).forEach(k => indexBanglaRemedies(node[k]));
}

function indexDataRemedies(list) {
  (list || []).forEach(r => {
    const k = rxKey(r.name_en);
    const info = RX_INFO[k] || (RX_INFO[k] = {});
    if (!info.key_feature) info.key_feature = r.short_bn;
    if (!info.triangle || !info.triangle.length) info.triangle = r.keynotes_bn || [];
    if (!info.confirm) info.confirm = r.indication_bn || '';
    info.aggravation = r.aggravation_bn || [];
    info.amelioration = r.amelioration_bn || [];
    info.potency = r.potency_bn || '';
  });
}

// name aliases so chart names resolve to the JSON entries
const RX_ALIAS = {
  chinacinchona: 'china', acidumphosphoricum: 'phosphoricumacidum',
  mercuriussolubilis: 'mercurius', thujaoccidentalis: 'thuja',
  anacardiumorientale: 'anacardium', tarentulahispanica: 'tarentula',
  heparsulphuris: 'heparsulphuriscalcareum', ipecacuanha: 'ipecac',
  bryoniaalba: 'bryonia', pulsatilla: 'pulsatillanigricans',
  gelsemium: 'gelsemiumsempervirens', ignatiaamara: 'ignatia',
  aconitumnapellus: 'aconitum'
};

// Chart remedies that neither JSON covers — short bangla keynotes so every branch has content
const RX_EXTRA = {
  'Nux Moschata':        { icon: '🌰', key_feature: 'অপ্রতিরোধ্য ঘুম, মুখ শুকিয়ে কাঠ অথচ তৃষ্ণা নেই, অজ্ঞানপ্রায় ভাব', triangle: ['ঘুমে আচ্ছন্ন — জাগানো যায় না', 'মুখ অত্যন্ত শুষ্ক, তবু পানি চায় না', 'স্মৃতিভ্রম, স্বপ্নের মতো ঘোর'], confirm: 'পেট ফাঁপা ও কোষ্ঠকাঠিন্যের সাথে ঘুমঘুম ভাব, ঠান্ডা-স্যাঁতসেঁতে আবহাওয়ায় বৃদ্ধি' },
  'Acidum Phosphoricum': { icon: '💧', key_feature: 'শোক বা অতিরিক্ত খাটুনির পর নিঃশব্দ নিস্তেজতা — উদাসীন কিন্তু বুদ্ধি অটুট', triangle: ['দুঃখ/শোকের পর ভেঙে পড়া', 'উদাসীন, উত্তর দিতে ইচ্ছা করে না', 'দুর্বলতা সত্ত্বেও মন পরিষ্কার'], confirm: 'দ্রুত বেড়ে ওঠা কিশোর, চুল পড়া, প্রচুর পরিমাণে সাদা প্রস্রাব; শীতার্ত ও তৃষ্ণাহীন' },
  'Staphysagria':        { icon: '🗝️', key_feature: 'চাপা রাগ ও অপমান গিলে ফেলা — ভেতরে ফুঁসছে, বাইরে শান্ত ও নিস্তেজ', triangle: ['অপমান/অন্যায় চেপে রাখা', 'রাগ প্রকাশ না করে কাঁপা', 'কাটা/ছেঁড়া ক্ষত ও অস্ত্রোপচারের পর'], confirm: 'স্পর্শে অতি সংবেদনশীল, ঠান্ডা লাগে, দাঁতে দ্রুত ক্ষয়' },
  'Natrum Carbonicum':   { icon: '🕯️', key_feature: 'রোদ-গরমে কাহিল, নিজেকে গুটিয়ে নেয় — নিস্তেজ, শীতার্ত ও তৃষ্ণাহীন', triangle: ['রোদে/গরমে থাকলে মাথাব্যথা ও দুর্বলতা', 'দুধ সহ্য হয় না — পেট খারাপ', 'একা থাকতে চায়, দূরত্ব রাখে'], confirm: 'সামান্য পরিশ্রমে ক্লান্তি, গোড়ালি মচকে যাওয়ার প্রবণতা' },
  'Thuja Occidentalis':  { icon: '🌲', key_feature: 'ভেতরে ভঙ্গুর ও লুকানো অনুভূতি — নিস্তেজ, গরম রোগী, তৃষ্ণাহীন', triangle: ['গোপন করার প্রবণতা, নিজেকে অসুন্দর মনে করা', 'আঁচিল/গোটা ও সাইকোটিক প্রবণতা', 'স্যাঁতসেঁতে আবহাওয়া ও টিকার পরে বৃদ্ধি'], confirm: 'শরীরের বাঁ পাশ আক্রান্ত, ঘাম মিষ্টি গন্ধযুক্ত, চা-এ বৃদ্ধি' },
  'Tarentula Hispanica': { icon: '🕷️', key_feature: 'তীব্র ছটফটানি — শুয়ে থাকতে পারে না, ছুটতে চায়, সংগীতে শান্ত হয়', triangle: ['অবিরাম নড়াচড়া ও তাড়াহুড়ো', 'সংগীত/ছন্দে উপশম', 'ধূর্ত, ভান করে, হঠাৎ রেগে জিনিস ছুড়ে মারে'], confirm: 'স্পর্শ ও আয়নার প্রতি সংবেদনশীলতা, নাচার মতো অস্থিরতা' },
  'Kali Sulphuricum':    { icon: '🟡', key_feature: 'হলদে আঠালো স্রাব সহ অস্থিরতা — গরম ঘরে খারাপ, খোলা বাতাসে ভালো', triangle: ['হলুদ, আঠালো স্রাব', 'গরম ঘরে বৃদ্ধি, ঠান্ডা খোলা বাতাসে উপশম', 'সন্ধ্যায় জ্বর ও ছটফটানি'], confirm: 'পালসেটিলার মতো গরম রোগী, তবে স্রাব হলুদ ও চটচটে' },
  'Cina':                { icon: '🐛', key_feature: 'শিশু খিটখিটে ও ছটফটে — ছুঁলে বা কোলে নিলে আরও রেগে যায়', triangle: ['কিছুই তাকে সন্তুষ্ট করে না, চাইলে ছুড়ে ফেলে', 'নাক-পায়ু চুলকায়, কৃমির লক্ষণ', 'ঘুমের মধ্যে দাঁত কিড়মিড় ও চিৎকার'], confirm: 'ক্ষুধা বেশি তবু শুকিয়ে যাচ্ছে, চোখের নিচে কালি; শীতার্ত' },
  'Baryta Carbonica':    { icon: '🧒', key_feature: 'ভীরু, লাজুক, অপরিণত — অচেনা লোক দেখলে লুকায়, শীতার্ত ও তৃষ্ণার্ত', triangle: ['শারীরিক ও মানসিক বিকাশে পিছিয়ে', 'অচেনা মানুষে ভীষণ লজ্জা/ভয়', 'বারবার টনসিল ফোলা ও গলা ব্যথা'], confirm: 'ঠান্ডায় সহজেই কাবু, ঘাড়ের গ্রন্থি ফোলা' },
  'Tuberculinum':        { icon: '🌫️', key_feature: 'অস্থির উদ্বিগ্ন — পরিবর্তন চায়, ভ্রমণের ইচ্ছা; জ্বর বারবার ফিরে আসে', triangle: ['একঘেয়েমি অসহ্য — বদল চাই', 'হঠাৎ রেগে ধ্বংসাত্মক আচরণ', 'বারবার সর্দি-কাশি, দ্রুত ওজন কমা'], confirm: 'পারিবারিক যক্ষ্মার ইতিহাস, ঠান্ডা খোলা বাতাস ভালো লাগে; গরম রোগী, তৃষ্ণার্ত' },
  'Cannabis Indica':     { icon: '🍃', key_feature: 'সময় ও দূরত্বের বোধ বিকৃত — অতিরঞ্জিত কল্পনা, ছড়া কেটে কথা বলে', triangle: ['সময় দীর্ঘ মনে হয়, দূরত্ব বেড়ে যায়', 'হাসি ও অট্টহাসির পালা', 'একই বিষয়ে ঘুরেফিরে কথা'], confirm: 'শরীর ভাসছে বা দ্বিখণ্ডিত মনে হওয়া, ভয়ংকর কল্পনার সাথে বাচালতা' },
  'Coffea Cruda':        { icon: '☕', key_feature: 'অতি সজাগ মন — ঘুম আসে না, ইন্দ্রিয় অতি তীক্ষ্ণ, অযৌক্তিক বকবক', triangle: ['মাথায় চিন্তার স্রোত — ঘুম আসে না', 'আনন্দ/সুসংবাদে অসুস্থ হয়ে পড়া', 'ব্যথা অসহনীয় মনে হয়'], confirm: 'শব্দ-গন্ধ-স্পর্শে অতি সংবেদনশীল, কফিতে বৃদ্ধি' },
  'Antimonium Crudum':   { icon: '🍽️', key_feature: 'জিভে পুরু সাদা প্রলেপ — খিটখিটে, তাকালে বা ছুঁলে রেগে যায়, ছড়া কাটে', triangle: ['জিভে দুধসাদা পুরু প্রলেপ', 'অতিভোজনের পর অসুস্থতা', 'ভাবপ্রবণ — চাঁদের আলোয়/প্রেমে কাতর'], confirm: 'গরম রোদে ও ঠান্ডা পানিতে গোসলে বৃদ্ধি, চামড়া ফাটা ও কড়া' },
  'Argentum Metallicum': { icon: '⚪', key_feature: 'অর্থহীন বকবক — কণ্ঠ ও কার্টিলেজের সমস্যা, সময় দ্রুত কাটে মনে হয়', triangle: ['অসংলগ্ন, অর্থহীন কথা বলে যায়', 'কণ্ঠস্বর ভাঙা — গায়ক/বক্তার স্বরভঙ্গ', 'জোড়া ও কার্টিলেজে ব্যথা'], confirm: 'দিনের বেলা বৃদ্ধি, মিষ্টি ও গন্ধযুক্ত স্রাব' },
  'Argentum Nitricum':   { icon: '⏱️', key_feature: 'তাড়াহুড়া ও প্রত্যাশার উদ্বেগ — একই দুশ্চিন্তার কথা বারবার বলে', triangle: ['আগাম উদ্বেগে পেট খারাপ/ডায়রিয়া', 'উঁচু জায়গা ও ভিড়ের ভয়', 'মিষ্টি ও লবণের তীব্র আকাঙ্ক্ষা'], confirm: 'গরম রোগী — বদ্ধ ঘরে অসহ্য, তাড়াহুড়ো করে সব করে' },
  'Anacardium Orientale':{ icon: '⚔️', key_feature: 'দুই সত্তার দ্বন্দ্ব — গালিগালাজ করে, নিষ্ঠুর আচরণ, আত্মবিশ্বাসহীন', triangle: ['ভালো-মন্দ দুই ইচ্ছার টানাপোড়েন', 'অভিশাপ ও গালি দেওয়ার তাড়না', 'খেলে সব উপসর্গে উপশম'], confirm: 'স্মৃতিভ্রম, শরীরে গোঁজা প্লাগের মতো অনুভূতি; শীতার্ত' },
  'Sanicula':            { icon: '🧂', key_feature: 'জেদি ও পরিবর্তনশীল শিশু — গালি দেয়, গোসলে ভয়, ঘাম দুর্গন্ধযুক্ত', triangle: ['ইচ্ছা মুহূর্তে বদলায় — চেয়ে নিয়ে ছুড়ে ফেলে', 'পানি/গোসলে তীব্র ভয়', 'পা ও মাথায় দুর্গন্ধযুক্ত ঘাম'], confirm: 'শুকনো চেহারা, খেলেও ওজন বাড়ে না; লবণের আকাঙ্ক্ষা' }
};

function rxInfo(en) {
  const k = rxKey(en);
  if (RX_INFO[k]) return RX_INFO[k];
  if (RX_EXTRA[en]) return RX_EXTRA[en];
  if (RX_ALIAS[k] && RX_INFO[RX_ALIAS[k]]) return RX_INFO[RX_ALIAS[k]];
  const alt = Object.keys(RX_ALIAS).find(a => RX_ALIAS[a] === k);
  if (alt && RX_INFO[alt]) return RX_INFO[alt];
  return null;
}

// ===== Flow wizard engine =====
let flowPath = [];     // array of chosen child nodes
let openRemedyIdx = 0;  // which remedy in the current leaf's list is open below

const AC_AXES = [
  { id: 'activity', bn: 'কার্যকলাপ', en: 'Activity' },
  { id: 'type',     bn: 'ধরন',       en: 'Type' },
  { id: 'thermal',  bn: 'তাপমাত্রা', en: 'Thermal' },
  { id: 'thirst',   bn: 'তৃষ্ণা',    en: 'Thirst' }
];

const AC_ICONS = {
  decreased: 'bx-trending-down', increased: 'bx-trending-up', no_change: 'bx-minus',
  sleep: 'bx-moon', dullness: 'bx-user',
  physical: 'bx-run', mental: 'bx-brain', verbal: 'bx-conversation',
  sing: 'bx-music', verses: 'bx-book', loquacity: 'bx-message-dots',
  fast: 'bx-timer', irrational: 'bx-shuffle', business: 'bx-briefcase',
  nonsense: 'bx-ghost', one_subject: 'bx-repeat', curses: 'bx-angry',
  hot: 'bx-sun', chilly: 'bx-wind',
  thirsty: 'bx-droplet', thirstless: 'bx-block'
};

function currentFlowNode() {
  return flowPath.length ? flowPath[flowPath.length - 1] : FLOW;
}

function axisOf(node) {
  const k = node && node.key;
  if (k === 'decreased' || k === 'increased' || k === 'no_change') return 'activity';
  if (k === 'hot' || k === 'chilly') return 'thermal';
  if (k === 'thirsty' || k === 'thirstless') return 'thirst';
  if (k) return 'type';
  return 'activity';
}

function currentAxisId() {
  const node = currentFlowNode();
  if (node.remedies) return null;
  const kids = node.children || [];
  if (kids.some(c => c.key === 'hot' || c.key === 'chilly')) return 'thermal';
  if (kids.some(c => c.key === 'thirsty' || c.key === 'thirstless')) return 'thirst';
  if (!flowPath.length) return 'activity';
  return 'type';
}

function optIcon(node) {
  return AC_ICONS[node && node.key] || 'bx-right-arrow-alt';
}

function displayQ(q) {
  return String(q || '').replace(/^ধাপ(?:\s*[০-৯0-9]+)?\s*·\s*/, '');
}

function pickOpt(i) {
  const opts = currentFlowNode().children || [];
  if (!opts[i]) return;
  flowPath = flowPath.concat([opts[i]]);
  renderFlow();
}

function renderFlow() {
  document.getElementById('flowBack').disabled = flowPath.length === 0;
  updateTopbarChip();
  const leaf = !!(currentFlowNode().remedies);
  document.getElementById('acWorkspace').classList.toggle('is-leaf', leaf);
  document.getElementById('acResultJump').hidden = !leaf;
  renderProgress();
  renderSteps();
  openRemedyIdx = 0;
  renderRightAndBottom();
}

function renderProgress() {
  const progress = document.getElementById('acProgress');
  if (!progress) return;
  const axis = AC_AXES.find(a => a.id === currentAxisId());
  progress.textContent = currentFlowNode().remedies
    ? 'ওষুধের ফলাফল'
    : `ধাপ ${bnNum(flowPath.length + 1)}${axis ? ` · ${axis.bn}` : ''}`;
}

// Each column represents a decision in the actual path, not a fixed clinical
// axis: some branches end early, while others have several subtype decisions.
function renderSteps() {
  const host = document.getElementById('acSteps');
  let node = FLOW;
  const columns = [];
  for (let step = 0; step < 4; step++) {
    const available = node && node.children;
    const choice = flowPath[step];
    const active = !!available && step === flowPath.length;
    const title = available ? displayQ(node.q) : '';
    const options = available ? available.map((opt, index) => `
      <button type="button" class="ac-step-option ${choice === opt ? 'selected' : ''}"
              data-step="${step}" data-opt="${index}" aria-pressed="${choice === opt}">
        <span class="ac-step-option-icon"><i class="bx ${optIcon(opt)}" aria-hidden="true"></i></span>
        <span class="ac-step-option-text"><strong>${opt.bn}</strong>${opt.en ? `<small>${opt.en}</small>` : ''}${opt.desc ? `<span>${opt.desc}</span>` : ''}</span>
        ${choice === opt ? `<i class="bx bx-check ac-step-check" aria-hidden="true"></i>` : ''}
      </button>`).join('') : '';
    columns.push(`<section class="ac-step-column ${active ? 'is-current' : ''} ${choice ? 'is-complete' : ''} ${available ? 'is-available' : 'is-pending'}" aria-labelledby="acStepTitle${step}">
      <div class="ac-step-heading"><span id="acStepTitle${step}">ধাপ ${bnNum(step + 1)}</span>${title ? `<strong>${title}</strong>` : ''}${choice ? `<span class="ac-step-chosen"><i class="bx bx-check-circle" aria-hidden="true"></i> ${choice.bn}</span><button type="button" class="ac-step-edit" aria-expanded="false" aria-controls="acStepBody${step}" aria-label="ধাপ ${bnNum(step + 1)} পরিবর্তন করুন">পরিবর্তন</button>` : ''}</div>
      ${available ? `<div class="ac-step-body" id="acStepBody${step}"><div class="ac-step-options">${options}</div></div>` : ''}
    </section>`);
    node = choice || null;
  }
  host.innerHTML = columns.join('');
  host.querySelectorAll('.ac-step-edit').forEach(button => button.addEventListener('click', () => {
    const column = button.closest('.ac-step-column');
    const opening = !column.classList.contains('is-editing');
    host.querySelectorAll('.is-editing').forEach(other => {
      other.classList.remove('is-editing');
      other.querySelector('.ac-step-edit').setAttribute('aria-expanded', 'false');
    });
    column.classList.toggle('is-editing', opening);
    button.setAttribute('aria-expanded', String(opening));
  }));
  host.querySelectorAll('[data-step][data-opt]').forEach(button => button.addEventListener('click', event => {
    const step = Number(button.dataset.step);
    let parent = FLOW;
    for (let i = 0; i < step; i++) parent = flowPath[i];
    const selected = parent.children[Number(button.dataset.opt)];
    if (flowPath[step] === selected) {
      const column = button.closest('.ac-step-column');
      column.classList.remove('is-editing');
      const edit = column.querySelector('.ac-step-edit');
      if (edit) { edit.setAttribute('aria-expanded', 'false'); if (event.detail === 0) edit.focus(); }
      return;
    }
    flowPath = flowPath.slice(0, step).concat(selected);
    renderFlow();
    if (event.detail === 0) {
      const next = host.querySelector('.is-current .ac-step-option') ||
        (window.matchMedia('(max-width: 900px)').matches ? host.querySelectorAll('.ac-step-edit')[step] : null) ||
        host.querySelector(`[data-step="${step}"][data-opt="${button.dataset.opt}"]`);
      if (next) next.focus({ preventScroll: true });
    }
  }));
}

function onWizardKey(e) {
  if (!document.body.classList.contains('ac-fit')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const leaf = !!(currentFlowNode().remedies);
  if (!leaf) {
    let idx = -1;
    if (e.key >= '1' && e.key <= '9') idx = +e.key - 1;
    else idx = '১২৩৪৫৬৭৮৯'.indexOf(e.key);
    if (idx >= 0) {
      e.preventDefault();
      pickOpt(idx);
      return;
    }
  }
  if ((e.key === 'Escape' || e.key === 'Backspace') && flowPath.length) {
    e.preventDefault();
    flowPath.pop();
    renderFlow();
  }
}

// Right column: the current leaf's remedies (replaces a generic "analysis
// result" panel — this flow has no score, just a path to a remedy set).
function renderRightAndBottom() {
  const node = currentFlowNode();
  const scroll = document.getElementById('acRightScroll');
  const countEl = document.getElementById('acRightCount');
  const select = document.getElementById('acRemedySelect');

  if (!node.remedies) {
    const placeholder = document.createElement('option');
    placeholder.textContent = 'ধাপ সম্পূর্ণ হলে ওষুধ দেখাবে';
    select.replaceChildren(placeholder);
    select.disabled = true;
    countEl.textContent = '';
    scroll.innerHTML = `<div class="ac-placeholder"><span class="ac-skeleton-lines" aria-hidden="true"><i></i><i></i><i></i></span><p>ধাপ সম্পূর্ণ হলে সম্ভাব্য ওষুধ এখানে দেখাবে।</p></div>`;
    renderBottomEmpty();
    const toRx = document.getElementById('flowToRx');
    if (toRx) toRx.disabled = true;
    return;
  }

  countEl.textContent = `${bnNum(node.remedies.length)}টি ওষুধ`;
  select.disabled = false;
  select.replaceChildren(...node.remedies.map((r, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = `${r.bn} (${r.ab})`;
    option.selected = idx === openRemedyIdx;
    return option;
  }));
  select.onchange = () => {
    openRemedyIdx = Number(select.value);
    renderRightAndBottom();
    persistAcutePick(true);
  };
  scroll.innerHTML = node.remedies.map((r, idx) => {
    const info = rxInfo(r.en);
    return `<button type="button" class="ac-rx-row ${idx === openRemedyIdx ? 'open' : ''}" data-idx="${idx}" aria-pressed="${idx === openRemedyIdx}">
      <span class="ac-rx-no ${r.n ? '' : 'plain'}">${r.n != null ? bnNum(r.n) : (info && info.icon ? info.icon : '•')}</span>
      <span class="ac-rx-text">
        <span class="ac-rx-name">${r.bn} <span class="rx-abbr">${r.ab}</span></span>
        <span class="rx-en">${r.en}</span>
      </span>
    </button>`;
  }).join('');

  scroll.querySelectorAll('.ac-rx-row').forEach(el => {
    el.addEventListener('click', () => {
      openRemedyIdx = +el.dataset.idx;
      renderRightAndBottom();
      const active = scroll.querySelector(`[data-idx="${openRemedyIdx}"]`);
      if (active) active.focus({ preventScroll: true });
      persistAcutePick(true);
    });
  });

  renderBottomFor(node.remedies[openRemedyIdx]);
  persistAcutePick();
}

function persistAcutePick(force) {
  const node = currentFlowNode();
  const toRx = document.getElementById('flowToRx');
  if (!node.remedies || !node.remedies.length) {
    if (toRx) toRx.disabled = true;
    return;
  }
  const r = node.remedies[openRemedyIdx] || node.remedies[0];
  if (toRx) toRx.disabled = !r;
  if (!r || !window.Shell || !Shell.pickRemedy) return;
  const cur = Shell.bridge.get() || {};
  if (!force && cur.from && cur.from !== 'acutes' && cur.remedy && cur.remedy.name) return;
  Shell.pickRemedy({
    from: 'acutes',
    id: r.id,
    name: r.en,
    bangla: r.bn,
    abbr: r.ab,
    book: 'তীব্র রোগের তত্ত্ব',
    shortlist: node.remedies.slice(0, 8).map(x => ({
      id: x.id, name: x.en, bangla: x.bn, total: x.n || 0, abbr: x.ab
    }))
  });
}

function sendAcuteToRx() {
  persistAcutePick(true);
  const node = currentFlowNode();
  if (!node.remedies || !node.remedies.length) return;
  if (window.Shell && Shell.toast) Shell.toast('ঔষধ প্রেসক্রিপশনে পাঠানো হচ্ছে…', 'ok');
  location.href = 'prescription.html?from=acutes';
}

// Bottom-left: the open remedy's triangle (where Tempraz would put its
// radar). Bottom-right: the rest of its confirmation detail.
function renderBottomFor(r) {
  const info = rxInfo(r.en);
  const triHost = document.getElementById('acTriHost');
  const detailHost = document.getElementById('acDetailHost');
  document.getElementById('acDetailName').textContent = r.bn;
  const sub = document.getElementById('acDetailSub');
  if (sub) sub.textContent = `${r.en || ''}${r.n != null ? ' · চার্ট ' + bnNum(r.n) : ''}`;
  const abbr = document.getElementById('acDetailAbbr');
  if (abbr) abbr.textContent = r.ab || '—';

  const hasTriangle = !!(info && info.triangle && info.triangle.length === 3);
  triHost.innerHTML = hasTriangle
    ? triangleOnly(info.triangle)
    : (info && info.triangle && info.triangle.length
        ? `<ul class="tri-list">${info.triangle.map(t => `<li>${t}</li>`).join('')}</ul>`
        : `<div class="ac-empty"><p>এই ওষুধের ত্রিভুজ তথ্য নেই।</p></div>`);

  detailHost.innerHTML = info ? `
    ${info.key_feature ? `<div class="rx-key">${info.key_feature}</div>` : ''}
    ${info.confirm ? `<div class="rx-section">
        <div class="rx-label"><i class='bx bx-check-double'></i> নিশ্চিতকরণ <span class="rx-label-note">— মিলে গেলে ওষুধ চূড়ান্ত</span></div>
        <div class="rx-conf"><i class='bx bx-bulb'></i><span>${info.confirm}</span></div>
      </div>` : ''}
    ${info.aggravation && info.aggravation.length ? `
      <div class="mod-grid" style="margin-top:1.125rem;">
        <div class="mod-block mod-agg"><strong>বৃদ্ধি</strong><ul>${info.aggravation.map(a => `<li>${a}</li>`).join('')}</ul></div>
        <div class="mod-block mod-amel"><strong>উপশম</strong><ul>${(info.amelioration || []).map(a => `<li>${a}</li>`).join('')}</ul></div>
      </div>` : ''}
    ${info.potency ? `<div class="potency-box"><i class='bx bx-injection'></i>${info.potency}</div>` : ''}
  ` : `<p class="rx-nodata">এই ওষুধের বিস্তারিত এখনো ডেটাবেসে যোগ করা হয়নি — মেটেরিয়া মেডিকা দেখে মিলিয়ে নিন।</p>`;
}

function renderBottomEmpty() {
  document.getElementById('acTriHost').innerHTML = `<div class="ac-placeholder"><i class='bx bx-shape-triangle ac-placeholder-icon' aria-hidden="true"></i><p>ওষুধ বাছাই হলে লক্ষণগুলো এখানে দেখাবে।</p></div>`;
  document.getElementById('acDetailHost').innerHTML = `<div class="ac-placeholder"><span class="ac-skeleton-lines" aria-hidden="true"><i></i><i></i><i></i></span><p>নির্বাচিত ওষুধের বিবরণ এখানে দেখাবে।</p></div>`;
  document.getElementById('acDetailName').textContent = 'ওষুধ বাছাই হয়নি';
  const sub = document.getElementById('acDetailSub');
  if (sub) sub.textContent = 'ফলাফল এলে বিস্তারিত দেখুন';
  const abbr = document.getElementById('acDetailAbbr');
  if (abbr) abbr.textContent = '—';
}

function countRemedies(node) {
  if (node.remedies) return node.remedies.length;
  return (node.children || []).reduce((s, c) => s + countRemedies(c), 0);
}

// ত্রিভুজ — Vijayakar's three confirming points, drawn as an actual triangle.
// Just the diagram: the bottom-left panel supplies its own header/caption now
// that it's a dedicated column instead of something tucked inside a remedy
// card, but the inner classes (tri-dot/tri-svg/tri-txt) are unchanged so the
// pop-in-sequence + stroke-draw animation still applies exactly as before.
// Reveals point-by-point rather than all-at-once: dot ১ pops in, its symptom
// text follows, then the border draws across to dot ২ (text, then border to
// ৩), text, then the border closes back round to ১ — only then does the
// triangle's fill appear. Three separate <line> segments (not one polygon)
// so each edge can be timed to draw on its own, one after the other.
function triangleOnly(points) {
  return `<div class="tri">
    <div class="tri-grid">
      <div class="tri-cell apex"><div class="tri-txt tri-txt-1"><p>${points[0]}</p></div></div>
      <div class="tri-stage">
        <svg class="tri-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon class="tri-fill" points="50,6 93,94 7,94"/>
          <!-- pathLength normalises each line's dash-length units to 100
               regardless of its real geometry — without it, stroke-dasharray
               interacts badly with non-scaling-stroke under this viewBox's
               non-uniform stretch (preserveAspectRatio="none"), leaving a
               chunk of each "hidden" segment visibly drawn from frame one -->
          <line class="tri-seg tri-seg-1" x1="50" y1="6" x2="7" y2="94" pathLength="100"/>
          <line class="tri-seg tri-seg-2" x1="7" y1="94" x2="93" y2="94" pathLength="100"/>
          <line class="tri-seg tri-seg-3" x1="93" y1="94" x2="50" y2="6" pathLength="100"/>
        </svg>
        <span class="tri-dot d1">১</span>
        <span class="tri-dot d2">২</span>
        <span class="tri-dot d3">৩</span>
      </div>
      <div class="tri-cell left"><div class="tri-txt tri-txt-2"><p>${points[1]}</p></div></div>
      <div class="tri-cell right"><div class="tri-txt tri-txt-3"><p>${points[2]}</p></div></div>
    </div>
    <p class="tri-caption">তিন কোণের তিনটি লক্ষণ একসাথে মিলে গেলেই এই ওষুধ নিশ্চিত</p>
  </div>`;
}

function initTopbar() {
  if (typeof Shell === 'undefined') return;
  const btn = Shell.addAction(`<button class="tb-btn"><i class='bx bx-sitemap'></i><span class="tb-label">সম্পূর্ণ ফ্লো চার্ট</span></button>`);
  if (btn) btn.addEventListener('click', () => {
    location.hash = 'flow';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  updateTopbarChip();
}

function updateTopbarChip() {
  if (typeof Shell === 'undefined') return;
  const node = currentFlowNode();
  if (!flowPath.length) Shell.setChip('ধাপ ১ — কার্যকলাপ বাছুন', 'bx-run', true);
  else if (node.remedies) Shell.setChip(`${bnNum(node.remedies.length)}টি সম্ভাব্য ওষুধ`, 'bx-capsule');
  else Shell.setChip(flowPath.map(n => n.bn).join(' › '), 'bx-git-branch', true);
}

function initFlowWizard() {
  document.getElementById('flowBack').addEventListener('click', () => { flowPath.pop(); renderFlow(); });
  document.getElementById('flowRestart').addEventListener('click', () => { flowPath = []; renderFlow(); });
  const toRx = document.getElementById('flowToRx');
  if (toRx) toRx.addEventListener('click', sendAcuteToRx);
  document.getElementById('acResultJump').addEventListener('click', () => {
    document.getElementById('acResult').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'
    });
  });
  document.addEventListener('keydown', onWizardKey);
  renderFlow();
  initTopbar();
}

// ===== Static full flow chart =====
function renderFlowChartTree() {
  const root = document.getElementById('flowChartTree');
  // on phones only the top level starts open, so the chart stays scannable
  const compact = window.matchMedia('(max-width: 700px)').matches;
  root.innerHTML = FLOW.children.map(c => nodeHtml(c, 1)).join('');

  function title(node, lvl) {
    return `<span class="fc-title ${lvl === 1 ? 'lvl1' : ''}">${node.icon || ''} ${node.bn}
      <span style="font-weight:400;font-size:0.75rem;color:var(--text-muted);font-style:italic;">${node.en}</span>
      ${node.remedies ? `<span class="rc-count">${bnNum(node.remedies.length)}</span>` : ''}
    </span>`;
  }

  function nodeHtml(node, lvl) {
    const chips = node.remedies
      ? `<div class="fc-chips">${node.remedies.map(r =>
          `<span class="fc-chip">${r.n != null ? `<b>${bnNum(r.n)}</b>` : ''}${r.bn} <span style="color:var(--text-muted)">${r.ab}</span></span>`
        ).join('')}</div>`
      : '';
    if (!node.children) {
      return `<div class="fc-node">${title(node, lvl)}${chips}</div>`;
    }
    const open = (!compact || lvl === 1) ? ' open' : '';
    return `<details class="fc-node"${open}>
      <summary><i class='bx bx-chevron-right fc-caret'></i>${title(node, lvl)}</summary>
      ${chips}
      <div class="fc-branch">${node.children.map(c => nodeHtml(c, lvl + 1)).join('')}</div>
    </details>`;
  }

  const setAll = v => root.querySelectorAll('details.fc-node').forEach(d => d.open = v);
  document.getElementById('fcExpandAll').onclick = () => setAll(true);
  document.getElementById('fcCollapseAll').onclick = () => setAll(false);
}

// ===== Panels =====
// The five sections (wizard/flow/remedies/theory/hering) used to be an
// in-page tab bar; they now live in the sidebar as a submenu under "তীব্র
// রোগের তত্ত্ব" (see NAV in shell.js), so switching sections is a same-page
// hash change rather than a button click — activatePanel() is the one place
// that actually shows/hides a panel, callable from a hash or anything else.
function activatePanel(name) {
  document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');
  document.body.classList.toggle('ac-fit', name === 'wizard');
}

function openPanelFromHash() {
  const id = (location.hash || '').replace('#', '') || 'wizard';
  activatePanel(id);
}
window.addEventListener('hashchange', openPanelFromHash);

// ===== Init =====
loadData();
openPanelFromHash();
