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

  function getChecks(name) {
    const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`));
    return checked.map(el => el.value).join(', ');
  }

  function section(title, items) {
    const validItems = items.filter(i => i.trim() !== '' && !i.endsWith(': '));
    if (validItems.length === 0) return '';
    return `\n## ${title}\n` + validItems.map(i => `- ${i}`).join('\n');
  }

  function field(label, name) {
    const v = getVal(name);
    return v ? `${label}: ${v}` : '';
  }

  function checkField(label, name) {
    const v = getChecks(name);
    return v ? `${label}: ${v}` : '';
  }

  function generateReport() {
    let out = [];
    
    out.push("হোমিওপ্যাথি কেস টেকিং রিপোর্ট");
    out.push(`রিপোর্ট তৈরির সময়: ${new Date().toLocaleString('bn-BD')}`);
    
    // AI Instruction
    const aiNeeds = getChecks('aiNeeds') || "লক্ষণ বিশ্লেষণ করে ঔষধ নির্বাচন করুন";
    const addInst = getVal('additionalInstruction');
    out.push(`\n**এআই-র জন্য নির্দেশনা:**`);
    out.push(`আপনি একজন অভিজ্ঞ হোমিওপ্যাথি কেস-অ্যানালাইসিস সহায়ক হিসেবে নিচের কেসটি বিশ্লেষণ করুন। রোগীর নিরাপত্তাকে অগ্রাধিকার দিন। প্রধান ও বৈশিষ্ট্যমূলক লক্ষণ বাছাই করুন, সম্ভাব্য রুব্রিক সাজান, সম্ভাব্য ঔষধগুলোর তুলনা দিন, মায়াজম/প্রকৃতি বিবেচনা করুন, প্রয়োজনীয় ফলোআপ প্রশ্ন ও সতর্কতা জানান।`);
    out.push(`বিশ্লেষণের লক্ষ্য: ${aiNeeds}`);
    if(addInst) out.push(`বিশেষ নির্দেশনা: ${addInst}`);

    // Patient Profile
    out.push(section("রোগীর পরিচিতি", [
      field('কেস নম্বর', 'caseNo'),
      field('তারিখ', 'visitDate'),
      field('ধরন', 'visitType'),
      field('নাম', 'patientName'),
      field('বয়স', 'age'),
      field('লিঙ্গ', 'gender'),
      field('পেশা', 'occupation'),
      field('বৈবাহিক অবস্থা', 'maritalStatus'),
      field('ঠিকানা', 'address'),
      field('ওজন', 'weight'),
      field('উচ্চতা', 'height'),
      field('রক্তের গ্রুপ', 'bloodGroup'),
      field('রোগের বিভাগ', 'mainCategory'),
      field('আগের রোগ নির্ণয়', 'previousDiagnosis')
    ]));

    // Complaints
    let compList = [];
    for(let i=1; i<=complaintCount; i++) {
      const d = getVal(`comp_desc_${i}`);
      const dur = getVal(`comp_duration_${i}`);
      const sev = getVal(`comp_severity_${i}`);
      if(d) {
        compList.push(`${d} (সময়কাল: ${dur || 'অজানা'}, তীব্রতা: ${sev || 'অজানা'})`);
      }
    }
    compList.push(field('সবচেয়ে কষ্টদায়ক', 'priorityComplaint'));
    compList.push(field('চিকিৎসা লক্ষ্য', 'caseGoal'));
    out.push(section("প্রধান অভিযোগ", compList));

    // Present Illness
    out.push(section("বর্তমান রোগের বিবরণ", [
      field('ধারাবাহিক গল্প', 'illnessStory'),
      field('কীভাবে শুরু', 'onsetHow'),
      field('কারণ', 'cause'),
      field('স্থান', 'exactLocation'),
      field('অনুভূতি', 'sensation'),
      field('ছড়ায়', 'radiation'),
      field('স্থায়িত্ব', 'episodeDuration'),
      field('কতবার', 'episodeFrequency'),
      field('কখন বেশি', 'worseTime'),
      field('আনুষঙ্গিক লক্ষণ', 'concomitantSymptoms'),
      field('আগে/পরে', 'beforeAfterSymptoms'),
      field('রোগের ক্রম', 'diseaseProgress'),
      field('আগের চিকিৎসা', 'treatmentTaken'),
      field('ওষুধে প্রতিক্রিয়া', 'medicineReaction'),
      checkField('জরুরি লক্ষণ', 'redFlags'),
      field('জরুরি নোট', 'redFlagNote')
    ]));

    // Modalities
    out.push(section("বৃদ্ধি ও উপশম (Modalities)", [
      checkField('বৃদ্ধি হয়', 'worseModalities'),
      checkField('কমে/আরাম হয়', 'betterModalities'),
      field('মন্তব্য', 'modalityNotes')
    ]));

    // Mind & Generals
    out.push(section("মানসিক ও সাধারণ লক্ষণ", [
      checkField('মানসিক লক্ষণ', 'mindSymptoms'),
      checkField('ভয়', 'fearSymptoms'),
      field('মানসিক কারণ', 'mentalCause'),
      field('স্বভাবের পরিবর্তন', 'personalityChange'),
      field('ক্ষুধা', 'appetite'),
      field('পিপাসা', 'thirst'),
      field('পানির পরিমাণ', 'waterAmount'),
      field('পানীয়ের তাপমাত্রা', 'drinkTemperature'),
      checkField('খাদ্যে পছন্দ', 'cravings'),
      checkField('খাদ্যে অপছন্দ', 'aversions'),
      checkField('যে খাবারে বাড়ে', 'foodAggravation'),
      field('খাদ্যাভ্যাসের মন্তব্য', 'foodNotes')
    ]));

    // Systemic
    out.push(section("হজম, মল ও প্রস্রাব", [
      checkField('গ্যাস ও হজম', 'digestiveSymptoms'),
      field('হজমের মন্তব্য', 'digestionNotes'),
      field('মল (বার/রং/গন্ধ/শক্ত/রক্ত)', [getVal('stoolFrequency'), getVal('stoolColor'), getVal('stoolSmell'), getVal('stoolConsistency'), getVal('stoolBlood')].filter(Boolean).join(', ')),
      field('মলের মন্তব্য', 'stoolNotes'),
      field('প্রস্রাব (বার/জ্বালা/রং/গন্ধ)', [getVal('urineFrequency'), getVal('urineBurning'), getVal('urineColor'), getVal('urineSmell')].filter(Boolean).join(', ')),
      field('প্রস্রাবের মন্তব্য', 'urineNotes')
    ]));

    out.push(section("ঘুম, ঘাম ও তাপ", [
      field('ঘুম', 'sleepQuality'),
      checkField('ভঙ্গি', 'sleepPosition'),
      checkField('স্বপ্ন', 'dreams'),
      field('ঘুমের মন্তব্য', 'sleepNotes'),
      checkField('ঘাম', 'sweatSymptoms'),
      field('ঘামের মন্তব্য', 'sweatNotes'),
      checkField('তাপ সহ্যক্ষমতা', 'thermalSymptoms'),
      field('তাপের মন্তব্য', 'thermalNotes')
    ]));

    // Gender/Age Specific
    out.push(section("যৌন, নারী ও শিশু ইতিহাস", [
      checkField('যৌন সাধারণ', 'sexualGeneral'),
      field('যৌন মন্তব্য', 'sexualNotes'),
      checkField('পুরুষ লক্ষণ', 'maleSymptoms'),
      field('পুরুষ মন্তব্য', 'maleNotes'),
      field('মাসিক ইতিহাস', [getVal('femaleMenarche'), getVal('femaleCycle'), getVal('femaleFlow'), getVal('femaleColor'), getVal('femalePain')].filter(Boolean).join(', ')),
      field('সাদা স্রাব', 'femaleLeucorrhoea'),
      field('গর্ভাবস্থা/প্রসব', [getVal('femalePregnancy'), getVal('femaleDelivery')].filter(Boolean).join(', ')),
      field('মহিলা রোগ/মন্তব্য', [getVal('femaleProblems'), getVal('femaleNotes')].filter(Boolean).join(', ')),
      field('জন্ম ও বৃদ্ধি (শিশু)', [getVal('childBirth'), getVal('childMilestone')].filter(Boolean).join(', ')),
      field('শিশু মন্তব্য', 'childNotes')
    ]));

    // History & Obs
    out.push(section("অতীত, পারিবারিক ইতিহাস ও পর্যবেক্ষণ", [
      checkField('অতীত ইতিহাস', 'pastHistory'),
      field('অতীত বিস্তারিত', 'pastHistoryDetails'),
      field('চাপা পড়া', 'suppressionHistory'),
      field('অ্যালার্জি', 'allergyHistory'),
      field('আসক্তি', 'addictionHistory'),
      checkField('পারিবারিক ইতিহাস', 'familyHistory'),
      field('পারিবারিক বিস্তারিত', 'familyHistoryDetails'),
      checkField('ত্বকের লক্ষণ', 'skinSymptoms'),
      field('ত্বকের বিস্তারিত', 'skinNotes'),
      field('চলতি এলোপ্যাথি', 'currentAllopathy'),
      field('চলতি হোমিওপ্যাথি', 'currentHomeopathy'),
      field('রিপোর্ট', [getVal('bp'), getVal('sugar'), getVal('hb'), getVal('usg')].filter(Boolean).join(', ')),
      field('অন্যান্য রিপোর্ট', 'otherReports'),
      field('চিকিৎসকের পর্যবেক্ষণ', [getVal('tongue'), getVal('face'), getVal('appearance')].filter(Boolean).join(', ')),
      field('বিশেষ/অদ্ভুত লক্ষণ', 'peculiarSymptoms')
    ]));

    // Doctor Notes
    out.push(section("চিকিৎসকের পর্যালোচনা", [
      field('রুব্রিক্স', [getVal('rubric1'), getVal('rubric2'), getVal('rubric3')].filter(Boolean).join(', ')),
      checkField('সম্ভাব্য মায়াজম', 'miasm'),
      field('গঠনগত ঔষধ', 'constitutionalRemedy'),
      field('আকস্মিক ঔষধ', 'acuteRemedy'),
      field('শক্তি ও ডোজ', [getVal('potency'), getVal('dose')].filter(Boolean).join(', ')),
      field('খাদ্য/উপদেশ', 'dietAdvice')
    ]));

    // Output
    const finalString = out.join('\n').replace(/\n{3,}/g, '\n\n');
    aiOutput.value = finalString;
    goToStep(TOTAL_STEPS); // scroll to report output
  }

  // Go!
  init();
})();
