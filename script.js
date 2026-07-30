(() => {
  'use strict';

  // State
  const TOTAL_STEPS = 9;
  let currentStep = 1;
  let complaintCount = 0;

  // DOM Elements
  const form = document.getElementById('caseForm');
  const formSteps = document.querySelectorAll('.form-step');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const resetBtn = document.getElementById('resetBtn');
  const generateBtn = document.getElementById('generateBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  const stepCounter = document.getElementById('stepCounter');
  const currentStepTitle = document.getElementById('currentStepTitle');
  const progressFill = document.getElementById('progressFill');
  const stepperContainer = document.getElementById('stepper');
  
  const genderSelect = document.getElementById('gender');
  const genderPanels = document.querySelectorAll('.gender-panel');
  const addComplaintBtn = document.getElementById('addComplaintBtn');
  const complaintsContainer = document.getElementById('complaintsContainer');
  const aiOutput = document.getElementById('aiOutput');

  // Initialization
  function init() {
    initStepNav();
    initChips();
    bindEvents();
    
    // Set default date
    const visitDate = document.querySelector('input[name="visitDate"]');
    if (visitDate && !visitDate.value) visitDate.valueAsDate = new Date();
    
    // Default 1 complaint
    if(complaintsContainer.children.length === 0) {
      addComplaint();
    }
    
    // Load Draft
    loadDraft();
    updateUI();
    updateGenderPanels();
  }

  // --- UI & Navigation ---
  function initStepNav() {
    document.querySelectorAll('.step-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const step = parseInt(tab.dataset.step);
        if (validateCurrentStep()) goToStep(step);
      });
    });
  }

  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;
    updateUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateUI() {
    // Show/Hide steps
    formSteps.forEach((s, idx) => {
      s.classList.toggle('active', (idx + 1) === currentStep);
    });

    // Update Header
    const activeStep = formSteps[currentStep - 1];
    stepCounter.textContent = `ধাপ ${currentStep} / ${TOTAL_STEPS}`;
    if (activeStep) {
      currentStepTitle.textContent = activeStep.getAttribute('data-step-title');
    }

    // Progress & Stepper
    progressFill.style.width = `${((currentStep - 1) / (TOTAL_STEPS - 1)) * 100}%`;
    
    document.querySelectorAll('.step-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', (idx + 1) === currentStep);
      tab.classList.toggle('completed', (idx + 1) < currentStep);
    });

    // Scroll active tab into view (smoothly)
    const activeTab = document.querySelector(`.step-tab[data-step="${currentStep}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Buttons
    prevBtn.style.display = currentStep > 1 ? 'block' : 'none';
    nextBtn.style.display = currentStep < TOTAL_STEPS ? 'block' : 'none';
    generateBtn.style.display = currentStep === TOTAL_STEPS ? 'inline-block' : 'none';
    copyBtn.style.display = currentStep === TOTAL_STEPS ? 'inline-block' : 'none';
    downloadBtn.style.display = currentStep === TOTAL_STEPS ? 'inline-block' : 'none';
  }

  function validateCurrentStep() {
    if (currentStep === 1) {
      const requiredInputs = formSteps[0].querySelectorAll('[required]');
      for (const input of requiredInputs) {
        if (!input.value.trim()) {
          input.reportValidity();
          return false;
        }
      }
    }
    return true;
  }

  function updateGenderPanels() {
    const val = genderSelect.value;
    genderPanels.forEach(panel => {
      if (panel.dataset.showFor === val) {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });
  }

  // --- Chips UI ---
  function initChips() {
    document.querySelectorAll('.chips').forEach(container => {
      const options = (container.dataset.options || '').split('|').filter(Boolean);
      const name = container.dataset.checks;
      
      options.forEach(opt => {
        const label = document.createElement('label');
        label.className = 'chip-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = name;
        checkbox.value = opt;
        
        const span = document.createElement('span');
        span.textContent = opt;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
        
        // Add active class toggle for styling
        checkbox.addEventListener('change', () => {
          label.classList.toggle('active', checkbox.checked);
          saveDraft();
        });
      });
    });
  }

  // --- Dynamic Complaints ---
  function addComplaint() {
    complaintCount++;
    const id = complaintCount;
    const div = document.createElement('div');
    div.className = 'sub-card complaint-item';
    div.id = `comp-${id}`;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h4 style="margin:0;color:var(--primary);">অভিযোগ ${id}</h4>
        ${id > 1 ? `<button type="button" class="btn ghost danger" onclick="window._removeComp(${id})" style="padding:4px 8px;font-size:12px;">সরান</button>` : ''}
      </div>
      <div class="grid two tight">
        <label class="field full"><span>সমস্যা</span><input name="comp_desc_${id}" placeholder="যেমন: তীব্র মাথা ব্যথা"></label>
        <label class="field"><span>সময়কাল</span><input name="comp_duration_${id}" placeholder="কতদিন ধরে"></label>
        <label class="field"><span>তীব্রতা</span><input name="comp_severity_${id}" placeholder="১-১০"></label>
      </div>
    `;
    complaintsContainer.appendChild(div);
  }
  window._removeComp = function(id) {
    const el = document.getElementById(`comp-${id}`);
    if (el) el.remove();
    saveDraft();
  };

  // --- Event Bindings ---
  function bindEvents() {
    nextBtn.addEventListener('click', () => { if (validateCurrentStep()) goToStep(currentStep + 1); });
    prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
    genderSelect.addEventListener('change', updateGenderPanels);
    addComplaintBtn.addEventListener('click', addComplaint);
    
    // Generate Report
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      generateReport();
    });
    
    // Copy
    copyBtn.addEventListener('click', async () => {
      const text = aiOutput.value;
      if(!text) return alert('আগে রিপোর্ট তৈরি করুন।');
      try {
        await navigator.clipboard.writeText(text);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'কপি হয়েছে!';
        setTimeout(() => copyBtn.textContent = originalText, 2000);
      } catch (err) {
        alert('কপি করতে সমস্যা হয়েছে।');
      }
    });

    // Download
    downloadBtn.addEventListener('click', () => {
      const text = aiOutput.value;
      if(!text) return alert('আগে রিপোর্ট তৈরি করুন।');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Case_Report_${document.querySelector('input[name="patientName"]').value || 'Patient'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Auto-save on change
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    resetBtn.addEventListener('click', () => {
      if(confirm('সব তথ্য মুছে যাবে। আপনি কি নিশ্চিত?')) {
        localStorage.removeItem('homeoCaseDraft');
        location.reload();
      }
    });
  }

  // --- Data Persistence (Auto-save) ---
  function saveDraft() {
    const data = new FormData(form);
    const obj = {};
    for (let [key, val] of data.entries()) {
      if (obj[key] !== undefined) {
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
        obj[key].push(val);
      } else {
        obj[key] = val;
      }
    }
    // save dynamic complaints count
    obj._complaintCount = complaintCount;
    localStorage.setItem('homeoCaseDraft', JSON.stringify(obj));
    
    const badge = document.getElementById('autosaveStatus');
    badge.textContent = 'সংরক্ষিত';
    badge.style.opacity = '1';
    setTimeout(() => badge.style.opacity = '0.5', 1000);
  }

  function loadDraft() {
    const saved = localStorage.getItem('homeoCaseDraft');
    if (!saved) return;
    try {
      const obj = JSON.parse(saved);
      
      // Restore dynamic complaints
      if (obj._complaintCount) {
        while (complaintCount < obj._complaintCount) {
          addComplaint();
        }
      }

      for (let key in obj) {
        if (key === '_complaintCount') continue;
        const val = obj[key];
        const inputs = form.querySelectorAll(`[name="${key}"]`);
        if (!inputs.length) continue;
        
        const type = inputs[0].type;
        if (type === 'checkbox' || type === 'radio') {
          const valArray = Array.isArray(val) ? val : [val];
          inputs.forEach(input => {
            if (valArray.includes(input.value)) {
              input.checked = true;
              // trigger change for chip active state
              input.dispatchEvent(new Event('change'));
            }
          });
        } else {
          inputs[0].value = val;
        }
      }
    } catch(e) {
      console.error('Draft load error', e);
    }
  }

  // --- Report Generation logic ---
  function getVal(name) {
    const el = document.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : '';
  }

  function getChecksArray(name) {
    const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`));
    return checked.map(el => el.value);
  }
  
  function getChecks(name) {
    return getChecksArray(name).join(', ');
  }

  function formatSection(title, content) {
    if (!content.trim()) return '';
    return `\n▌ ${title}\n────────────────────────────────────────\n${content}`;
  }

  function fieldItem(label, value) {
    if (!value) return '';
    return `  • ${label}: ${value}`;
  }

  function listGroup(label, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return '';
    let res = `  • ${label}:\n`;
    res += itemsArray.map(item => `    ◦ ${item}`).join('\n');
    return res;
  }
  
  function pushSection(out, title, lines) {
    const content = lines.filter(Boolean).join('\n');
    const rendered = formatSection(title, content);
    if (rendered) out.push(rendered);
  }

  function generateReport() {
    let out = [];
    
    out.push("═══════════════════════════════════════════════════");
    out.push("        হোমিওপ্যাথি কেস টেকিং রিপোর্ট");
    out.push("═══════════════════════════════════════════════════");
    
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('bn-BD', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
      hour: 'numeric', minute: 'numeric', hour12: true 
    }).format(now);
    out.push(`রিপোর্ট তৈরির সময়: ${dateStr}\n`);

    // AI Instruction
    out.push("┌─────────────────────────────────────────────────┐");
    out.push("│              এআই-র জন্য নির্দেশনা               │");
    out.push("└─────────────────────────────────────────────────┘");
    out.push(`আপনি একজন অভিজ্ঞ ক্লাসিক্যাল হোমিওপ্যাথি কেস-অ্যানালাইসিস`);
    out.push(`সহায়ক। নিচের কেসটি বিশ্লেষণ করুন। বিশ্লেষণে নিচের বিষয়গুলো`);
    out.push(`অন্তর্ভুক্ত করুন:\n`);
    out.push(`  ১. রোগীর নিরাপত্তাকে সর্বোচ্চ অগ্রাধিকার দিন।`);
    out.push(`  ২. প্রধান ও বৈশিষ্ট্যমূলক (characteristic) লক্ষণ বাছাই করুন।`);
    out.push(`  ৩. সম্ভাব্য Repertory Rubric সাজান।`);
    out.push(`  ৪. সম্ভাব্য ঔষধগুলোর তুলনামূলক বিশ্লেষণ দিন।`);
    out.push(`  ৫. Miasm / Constitutional প্রকৃতি বিবেচনা করুন।`);
    out.push(`  ৬. প্রয়োজনীয় Follow-up প্রশ্ন ও সতর্কতা উল্লেখ করুন।`);
    out.push(`  ৭. শক্তি, ডোজ ও পুনরাবৃত্তি প্রস্তাব হিসেবে দিন —`);
    out.push(`     চূড়ান্ত প্রেসক্রিপশন একজন যোগ্য চিকিৎসক নিশ্চিত করবেন।`);
    
    const aiNeeds = getChecks('aiNeeds');
    if (aiNeeds) {
        out.push(`\n  * অতিরিক্ত ফোকাস: ${aiNeeds}`);
    }
    const addInst = getVal('additionalInstruction');
    if(addInst) {
        out.push(`  * বিশেষ নির্দেশনা: ${addInst}`);
    }

    out.push(`\n━━━━━━━━━━━━━━ কেসের বিস্তারিত ━━━━━━━━━━━━━━`);

    // Patient Profile
    pushSection(out, "রোগীর পরিচিতি", [
      fieldItem('কেস নম্বর', getVal('caseNo')),
      fieldItem('তারিখ', getVal('visitDate')),
      fieldItem('পরামর্শের ধরন', getVal('visitType')),
      fieldItem('নাম', getVal('patientName')),
      fieldItem('বয়স', getVal('age')),
      fieldItem('লিঙ্গ', getVal('gender')),
      fieldItem('বৈবাহিক অবস্থা', getVal('maritalStatus')),
      fieldItem('পেশা', getVal('occupation')),
      fieldItem('ঠিকানা', getVal('address')),
      fieldItem('মোবাইল', getVal('mobile')),
      fieldItem('ওজন', getVal('weight')),
      fieldItem('উচ্চতা', getVal('height')),
      fieldItem('রক্তের গ্রুপ', getVal('bloodGroup')),
      fieldItem('প্রধান রোগের বিভাগ', getVal('mainCategory')),
      fieldItem('আগের রোগ নির্ণয়', getVal('previousDiagnosis')),
      fieldItem('সম্মতি', getVal('consent') ? 'রোগীর তথ্য কেস বিশ্লেষণের জন্য ব্যবহারের সম্মতি আছে' : '')
    ]);

    // Complaints
    let compList = [];
    let cIdx = 1;
    for(let i=1; i<=complaintCount; i++) {
      const d = getVal(`comp_desc_${i}`);
      const dur = getVal(`comp_duration_${i}`);
      const sev = getVal(`comp_severity_${i}`);
      if(d) {
        let compLine = `  ${cIdx}. ${d}`;
        let details = [];
        if(dur) details.push(`সময়কাল: ${dur}`);
        if(sev) details.push(`তীব্রতা: ${sev}`);
        if(details.length > 0) compLine += ` | ${details.join(' | ')}`;
        compList.push(compLine);
        cIdx++;
      }
    }
    if(getVal('priorityComplaint')) compList.push(fieldItem('সবচেয়ে কষ্টদায়ক', getVal('priorityComplaint')));
    if(getVal('caseGoal')) compList.push(fieldItem('চিকিৎসা লক্ষ্য', getVal('caseGoal')));
    
    if (compList.length > 0) {
        const rendered = formatSection("প্রধান অভিযোগ", compList.join('\n'));
        if (rendered) out.push(rendered);
    }

    // Present Illness
    let redFlags = getChecksArray('redFlags');
    pushSection(out, "বর্তমান রোগের বিবরণ", [
      fieldItem('ধারাবাহিক গল্প', getVal('illnessStory')),
      fieldItem('কীভাবে শুরু', getVal('onsetHow')),
      fieldItem('সম্ভাব্য কারণ', getVal('cause')),
      fieldItem('সমস্যার স্থান', getVal('exactLocation')),
      fieldItem('ব্যথা/অনুভূতির ধরন', getVal('sensation')),
      fieldItem('ছড়ায়', getVal('radiation')),
      fieldItem('স্থায়িত্ব', getVal('episodeDuration')),
      fieldItem('কতবার', getVal('episodeFrequency')),
      fieldItem('কখন বেশি', getVal('worseTime')),
      fieldItem('আনুষঙ্গিক লক্ষণ', getVal('concomitantSymptoms')),
      fieldItem('আগে/পরে', getVal('beforeAfterSymptoms')),
      fieldItem('রোগের ক্রম', getVal('diseaseProgress')),
      fieldItem('আগের চিকিৎসা', getVal('treatmentTaken')),
      fieldItem('ওষুধে প্রতিক্রিয়া', getVal('medicineReaction')),
      redFlags.length > 0 ? listGroup('জরুরি লক্ষণ', redFlags) : '',
      fieldItem('জরুরি নোট', getVal('redFlagNote'))
    ]);

    // Modalities
    pushSection(out, "Modalities (বৃদ্ধি / উপশম)", [
      listGroup('বৃদ্ধি হয় যখন', getChecksArray('worseModalities')),
      listGroup('কমে যখন', getChecksArray('betterModalities')),
      fieldItem('মন্তব্য', getVal('modalityNotes'))
    ]);

    // Mind
    pushSection(out, "মানসিক লক্ষণ", [
      listGroup('স্বভাব/আচরণ', getChecksArray('mindSymptoms')),
      listGroup('বিশেষ ভয়', getChecksArray('fearSymptoms')),
      fieldItem('মানসিক কারণ', getVal('mentalCause')),
      fieldItem('স্বভাবের পরিবর্তন', getVal('personalityChange'))
    ]);

    // Diet
    pushSection(out, "খাদ্যাভ্যাস", [
      fieldItem('ক্ষুধা', getVal('appetite')),
      fieldItem('পিপাসা', getVal('thirst')),
      fieldItem('দৈনিক পানি', getVal('waterAmount')),
      fieldItem('পানীয়ের তাপমাত্রা', getVal('drinkTemperature')),
      listGroup('পছন্দের খাবার', getChecksArray('cravings')),
      listGroup('অপছন্দের খাবার', getChecksArray('aversions')),
      listGroup('যে খাবারে বাড়ে', getChecksArray('foodAggravation')),
      fieldItem('খাদ্যাভ্যাসের মন্তব্য', getVal('foodNotes'))
    ]);

    // Digestion
    pushSection(out, "হজম ও পেট", [
      listGroup('উপসর্গ', getChecksArray('digestiveSymptoms')),
      fieldItem('মন্তব্য', getVal('digestionNotes'))
    ]);

    // Stool
    pushSection(out, "মল (Stool)", [
      fieldItem('দিনে কতবার', getVal('stoolFrequency')),
      fieldItem('রং', getVal('stoolColor')),
      fieldItem('গন্ধ', getVal('stoolSmell')),
      fieldItem('গঠন', getVal('stoolConsistency')),
      fieldItem('রক্ত', getVal('stoolBlood')),
      fieldItem('শ্লেষ্মা', getVal('stoolMucus')),
      fieldItem('কৃমি', getVal('stoolWorm')),
      fieldItem('বেগ/চাপ', getVal('stoolUrge')),
      fieldItem('ব্যথা/জ্বালা', getVal('stoolPain')),
      fieldItem('মন্তব্য', getVal('stoolNotes'))
    ]);

    // Urine
    pushSection(out, "প্রস্রাব (Urine)", [
      fieldItem('বারবার হয়', getVal('urineFrequency')),
      fieldItem('জ্বালা', getVal('urineBurning')),
      fieldItem('রং', getVal('urineColor')),
      fieldItem('গন্ধ', getVal('urineSmell')),
      fieldItem('রাতে কয়বার', getVal('urineNight')),
      fieldItem('ফোঁটা ফোঁটা', getVal('urineDripping')),
      fieldItem('ধরে রাখতে পারে', getVal('urineRetention')),
      fieldItem('হঠাৎ বেগ', getVal('urineUrgency')),
      fieldItem('ব্যথা', getVal('urinePain')),
      fieldItem('তলানি/বালু', getVal('urineSediment')),
      fieldItem('অনিচ্ছায় প্রস্রাব', getVal('urineIncontinence')),
      fieldItem('মন্তব্য', getVal('urineNotes'))
    ]);

    // Sleep
    pushSection(out, "ঘুম ও স্বপ্ন", [
      fieldItem('ঘুমের অবস্থা', getVal('sleepQuality')),
      listGroup('ঘুমের পজিশন', getChecksArray('sleepPosition')),
      listGroup('স্বপ্ন', getChecksArray('dreams')),
      fieldItem('মন্তব্য', getVal('sleepNotes'))
    ]);

    // Sweat & Thermal
    pushSection(out, "ঘাম ও তাপমাত্রা সহনশীলতা", [
      listGroup('ঘামের ধরন', getChecksArray('sweatSymptoms')),
      fieldItem('ঘামের মন্তব্য', getVal('sweatNotes')),
      listGroup('তাপমাত্রা সহনশীলতা', getChecksArray('thermalSymptoms')),
      fieldItem('তাপের মন্তব্য', getVal('thermalNotes'))
    ]);

    // Sexual / Gender / Child
    pushSection(out, "যৌন, নারী ও শিশু ইতিহাস", [
      listGroup('সাধারণ যৌন সমস্যা', getChecksArray('sexualGeneral')),
      fieldItem('যৌন মন্তব্য', getVal('sexualNotes')),
      listGroup('পুরুষ সমস্যা', getChecksArray('maleSymptoms')),
      fieldItem('পুরুষ মন্তব্য', getVal('maleNotes')),
      
      fieldItem('মহিলা প্রথম মাসিক', getVal('femaleMenarche')),
      fieldItem('মাসিক চক্র', getVal('femaleCycle')),
      fieldItem('মাসিকের স্থায়িত্ব', getVal('femaleDuration')),
      fieldItem('শেষ মাসিকের তারিখ', getVal('femaleLmp')),
      fieldItem('রক্তের পরিমাণ', getVal('femaleFlow')),
      fieldItem('রক্তের রং', getVal('femaleColor')),
      fieldItem('ব্যথা', getVal('femalePain')),
      fieldItem('জমাট', getVal('femaleClot')),
      fieldItem('সাদা স্রাব', getVal('femaleLeucorrhoea')),
      fieldItem('গর্ভাবস্থা', getVal('femalePregnancy')),
      fieldItem('প্রসব ইতিহাস', getVal('femaleDelivery')),
      fieldItem('গর্ভপাত/মৃত সন্তান', getVal('femaleMiscarriage')),
      fieldItem('মেনোপজ', getVal('femaleMenopause')),
      fieldItem('দুগ্ধদান', getVal('femaleLactation')),
      fieldItem('নারী রোগ/সমস্যা', getVal('femaleProblems')),
      fieldItem('মহিলা মন্তব্য', getVal('femaleNotes')),
      
      fieldItem('শিশু জন্ম ইতিহাস', getVal('childBirth')),
      fieldItem('শিশু বৃদ্ধি', getVal('childMilestone')),
      fieldItem('টিকা', getVal('childVaccination')),
      fieldItem('খাওয়ানো', getVal('childFeeding')),
      fieldItem('আচরণ', getVal('childBehavior')),
      fieldItem('বারবার সংক্রমণ', getVal('childInfection')),
      fieldItem('শিশু মন্তব্য', getVal('childNotes'))
    ]);

    // Skin
    pushSection(out, "ত্বকের সমস্যা", [
      listGroup('উপসর্গ', getChecksArray('skinSymptoms')),
      fieldItem('বিস্তারিত', getVal('skinNotes'))
    ]);

    // Past History
    pushSection(out, "অতীত ইতিহাস", [
      listGroup('রোগী যা ভুগেছেন', getChecksArray('pastHistory')),
      fieldItem('বিস্তারিত', getVal('pastHistoryDetails')),
      fieldItem('চাপা পড়া', getVal('suppressionHistory')),
      fieldItem('অ্যালার্জি', getVal('allergyHistory')),
      fieldItem('আসক্তি', getVal('addictionHistory'))
    ]);

    // Family
    pushSection(out, "পারিবারিক ইতিহাস", [
      listGroup('পরিবারে যা আছে', getChecksArray('familyHistory')),
      fieldItem('বিস্তারিত', getVal('familyHistoryDetails'))
    ]);

    // Current Meds
    pushSection(out, "বর্তমান ঔষধ", [
      fieldItem('এলোপ্যাথি', getVal('currentAllopathy')),
      fieldItem('হোমিওপ্যাথি', getVal('currentHomeopathy')),
      fieldItem('হারবাল/দেশি', getVal('currentHerbal')),
      fieldItem('সাপ্লিমেন্ট', getVal('currentSupplements')),
      fieldItem('পার্শ্বপ্রতিক্রিয়া', getVal('currentSideEffects'))
    ]);

    // Reports
    pushSection(out, "পরীক্ষার রিপোর্ট", [
      fieldItem('BP', getVal('bp')),
      fieldItem('Pulse', getVal('pulse')),
      fieldItem('Temp', getVal('temperature')),
      fieldItem('শ্বাসের হার', getVal('respiration')),
      fieldItem('SpO2', getVal('spo2')),
      fieldItem('Sugar', getVal('sugar')),
      fieldItem('Hemoglobin', getVal('hb')),
      fieldItem('রক্তের সাধারণ পরীক্ষা', getVal('cbc')),
      fieldItem('প্রস্রাব পরীক্ষা', getVal('urineReport')),
      fieldItem('X-Ray', getVal('xray')),
      fieldItem('USG', getVal('usg')),
      fieldItem('ECG', getVal('ecg')),
      fieldItem('Echo', getVal('echo')),
      fieldItem('CT/MRI', getVal('ctMri')),
      fieldItem('অন্যান্য', getVal('otherReports'))
    ]);

    // Doctor Obs
    pushSection(out, "চিকিৎসকের পর্যবেক্ষণ", [
      fieldItem('Tongue', getVal('tongue')),
      fieldItem('Face', getVal('face')),
      fieldItem('Odour', getVal('odour')),
      fieldItem('হাঁটা', getVal('walking')),
      fieldItem('Voice', getVal('voice')),
      fieldItem('ভঙ্গি', getVal('posture')),
      fieldItem('Appearance', getVal('appearance')),
      fieldItem('অতিরিক্ত পর্যবেক্ষণ', getVal('observationNotes')),
      fieldItem('বিশেষ অদ্ভুত লক্ষণ', getVal('peculiarSymptoms'))
    ]);
    
    // Doctor Notes
    pushSection(out, "চিকিৎসকের পর্যালোচনা", [
      fieldItem('রুব্রিক্স', [getVal('rubric1'), getVal('rubric2'), getVal('rubric3'), getVal('rubric4'), getVal('rubric5'), getVal('rubric6')].filter(Boolean).join(', ')),
      listGroup('সম্ভাব্য মায়াজম', getChecksArray('miasm')),
      fieldItem('গঠনগত ঔষধ', getVal('constitutionalRemedy')),
      fieldItem('আকস্মিক ঔষধ', getVal('acuteRemedy')),
      fieldItem('মধ্যবর্তী ঔষধ', getVal('intercurrent')),
      fieldItem('নোসোড', getVal('nosode')),
      fieldItem('বায়োকেমিক', getVal('biochemic')),
      fieldItem('ফুল-চিকিৎসা', getVal('flowerTherapy')),
      fieldItem('শক্তি', getVal('potency')),
      fieldItem('ডোজ', getVal('dose')),
      fieldItem('পুনরাবৃত্তি', getVal('repetition')),
      fieldItem('ফলোআপ', getVal('followUp')),
      fieldItem('খাদ্য/উপদেশ', getVal('dietAdvice'))
    ]);

    // Final AI section
    out.push(`\n═══════════════════════════════════════════════════`);
    out.push(`              বিশেষ বিশ্লেষণের অনুরোধ`);
    out.push(`═══════════════════════════════════════════════════`);
    out.push(`উপরের কেসটি ক্লাসিক্যাল হোমিওপ্যাথির নীতি অনুসরণ করে`);
    out.push(`নিচের কাঠামোতে বিশ্লেষণ করুন:\n`);
    out.push(`  ১. 🔍 প্রধান লক্ষণ নির্বাচন`);
    out.push(`     — কোন লক্ষণগুলো সবচেয়ে গুরুত্বপূর্ণ এবং কেন?`);
    out.push(`     — Strange, Rare & Peculiar (SRP) লক্ষণ আলাদা করুন。\n`);
    out.push(`  ২. 📖 সম্ভাব্য Repertory Rubrics`);
    out.push(`     — Kent / Synthesis থেকে উপযুক্ত Rubric প্রস্তাব করুন。\n`);
    out.push(`  ৩. 💊 সম্ভাব্য ঔষধের তুলনা`);
    out.push(`     — ১ম, ২য়, ৩য় সম্ভাব্য ঔষধ এবং পার্থক্য ব্যাখ্যা করুন।`);
    out.push(`     — প্রতিটির জন্য মিলে যাওয়া ও না মেলা লক্ষণ উল্লেখ করুন。\n`);
    out.push(`  ৪. 🧬 Miasm / Constitutional বিবেচনা`);
    out.push(`     — রোগীর প্রকৃতি ও Miasm নির্ণয় করুন。\n`);
    out.push(`  ৫. ⚗️ প্রস্তাবিত শক্তি, ডোজ ও পুনরাবৃত্তি`);
    out.push(`     — (এটি প্রস্তাব মাত্র; চিকিৎসক চূড়ান্ত করবেন।)\n`);
    out.push(`  ৬. 🥗 খাদ্য ও জীবনযাত্রার পরামর্শ`);
    out.push(`     — ওষুধের সাথে কী খাওয়া এড়াতে হবে?\n`);
    out.push(`  ৭. ⚠️ সতর্কতা ও রেড ফ্ল্যাগ`);
    out.push(`     — কোনো বিপজ্জনক লক্ষণ আছে কি যা তাৎক্ষণিক চিকিৎসা চায়?\n`);
    out.push(`  ৮. 🔄 Follow-up প্রশ্ন`);
    out.push(`     — কেস আরও স্পষ্ট করতে কী জানা দরকার?\n`);
    out.push(`─────────────────────────────────────────────────`);
    out.push(`⚕️ দ্রষ্টব্য: এই রিপোর্ট শুধুমাত্র সহায়তার জন্য।`);
    out.push(`   চূড়ান্ত প্রেসক্রিপশন একজন নিবন্ধিত হোমিওপ্যাথিক চিকিৎসক`);
    out.push(`   কর্তৃক রোগী পরীক্ষার পরে নিশ্চিত করতে হবে।`);
    out.push(`═══════════════════════════════════════════════════`);

    // Output
    const finalString = out.join('\n');
    aiOutput.value = finalString;
    goToStep(TOTAL_STEPS); // scroll to report output
  }

  // Go!
  init();
})();
