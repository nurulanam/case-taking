// ===== Load & Parse JSON =====
let DATA = null;   // assets/data/acutes.json  (theory, miasms, remedy browser)
let BN = null;     // assets/data/acutes.bn.json (bangla remedy detail — primary source)

async function loadData() {
  try {
    const [dataResp, bnResp] = await Promise.all([
      fetch('assets/data/acutes.json'),
      fetch('assets/data/acutes.bn.json')
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
    const actLabel = { increase: 'ক্রিয়া বৃদ্ধি', decrease: 'ক্রিয়া হ্রাস', no_change: 'অপরিবর্তিত' };
    const actClass = { increase: 'tag-activity-inc', decrease: 'tag-activity-dec', no_change: 'tag-activity-nc' };
    div.innerHTML = `
      <div class="rbc-header" onclick="toggleRBC(this)">
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
            <span class="tag ${r.thermal === 'hot' ? 'tag-hot' : 'tag-chilly'}">${r.thermal === 'hot' ? 'গরম' : 'ঠান্ডা'}</span>
            <span class="tag ${r.thirst === 'thirsty' ? 'tag-thirsty' : 'tag-thirstless'}">${r.thirst === 'thirsty' ? 'তৃষ্ণাযুক্ত' : 'তৃষ্ণাহীন'}</span>
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
    container.appendChild(div);
  });
}

function toggleRBC(header) {
  const card = header.closest('.remedy-browser-card');
  const body = card.querySelector('.rbc-body');
  const icon = card.querySelector('.expand-icon');
  const isOpen = body.classList.contains('open');
  document.querySelectorAll('.rbc-body.open').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.expand-icon').forEach(ic => ic.style.transform = '');
  if (!isOpen) {
    body.classList.add('open');
    icon.style.transform = 'rotate(180deg)';
  }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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
// R(chart number, english name, bangla name, abbreviation)
function R(n, en, bn, ab) { return { n: n, en: en, bn: bn, ab: ab }; }

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
            R(1, 'Opium', 'ওপিয়াম', 'Op.'),
            R(2, 'Antimonium Tartaricum', 'এন্টিমোনিয়াম টার্টারিকাম', 'Ant-t.'),
            R(3, 'Nux Moschata', 'নাক্স মসকেটা', 'Nux-m.')
          ]
        },
        {
          key: 'dullness', bn: 'নিস্তেজতা', en: 'Dullness', icon: '😶',
          desc: 'জেগে আছে কিন্তু নিস্তেজ — কিছুই করে না, শুধু শুয়ে থাকে',
          q: Q_THERMAL, hint: H_THERMAL,
          children: [
            thermal2(T_CHILLY,
              [ R(4, 'Sepia', 'সিপিয়া', 'Sep.'),
                R(5, 'Gelsemium', 'জেলসেমিয়াম', 'Gels.'),
                R(6, 'Acidum Phosphoricum', 'অ্যাসিডাম ফসফরিকাম', 'Ac-ph.'),
                R(7, 'Ignatia Amara', 'ইগনেশিয়া আমারা', 'Ign.'),
                R(8, 'Staphysagria', 'স্ট্যাফিসেগ্রিয়া', 'Staph.'),
                R(9, 'Ipecacuanha', 'আইপিকাকুয়ানহা', 'Ipec.'),
                R(10, 'Natrum Carbonicum', 'নেট্রাম কার্বনিকাম', 'Nat-c.'),
                R(11, 'China (Cinchona)', 'চায়না (সিনকোনা)', 'Chin.') ],
              [ R(12, 'Nux Vomica', 'নাক্স ভোমিকা', 'Nux-v.'),
                R(13, 'Eupatorium Perfoliatum', 'ইউপেটোরিয়াম পারফোলিয়াটাম', 'Eup-per.'),
                R(14, 'Phosphorus', 'ফসফরাস', 'Phos.'),
                R(15, 'Calcarea Carbonica', 'ক্যালকেরিয়া কার্বোনিকা', 'Calc.'),
                R(16, 'Belladonna', 'বেলাডোনা', 'Bell.'),
                R(17, 'China (Cinchona)', 'চায়না (সিনকোনা)', 'Chin.'),
                R(18, 'Silicea', 'সিলিসিয়া', 'Sil.'),
                R(19, 'Hyoscyamus Niger', 'হায়োসায়ামাস নাইজার', 'Hyos.') ]),
            thermal2(T_HOT,
              [ R(20, 'Pulsatilla', 'পালসেটিলা', 'Puls.'),
                R(21, 'Bryonia Alba', 'ব্রায়োনিয়া অ্যালবা', 'Bry.'),
                R(22, 'Apis Mellifica', 'এপিস মেলিফিকা', 'Apis.'),
                R(23, 'Lachesis Muta', 'ল্যাকেসিস মুটা', 'Lach.'),
                R(24, 'Sulphur', 'সালফার', 'Sulph.'),
                R(25, 'Lycopodium', 'লাইকোপোডিয়াম', 'Lyc.'),
                R(26, 'Thuja Occidentalis', 'থুজা অক্সিডেন্টালিস', 'Thuj.'),
                R(27, 'Opium', 'ওপিয়াম', 'Op.'),
                R(28, 'Carbo Vegetabilis', 'কার্বো ভেজিটেবিলিস', 'Carb-v.') ],
              [ R(29, 'Bryonia Alba', 'ব্রায়োনিয়া অ্যালবা', 'Bry.'),
                R(30, 'Natrum Muriaticum', 'নেট্রাম মিউরিয়াটিকাম', 'Nat-m.'),
                R(31, 'Sulphur', 'সালফার', 'Sulph.'),
                R(32, 'Lycopodium', 'লাইকোপোডিয়াম', 'Lyc.'),
                R(33, 'Apis Mellifica', 'এপিস মেলিফিকা', 'Apis.'),
                R(34, 'Mercurius Solubilis', 'মার্কিউরিয়াস সলুবিলিস', 'Merc.') ])
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
              R(35, 'Rhus Toxicodendron', 'রাস টক্সিকোডেন্ড্রন', 'Rhus-t.'),
              R(35, 'Tarentula Hispanica', 'ট্যারেন্টুলা হিসপানিকা', 'Tarent.')
            ]}),
            Object.assign({}, T_HOT, { remedies: [
              R(36, 'Kali Sulphuricum', 'কালি সালফিউরিকাম', 'Kali-s.'),
              R(37, 'Mercurius Solubilis', 'মার্কিউরিয়াস সলুবিলিস', 'Merc.'),
              R(38, 'Tarentula Hispanica', 'ট্যারেন্টুলা হিসপানিকা', 'Tarent.')
            ]})
          ]
        },
        {
          key: 'mental', bn: 'মানসিক উদ্বেগ', en: 'Mental Anxiety', icon: '😰',
          desc: 'ভয়, উদ্বেগ, দুশ্চিন্তা — মনের অস্থিরতা প্রধান',
          q: Q_THERMAL, hint: H_THERMAL,
          children: [
            thermal2(T_CHILLY,
              [ R(39, 'Arsenicum Album', 'আর্সেনিকাম অ্যালবাম', 'Ars.'),
                R(40, 'Cina', 'সিনা', 'Cina.'),
                R(41, 'China (Cinchona)', 'চায়না (সিনকোনা)', 'Chin.') ],
              [ R(42, 'Nux Vomica', 'নাক্স ভোমিকা', 'Nux-v.'),
                R(43, 'Chamomilla', 'ক্যামোমিলা', 'Cham.'),
                R(44, 'Baryta Carbonica', 'বেরাইটা কার্বোনিকা', 'Bar-c.'),
                R(45, 'Ferrum Metallicum', 'ফেরাম মেটালিকাম', 'Ferr.'),
                R(46, 'Ferrum Phosphoricum', 'ফেরাম ফসফরিকাম', 'Ferr-p.'),
                R(47, 'China (Cinchona)', 'চায়না (সিনকোনা)', 'Chin.') ]),
            thermal2(T_HOT,
              [ R(48, 'Pulsatilla', 'পালসেটিলা', 'Puls.'),
                R(49, 'Sulphur', 'সালফার', 'Sulph.'),
                R(50, 'Apis Mellifica', 'এপিস মেলিফিকা', 'Apis.') ],
              [ R(51, 'Tuberculinum', 'টিউবারকুলিনাম', 'Tub.'),
                R(52, 'Mercurius Solubilis', 'মার্কিউরিয়াস সলুবিলিস', 'Merc.'),
                R(53, 'Opium', 'ওপিয়াম', 'Op.') ])
          ]
        },
        {
          key: 'verbal', bn: 'মৌখিক প্রকাশ (Verbal)', en: 'Verbal', icon: '🗣️',
          desc: 'কথার মাধ্যমে বৃদ্ধি — গান গায়, ছড়া বানায়, বা অতিরিক্ত বকবক করে',
          q: 'ধাপ ৩ · কথার ধরন', hint: 'রোগীর মুখ দিয়ে ঠিক কী বেরোচ্ছে — গান, ছড়া, নাকি একটানা বকবক?',
          children: [
            { key: 'sing', bn: 'গান গায়', en: 'Sings', icon: '🎵', desc: 'জ্বর/প্রলাপের মধ্যে গান গায়',
              remedies: [
                R(54, 'Belladonna', 'বেলাডোনা', 'Bell.'),
                R(55, 'Stramonium', 'স্ট্র্যামোনিয়াম', 'Stram.'),
                R(56, 'Opium', 'ওপিয়াম', 'Op.'),
                R(57, 'Veratrum Album', 'ভেরাট্রাম অ্যালবাম', 'Verat.')
              ]},
            { key: 'verses', bn: 'ছড়া/কবিতা বানায়', en: 'Makes Verses', icon: '📜', desc: 'ছন্দ মিলিয়ে কথা বলে, কবিতা রচনা করে',
              remedies: [
                R(58, 'Cannabis Indica', 'ক্যানাবিস ইন্ডিকা', 'Cann-i.'),
                R(59, 'Lachesis Muta', 'ল্যাকেসিস মুটা', 'Lach.'),
                R(60, 'Coffea Cruda', 'কফিয়া ক্রুডা', 'Coff.'),
                R(61, 'Antimonium Crudum', 'এন্টিমোনিয়াম ক্রুডাম', 'Ant-c.'),
                R(62, 'Natrum Muriaticum', 'নেট্রাম মিউরিয়াটিকাম', 'Nat-m.')
              ]},
            { key: 'loquacity', bn: 'বাচালতা (Loquacity)', en: 'Loquacity', icon: '💬',
              desc: 'একটানা কথা বলে — কথার ধরন দেখে ওষুধ আলাদা হয়',
              q: 'ধাপ ৪ · বাচালতার ধরন', hint: 'কথা কীভাবে বলছে সেটাই নির্ণায়ক।',
              children: [
                { key: 'fast', bn: 'দ্রুত কথা বলে', en: 'Fast', icon: '⚡',
                  remedies: [ R(null, 'Lachesis Muta', 'ল্যাকেসিস মুটা', 'Lach.'), R(null, 'Pyrogenium', 'পাইরোজেনিয়াম', 'Pyrog.') ]},
                { key: 'irrational', bn: 'অযৌক্তিক কথা', en: 'Irrational', icon: '🌪️',
                  remedies: [ R(null, 'Lachesis Muta', 'ল্যাকেসিস মুটা', 'Lach.'), R(null, 'Coffea Cruda', 'কফিয়া ক্রুডা', 'Coff.') ]},
                { key: 'business', bn: 'ব্যবসা/কাজের কথা', en: 'Business', icon: '💼',
                  remedies: [ R(null, 'Bryonia Alba', 'ব্রায়োনিয়া অ্যালবা', 'Bry.') ]},
                { key: 'nonsense', bn: 'অর্থহীন বকবক', en: 'Nonsense', icon: '🎭',
                  remedies: [ R(null, 'Argentum Metallicum', 'আর্জেন্টাম মেটালিকাম', 'Arg-m.') ]},
                { key: 'one_subject', bn: 'একই বিষয়ে কথা', en: 'One Subject', icon: '🔁',
                  remedies: [ R(null, 'Argentum Nitricum', 'আর্জেন্টাম নাইট্রিকাম', 'Arg-n.'), R(null, 'Cannabis Indica', 'ক্যানাবিস ইন্ডিকা', 'Cann-i.'), R(null, 'Stramonium', 'স্ট্র্যামোনিয়াম', 'Stram.') ]},
                { key: 'curses', bn: 'গালিগালাজ করে', en: 'Curses', icon: '🤬',
                  remedies: [ R(null, 'Anacardium Orientale', 'অ্যানাকার্ডিয়াম', 'Anac.'), R(null, 'Sanicula', 'স্যানিকুলা', 'Sanic.'), R(null, 'Hepar Sulphuris', 'হিপার সালফিউরিস', 'Hep.'), R(null, 'Nux Vomica', 'নাক্স ভোমিকা', 'Nux-v.'), R(null, 'Tarentula Hispanica', 'ট্যারেন্টুলা হিসপানিকা', 'Tarent.') ]}
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
        R(null, 'Opium', 'ওপিয়াম', 'Op.'),
        R(null, 'Natrum Muriaticum', 'নেট্রাম মিউরিয়াটিকাম', 'Nat-m.'),
        R(null, 'Silicea', 'সিলিসিয়া', 'Sil.')
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
let flowPath = [];   // array of chosen child nodes

function currentFlowNode() {
  return flowPath.length ? flowPath[flowPath.length - 1] : FLOW;
}

// Restart a CSS animation on an already-mounted element — toggling `display`
// retriggers it automatically, but qView/rView often stay on-screen across a
// step (question → next question), so the class needs a forced reflow to
// replay rather than silently no-op on the second call.
function replayStepAnim(el) {
  el.classList.remove('flow-step-anim');
  void el.offsetWidth;
  el.classList.add('flow-step-anim');
}

function renderFlow() {
  const node = currentFlowNode();
  const qView = document.getElementById('flowQuestionView');
  const rView = document.getElementById('flowResultView');

  // Breadcrumbs
  const crumbs = document.getElementById('flowCrumbs');
  crumbs.innerHTML = flowPath.length
    ? `<span class="flow-crumb root"><i class='bx bx-sitemap'></i> কার্যকলাপ</span>` +
      flowPath.map((n, i) =>
        `<span class="flow-crumb-sep">›</span><span class="flow-crumb" data-depth="${i + 1}">${n.icon || ''} ${n.bn}</span>`
      ).join('')
    : '';
  crumbs.querySelectorAll('.flow-crumb[data-depth]').forEach(el => {
    el.addEventListener('click', () => { flowPath = flowPath.slice(0, +el.dataset.depth); renderFlow(); });
  });

  document.getElementById('flowBack').disabled = flowPath.length === 0;
  updateTopbarChip();

  if (node.remedies) {
    qView.style.display = 'none';
    rView.style.display = 'block';
    renderFlowResults(node);
    replayStepAnim(rView);
  } else {
    rView.style.display = 'none';
    qView.style.display = 'block';
    document.getElementById('flowStepBadge').textContent =
      flowPath.map(n => n.bn).join(' → ') || 'ফ্লো চার্টের শুরু';
    document.getElementById('flowQuestion').innerHTML = `<i class='bx bx-help-circle'></i> ${node.q}`;
    document.getElementById('flowHint').textContent = node.hint || '';

    const box = document.getElementById('flowOptions');
    box.innerHTML = '';
    node.children.forEach((child, i) => {
      const count = countRemedies(child);
      const el = document.createElement('div');
      el.className = 'radio-card';
      el.style.animationDelay = `${i * 0.05}s`;   // small cascade, option-by-option
      el.innerHTML = `
        <span class="rc-emoji">${child.icon || '•'}</span>
        <div class="radio-label">
          <strong>${child.bn}</strong> <span style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">${child.en}</span>
          ${child.desc ? `<br><span style="font-size:0.8125rem;color:var(--text-muted)">${child.desc}</span>` : ''}
        </div>
        <span class="rc-count">${bnNum(count)} ওষুধ</span>
        <i class='bx bx-chevron-right' style="color:var(--text-muted)"></i>`;
      el.addEventListener('click', () => { flowPath.push(child); renderFlow(); });
      box.appendChild(el);
    });
    replayStepAnim(qView);
  }
}

function countRemedies(node) {
  if (node.remedies) return node.remedies.length;
  return (node.children || []).reduce((s, c) => s + countRemedies(c), 0);
}

// ত্রিভুজ — Vijayakar's three confirming points, drawn as an actual triangle
function triangleHtml(points) {
  if (!points || !points.length) return '';
  if (points.length !== 3) {
    // no clean 3-point triangle in the source — show them as keynotes instead
    return `<div class="rx-section">
      <div class="rx-label"><i class='bx bx-key'></i> মূল চাবিকাঠি (Keynotes)
        <span class="rx-label-note">— যত বেশি মেলে, তত নিশ্চিত</span></div>
      <ul class="tri-list">${points.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
  }

  return `<div class="rx-section">
    <div class="rx-label"><i class='bx bx-shape-triangle'></i> ত্রিভুজ (Triangle)
      <span class="rx-label-note">— তিনটি বিন্দুই মিললে ওষুধ নিশ্চিত</span></div>
    <div class="tri">
      <div class="tri-grid">
        <div class="tri-cell apex"><div class="tri-txt"><p>${points[0]}</p></div></div>
        <div class="tri-stage">
          <svg class="tri-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,6 93,94 7,94"/>
          </svg>
          <span class="tri-dot d1">১</span>
          <span class="tri-dot d2">২</span>
          <span class="tri-dot d3">৩</span>
        </div>
        <div class="tri-cell left"><div class="tri-txt"><p>${points[1]}</p></div></div>
        <div class="tri-cell right"><div class="tri-txt"><p>${points[2]}</p></div></div>
      </div>
      <p class="tri-caption">তিন কোণের তিনটি লক্ষণ একসাথে মিলে গেলেই এই ওষুধ</p>
    </div>
  </div>`;
}

function renderFlowResults(node) {
  document.getElementById('flowResultCount').textContent = `${bnNum(node.remedies.length)}টি ওষুধ`;
  document.getElementById('flowResultNote').innerHTML =
    'চার্ট অনুযায়ী এই শাখার ওষুধ — নম্বরগুলো মূল ফ্লো চার্টের ক্রম (১–৬২)। ' +
    'যেকোনো ওষুধে ট্যাপ করলে তার <strong>ত্রিভুজ</strong> ও নিশ্চিতকরণ বিন্দু দেখা যাবে।';

  const list = document.getElementById('flowResults');
  list.innerHTML = '';
  node.remedies.forEach((r, idx) => {
    const info = rxInfo(r.en);
    const hasTriangle = !!(info && info.triangle && info.triangle.length === 3);
    const card = document.createElement('div');
    card.className = 'rx-card';
    card.style.animationDelay = `${Math.min(idx, 8) * 0.04}s`;   // capped so a long list doesn't crawl in
    card.innerHTML = `
      <div class="rx-head">
        <div class="rx-no ${r.n ? '' : 'plain'}">${r.n != null ? bnNum(r.n) : (info && info.icon ? info.icon : '•')}</div>
        <div style="flex:1;min-width:0;">
          <div class="rx-name">${r.bn} <span class="rx-abbr">${r.ab}</span></div>
          <div class="rx-en">${r.en}</div>
        </div>
        <span class="rx-toggle">${hasTriangle ? `<i class='bx bx-shape-triangle'></i><span class="rx-toggle-t">ত্রিভুজ</span>` : `<i class='bx bx-key'></i><span class="rx-toggle-t">চাবিকাঠি</span>`}</span>
        <i class='bx bx-chevron-down expand-icon' style="color:var(--text-muted);font-size:1.25rem;"></i>
      </div>
      <div class="rx-body">
        ${info ? `
          ${info.key_feature ? `<div class="rx-key">${info.key_feature}</div>` : ''}
          ${triangleHtml(info.triangle)}
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
        ` : `<p class="rx-nodata">এই ওষুধের বিস্তারিত এখনো ডেটাবেসে যোগ করা হয়নি — মেটেরিয়া মেডিকা দেখে মিলিয়ে নিন।</p>`}
      </div>`;
    card.querySelector('.rx-head').addEventListener('click', () => {
      const body = card.querySelector('.rx-body');
      const open = body.classList.contains('open');
      list.querySelectorAll('.rx-body.open').forEach(b => b.classList.remove('open'));
      list.querySelectorAll('.rx-card.open').forEach(c => c.classList.remove('open'));
      list.querySelectorAll('.expand-icon').forEach(i => i.style.transform = '');
      if (!open) {
        body.classList.add('open');
        card.classList.add('open');
        card.querySelector('.expand-icon').style.transform = 'rotate(180deg)';
      }
    });
    list.appendChild(card);
    if (idx === 0) card.querySelector('.rx-head').click();   // first remedy open by default
  });
}

function initTopbar() {
  if (typeof Shell === 'undefined') return;
  const btn = Shell.addAction(`<button class="tb-btn"><i class='bx bx-sitemap'></i><span class="tb-label">সম্পূর্ণ ফ্লো চার্ট</span></button>`);
  if (btn) btn.addEventListener('click', () => {
    document.querySelector('.page-tab-btn[data-panel="flow"]').click();
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

// ===== Page Tabs =====
document.querySelectorAll('.page-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.page-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panelId = `panel-${btn.dataset.panel}`;
    document.getElementById(panelId).classList.add('active');
  });
});

// ===== Deep links (sidebar reference items) =====
function openPanelFromHash() {
  const id = (location.hash || '').replace('#', '');
  if (!id) return;
  const btn = document.querySelector(`.page-tab-btn[data-panel="${id}"]`);
  if (btn) btn.click();
}
window.addEventListener('hashchange', openPanelFromHash);

// ===== Init =====
loadData();
openPanelFromHash();
