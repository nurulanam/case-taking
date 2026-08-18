(() => {
  'use strict';

  // rubric names come from the repertory data and are injected as HTML, so
  // they are escaped rather than trusted
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  /* case.html?new=1 — start a genuinely blank case.
     Plain case.html restores the draft, which is right for coming back to an
     unfinished case but made "নতুন কেস" impossible: the link reopened whoever
     was there before. Anything unfiled is filed to the case list first, so
     switching to a new patient can never be what loses the previous one. */
  function startFreshIfAsked() {
    const params = new URLSearchParams(location.search);
    if (!params.has('new')) return;

    const prev = Shell.store.get(DRAFT_KEY, null);
    if (prev && prev.patientName && window.CaseStore) {
      CaseStore.upsert(prev, prev.__caseId || CaseStore.newId());
    }
    Shell.store.del(DRAFT_KEY);

    // drop the parameter so a reload does not wipe the new case in progress
    params.delete('new');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function init() {
    startFreshIfAsked();
    initStepNav();
    initPills();
    initChips();
    bindEvents();
    bindRubricUI();
    bindComplaintRemoval();
    bindShortcuts();
    bindSuggest();
    
    // Default 1 complaint
    if(complaintsContainer.children.length === 0) {
      addComplaint();
    }
    

    // Auto case number: yyyy-nnn, counting saved prescriptions this year.
    // Only ever fills a blank box, so a practitioner's own numbering wins.
    const caseBox = form.querySelector('[name="caseNo"]');
    if (caseBox && !caseBox.value) {
      /* Counting saved prescriptions was the only source of used numbers, so
         before there was a case store every new case came out as YYYY-001 —
         three cases in a row all claimed the same number. Take the highest
         number already issued this year across both stores and go one past it,
         rather than counting rows: counting repeats itself the moment anything
         is deleted. */
      const yr = new Date().getFullYear();
      const prefix = String(yr) + '-';
      const seen = []
        .concat(Shell.store.get('rx_saved_v1', []) || [])
        .concat(window.CaseStore ? CaseStore.all() : []);
      let top = 0;
      seen.forEach(r => {
        const no = String((r && r.caseNo) || '');
        if (!no.startsWith(prefix)) return;
        const n = parseInt(no.slice(prefix.length), 10);
        if (n > top) top = n;
      });
      caseBox.value = prefix + String(top + 1).padStart(3, '0');
    }

    // Set default date to today's local date if not already filled
    const visitDate = document.querySelector('input[name="visitDate"]');
    if (visitDate && !visitDate.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      visitDate.value = `${yyyy}-${mm}-${dd}`;
    }

    restoreDraft();
    renderRubrics();            // draft may have carried a rubric list back
    updateUI();
    updateGenderPanels();
    updateRedFlagBanner();
    applyIncomingRepertory();   // after the draft, so the hand-off is not overwritten
  }

  // --- UI & Navigation ---
  function initStepNav() {
    document.querySelectorAll('.step-tab').forEach((tab) => {
      // completion pip, prepended once so the markup stays a plain button
      if (!tab.querySelector('.step-mark')) {
        const m = document.createElement('span');
        m.className = 'step-mark';
        tab.insertBefore(m, tab.firstChild);
      }
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

  /* A step counts as filled when it holds something the practitioner typed or
     ticked — walking past a step is not the same as answering it, and the old
     "completed = index < current" rule claimed steps were done that were still
     entirely blank. */
  function stepHasData(idx) {
    const sec = formSteps[idx];
    if (!sec) return false;
    return [...sec.querySelectorAll('input, select, textarea')].some(el => {
      if (!el.name && el.id !== 'rubricsJson') return false;
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      // machine-provided defaults are not answers: the date and the case
      // number are filled in for the practitioner, so counting them would
      // mark step 1 complete before a single question was asked
      if (el.type === 'date' || el.name === 'caseNo') return false;
      return !!(el.value || '').trim();
    });
  }

  function updateStepMarks() {
    let filled = 0;
    document.querySelectorAll('.step-tab').forEach((tab, idx) => {
      const has = stepHasData(idx);
      if (has) filled++;
      tab.classList.toggle('filled', has);
    });
    const note = document.getElementById('stepProgressNote');
    if (note) {
      note.innerHTML = filled
        ? `<i class='bx bx-check-circle'></i> <b>${Shell.bnNum(filled)}</b>/${Shell.bnNum(TOTAL_STEPS)} ধাপে তথ্য দেওয়া হয়েছে`
        : `<i class='bx bx-info-circle'></i> শুরু করুন — শুধু নাম, বয়স ও লিঙ্গ আবশ্যক`;
    }
    return filled;
  }

  function updateUI() {
    // Show/Hide steps
    formSteps.forEach((s, idx) => {
      s.classList.toggle('active', (idx + 1) === currentStep);
    });

    // Update Header
    const activeStep = formSteps[currentStep - 1];
    stepCounter.textContent = `ধাপ ${Shell.bnNum(currentStep)} / ${Shell.bnNum(TOTAL_STEPS)}`;
    if (activeStep) {
      currentStepTitle.textContent = activeStep.getAttribute('data-step-title');
    }

    // Progress & Stepper
    progressFill.style.width = `${((currentStep - 1) / (TOTAL_STEPS - 1)) * 100}%`;
    
    document.querySelectorAll('.step-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', (idx + 1) === currentStep);
    });
    updateStepMarks();

    // Scroll active tab into view (smoothly)
    const activeTab = document.querySelector(`.step-tab[data-step="${currentStep}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (currentStep === TOTAL_STEPS) renderCaseSummary();

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

  /* ==================== single-select pills ====================
     A dropdown hides its options behind a tap and needs a second tap to
     choose; on a phone, mid-consultation, that is the slowest control on the
     form. These render the same options as visible pills — one tap, nothing
     hidden — and keep a real <input> underneath so autosave, the draft
     restore and the report all keep working unchanged.

       <div class="pills" data-pills="appetite"
            data-options="বেশি|স্বাভাবিক|কম" data-other="1"></div>

     data-other adds an অন্যান্য pill that reveals a free-text box, so a
     fixed list never becomes a dead end. */
  function initPills() {
    document.querySelectorAll('.pills').forEach(host => {
      const name = host.dataset.pills;
      if (!name || host.dataset.built) return;
      host.dataset.built = '1';
      const opts = (host.dataset.options || '').split('|').filter(Boolean);
      const wantOther = host.dataset.other === '1';

      const store = document.createElement('input');
      store.type = 'hidden';
      store.name = name;
      host.appendChild(store);

      const other = document.createElement('input');
      other.type = 'text';
      other.className = 'pill-other';
      other.placeholder = 'লিখুন…';
      other.hidden = true;

      const buttons = [];
      const select = (val, fromOther) => {
        store.value = val;
        /* The force argument must be a real boolean. `a || (undefined && b)`
           evaluates to `undefined`, and classList.toggle treats an undefined
           second argument as *omitted* — so it toggled each pill instead of
           setting it, turning every option on. */
        buttons.forEach(b => b.classList.toggle('on',
          b.dataset.v === val || (fromOther === true && b.dataset.v === '__other__')));
        store.dispatchEvent(new Event('change', { bubbles: true }));
      };

      opts.forEach(o => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill';
        btn.dataset.v = o;
        btn.textContent = o;
        btn.addEventListener('click', () => {
          const already = store.value === o;
          other.hidden = true;
          other.value = '';
          select(already ? '' : o);   // tapping the chosen pill clears it
        });
        host.appendChild(btn);
        buttons.push(btn);
      });

      if (wantOther) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill pill-other-btn';
        btn.dataset.v = '__other__';
        btn.textContent = 'অন্যান্য';
        btn.addEventListener('click', () => {
          other.hidden = !other.hidden;
          if (other.hidden) { other.value = ''; select(''); }
          else { select('', true); other.focus(); }
        });
        host.appendChild(btn);
        buttons.push(btn);
        host.appendChild(other);
        other.addEventListener('input', () => select(other.value.trim(), true));
      }

      // restoring a draft: a value not in the list came from অন্যান্য
      host._apply = val => {
        if (!val) { select(''); other.hidden = true; return; }
        if (opts.includes(val)) { other.hidden = true; select(val); }
        else if (wantOther) { other.hidden = false; other.value = val; select(val, true); }
      };
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
          if (name === 'redFlags') updateRedFlagBanner();
          updateStepMarks();
        });
      });
    });
  }

  // --- Dynamic Complaints ---
  /* A complaint is the unit repertorisation actually works from, so each one
     carries location / sensation / modality / concomitant of its own rather
     than only a description. The detail half is folded away: the top three
     fields answer most cases, and showing all eleven at once made every
     complaint card a wall. */
  function addComplaint(prefill) {
    complaintCount++;
    const id = complaintCount;
    const div = document.createElement('div');
    div.className = 'sub-card complaint-item';
    div.id = `comp-${id}`;
    div.innerHTML = `
      <div class="complaint-head">
        <span class="c-num">${Shell.bnNum(id)}</span>
        <h4>অভিযোগ</h4>
        ${id > 1 ? `<button type="button" class="c-rm" data-rm-comp="${id}">সরান</button>` : ''}
      </div>
      <div class="grid two tight">
        <label class="field full"><span>কী সমস্যা?</span><input name="comp_desc_${id}" placeholder="যেমন: তীব্র মাথা ব্যথা"></label>
        <label class="field"><span>কতদিন ধরে</span><input name="comp_duration_${id}" placeholder="যেমন: ৩ মাস"></label>
        <label class="field"><span>তীব্রতা (১–১০)</span><input name="comp_severity_${id}" type="number" min="1" max="10" inputmode="numeric" placeholder="৭"></label>
      </div>
      <details class="c-more">
        <summary><i class='bx bx-chevron-right'></i> বিস্তারিত — স্থান, অনুভূতি, বৃদ্ধি/উপশম</summary>
        <div class="c-more-body grid two tight">
          <label class="field"><span>কোথায়</span><input name="comp_location_${id}" placeholder="যেমন: কপালের ডান পাশে"></label>
          <label class="field"><span>কোন দিকে</span>
            <select name="comp_side_${id}">
              <option value="">নির্বাচন করুন</option><option>ডান</option><option>বাম</option>
              <option>দুই দিকে</option><option>মাঝখানে</option><option>দিক বদলায়</option>
            </select>
          </label>
          <label class="field"><span>কেমন অনুভূতি</span><input name="comp_sensation_${id}" placeholder="জ্বালা, ছুরিকাঘাত, ভারী…"></label>
          <label class="field"><span>কীভাবে শুরু</span>
            <select name="comp_onset_${id}">
              <option value="">নির্বাচন করুন</option><option>হঠাৎ</option><option>ধীরে ধীরে</option>
              <option>কোনো ঘটনার পর</option><option>সংক্রমণের পর</option><option>আঘাতের পর</option>
              <option>মানসিক ঘটনার পর</option><option>প্রসব/অপারেশনের পর</option>
              <option>ওষুধ শুরুর পর</option><option>অজানা</option>
            </select>
          </label>
          <label class="field"><span>কিসে বাড়ে</span><input name="comp_worse_${id}" placeholder="যেমন: রোদে, নড়াচড়ায়"></label>
          <label class="field"><span>কিসে কমে</span><input name="comp_better_${id}" placeholder="যেমন: চাপ দিলে, বিশ্রামে"></label>
          <label class="field"><span>কখন বেশি</span><input name="comp_time_${id}" placeholder="যেমন: সকালে, মধ্যরাতে"></label>
          <label class="field"><span>সঙ্গে আর কী হয়</span><input name="comp_concomitant_${id}" placeholder="যেমন: বমিভাব, ঘাম"></label>
        </div>
      </details>
    `;
    complaintsContainer.appendChild(div);
    if (prefill) {
      const d = div.querySelector(`[name="comp_desc_${id}"]`);
      if (d) d.value = prefill;
    }
    return div;
  }

  function bindComplaintRemoval() {
    complaintsContainer.addEventListener('click', e => {
      const btn = e.target.closest('[data-rm-comp]');
      if (!btn) return;
      const el = document.getElementById(`comp-${btn.dataset.rmComp}`);
      if (el) { el.remove(); saveDraft(); updateStepMarks(); }
    });
  }

  // --- Event Bindings ---
  function bindEvents() {
    nextBtn.addEventListener('click', () => {
      if (!validateCurrentStep()) return;
      /* Leaving step 1 means the patient is identified, so the case is
         committed right there instead of waiting for the debounce — a browser
         closed mid-case should never lose the identity that was just typed. */
      if (currentStep === 1) commitCase();
      goToStep(currentStep + 1);
    });
    prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
    genderSelect.addEventListener('change', updateGenderPanels);
    addComplaintBtn.addEventListener('click', addComplaint);
    
    // Generate Report — the readable one
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      generateReport();
      const lbl = document.getElementById('outputLabel');
      if (lbl) lbl.textContent = 'ক্লিনিক্যাল রিপোর্ট';
    });

    // and the machine-shaped one
    const aiBtn = document.getElementById('aiBtn');
    if (aiBtn) aiBtn.addEventListener('click', () => {
      aiOutput.value = generateAiReport();
      const lbl = document.getElementById('outputLabel');
      if (lbl) lbl.textContent = 'এআই ফরম্যাট';
      Shell.toast('এআই ফরম্যাট তৈরি — খালি ঘরগুলো বাদ দেওয়া হয়েছে।', 'ok');
    });
    
    // Copy
    copyBtn.addEventListener('click', async () => {
      const text = aiOutput.value;
      if(!text) return Shell.toast('আগে “কেস রিপোর্ট তৈরি করুন” চাপুন।', 'warn');
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
      if(!text) return Shell.toast('আগে “কেস রিপোর্ট তৈরি করুন” চাপুন।', 'warn');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Case_Report_${document.querySelector('input[name="patientName"]').value || 'Patient'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      Shell.toast('টেক্সট ফাইল ডাউনলোড শুরু হয়েছে।', 'ok');
    });

    resetBtn.addEventListener('click', () => {
      if (confirm('সংরক্ষিত খসড়াসহ সব তথ্য মুছে যাবে। আপনি কি নিশ্চিত?')) {
        Shell.store.del(DRAFT_KEY);
        form.reset();
        location.reload();
      }
    });

    // autosave on any change/typing
    form.addEventListener('input', scheduleSave);
    form.addEventListener('change', scheduleSave);
    window.addEventListener('beforeunload', saveDraft);

    bindRepertoryButtons();
  }

  /* ==================== case  <->  repertory  ====================
     The six rubric boxes used to be typed by hand, which meant repertorising a
     case was a copy-out/copy-back chore and the rubric text rarely matched a
     real rubric in the book. These two buttons close the loop: the case sends
     its symptom phrases to the repertory, and the repertory sends the rubrics it
     actually picked (plus its top-ranked remedy) straight back into these
     fields. */

  // Free-text fields worth searching the repertory for, in the order a
  // prescriber would weigh them (peculiars first — Kent's own priority).
  const SYMPTOM_FIELDS = [
    ['peculiarSymptoms', 'বিশেষ ও অদ্ভুত লক্ষণ'],
    ['mentalCause', 'মানসিক কারণ'],
    ['priorityComplaint', 'প্রধান অভিযোগ'],
    ['concomitantSymptoms', 'সহলক্ষণ'],
    ['modalityNotes', 'মোডালিটি'],
    ['thermalNotes', 'তাপীয়'],
    ['sleepNotes', 'ঘুম'],
    ['foodNotes', 'খাদ্য-আকাঙ্ক্ষা'],
  ];

  function caseSymptoms() {
    const out = [];
    SYMPTOM_FIELDS.forEach(([name, label]) => {
      const v = getVal(name);
      if (!v) return;
      // one phrase per line or sentence — a whole paragraph is useless as a
      // rubric search term, but its individual clauses are not
      v.split(/[\n।;]+/).map(s => s.trim()).filter(s => s.length > 2)
        .slice(0, 6).forEach(text => out.push({ label, text }));
    });
    return out.slice(0, 24);
  }

  /* ==================== rubric store ====================
     Rubrics used to live in six fixed text inputs, so the structured record
     the repertory sends — {name, bn, chapter, page, grade} — was flattened
     into a string, the grade became part of that string, and a case could
     never hold more than six. They are kept as objects now: unlimited,
     de-duplicated, grade still editable, and every one still individually
     removable. The array is mirrored into a hidden field so the existing
     generic autosave picks it up without needing a special case. */
  let rubrics = [];

  const rubKey = r => `${(r.chapter || '').trim()}|${(r.name || '').trim()}`.toLowerCase();

  function syncRubricField() {
    const box = document.getElementById('rubricsJson');
    if (box) box.value = rubrics.length ? JSON.stringify(rubrics) : '';
  }

  function renderRubrics() {
    const host = document.getElementById('rubList');
    const count = document.getElementById('rubCount');
    const clear = document.getElementById('rubClear');
    if (!host) return;

    if (count) count.textContent = Shell.bnNum(rubrics.length);
    if (clear) clear.hidden = !rubrics.length;

    host.innerHTML = rubrics.length ? rubrics.map((r, i) => `
      <div class="rub-row" data-i="${i}">
        <span class="rub-n">${Shell.bnNum(i + 1)}</span>
        <span class="rub-txt">
          <b>${r.chapter ? `<span class="rub-chap">${esc(r.chapter)}</span>` : ''}${esc(r.name)}</b>
          ${r.bn ? `<small>${esc(r.bn)}</small>` : ''}
        </span>
        <select class="rub-grade" data-grade="${i}" aria-label="তীব্রতা">
          <option value="1"${r.grade == 1 ? ' selected' : ''}>তীব্রতা ১</option>
          <option value="2"${r.grade == 2 ? ' selected' : ''}>তীব্রতা ২</option>
          <option value="3"${r.grade == 3 ? ' selected' : ''}>তীব্রতা ৩</option>
        </select>
        <button class="rub-rm" type="button" data-rm="${i}" aria-label="বাদ দিন"><i class='bx bx-x'></i></button>
      </div>`).join('') : `
      <div class="rub-empty">
        <i class='bx bx-book-bookmark'></i>
        <p>এখনো কোনো রুব্রিক নেই। উপরের বোতামে রিপার্টরি খুলে বাছুন, অথবা নিচে নিজে লিখুন।</p>
      </div>`;
    syncRubricField();
  }

  function addRubrics(list, { announce = true } = {}) {
    const seen = new Set(rubrics.map(rubKey));
    let added = 0;
    list.forEach(r => {
      const rec = {
        name: (r.name || '').trim(),
        bn: (r.bn || '').trim(),
        chapter: (r.chapter || '').trim(),
        page: r.page || 0,
        grade: Number(r.grade) || 1,
      };
      if (!rec.name) return;
      const k = rubKey(rec);
      if (seen.has(k)) return;      // the same rubric picked twice is one rubric
      seen.add(k);
      rubrics.push(rec);
      added++;
    });
    renderRubrics();
    saveDraft();
    if (announce && added) {
      Shell.toast(`${Shell.bnNum(added)}টি রুব্রিক যোগ হয়েছে।`, 'ok');
    } else if (announce && !added && list.length) {
      Shell.toast('এই রুব্রিকগুলো আগেই যোগ করা আছে।', 'info');
    }
    return added;
  }

  function bindRubricUI() {
    const host = document.getElementById('rubList');
    if (host) {
      host.addEventListener('click', e => {
        const rm = e.target.closest('[data-rm]');
        if (!rm) return;
        rubrics.splice(+rm.dataset.rm, 1);
        renderRubrics();
        saveDraft();
      });
      host.addEventListener('change', e => {
        const g = e.target.closest('[data-grade]');
        if (!g) return;
        rubrics[+g.dataset.grade].grade = Number(g.value) || 1;
        syncRubricField();
        saveDraft();
      });
    }

    const clear = document.getElementById('rubClear');
    if (clear) clear.addEventListener('click', () => {
      if (!rubrics.length) return;
      if (!confirm(`${Shell.bnNum(rubrics.length)}টি রুব্রিক মুছে যাবে। নিশ্চিত?`)) return;
      rubrics = [];
      renderRubrics();
      saveDraft();
    });

    // manual entry, for practitioners not going through the repertory
    const input = document.getElementById('rubManual');
    const addBtn = document.getElementById('rubAddBtn');
    const addManual = () => {
      const v = (input.value || '').trim();
      if (!v) return;
      addRubrics([{ name: v, grade: 1 }]);
      input.value = '';
      input.focus();
    };
    if (addBtn) addBtn.addEventListener('click', addManual);
    if (input) input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addManual(); }
    });
  }

  /* Buttons only. Applying an incoming hand-off is deliberately NOT done here:
     bindEvents() runs before restoreDraft(), so filling the rubric list at this
     point would have it immediately overwritten by the restored draft and the
     step reset out from under the user. See applyIncomingRepertory(), called
     after the draft is back. */
  function bindRepertoryButtons() {
    const send = document.getElementById('toRepertoryBtn');
    if (send) send.addEventListener('click', () => {
      const sym = caseSymptoms();
      Shell.bridge.patch({
        from: 'case',
        patient: getVal('patientName'),
        caseNo: getVal('caseNo'),
        symptoms: sym,
      });
      saveDraft();
      Shell.toast(sym.length
        ? `${Shell.bnNum(sym.length)}টি লক্ষণ নিয়ে রিপার্টরি খুলছে…`
        : 'রিপার্টরি খুলছে — লক্ষণ ঘর খালি, তাই নিজে খুঁজে নিন।', 'ok');
      setTimeout(() => { location.href = 'repertory.html?from=case'; }, 350);
    });

    // the prescription builder reads the saved draft, so flush before leaving
    const toRx = document.getElementById('toRxFromCase');
    if (toRx) toRx.addEventListener('click', () => {
      saveDraft();
      Shell.bridge.patch({ patient: getVal('patientName'), caseNo: getVal('caseNo') });
    });
  }

  /* Called after restoreDraft(), so what the repertory sent wins over the older
     draft rather than being clobbered by it. */
  function applyIncomingRepertory() {
    const b = Shell.bridge.get();
    if (b && b.from === 'repertory' && Array.isArray(b.rubrics) && b.rubrics.length) {
      applyRubricsFromRepertory(b);
    }
  }

  function applyRubricsFromRepertory(b) {
    // merge, not replace — a second trip to the repertory should extend the
    // case's rubric list rather than throw away the first trip's picks
    const added = addRubrics(b.rubrics, { announce: false });
    let msg = added
      ? `রিপার্টরি থেকে ${Shell.bnNum(added)}টি রুব্রিক যোগ হয়েছে`
      : 'রিপার্টরির রুব্রিকগুলো আগেই যোগ করা ছিল';

    // only offer the remedy when the doctor has not already written one, so a
    // considered choice is never silently overwritten by the machine ranking
    const rx = form.querySelector('[name="constitutionalRemedy"]');
    if (b.remedy && rx && !rx.value.trim()) {
      rx.value = b.remedy.bangla ? `${b.remedy.name} (${b.remedy.bangla})` : b.remedy.name;
      msg += ` · শীর্ষ ওষুধ: ${b.remedy.name}`;
    }
    saveDraft();
    // consumed — otherwise every later visit would re-stamp the same rubrics
    Shell.bridge.patch({ from: 'case-applied', rubrics: b.rubrics });
    Shell.toast(msg + '।', 'ok');
    goToStep(TOTAL_STEPS);
  }

  /* ==================== red flags ====================
     A ticked red flag is the one input on this form that should interrupt
     rather than blend in, so it raises a full-width alarm naming exactly
     which findings were ticked. */
  function updateRedFlagBanner() {
    const banner = document.getElementById('redFlagBanner');
    const list = document.getElementById('redFlagList');
    if (!banner || !list) return;
    const flags = getChecksArray('redFlags');
    banner.hidden = !flags.length;
    list.innerHTML = flags.map(f => `<span>${esc(f)}</span>`).join('');
  }

  /* ==================== case summary ====================
     Step 9 opens on what the case actually says. Built from the fields
     already filled rather than asking for anything new, and silent about
     every section left blank. */
  function renderCaseSummary() {
    const host = document.getElementById('caseSummary');
    if (!host) return;

    const complaints = [];
    for (let i = 1; i <= complaintCount; i++) {
      const d = getVal(`comp_desc_${i}`);
      if (d) complaints.push(d);
    }

    const rows = [
      ['রোগী', [getVal('patientName'), ageText(), getVal('gender')].filter(Boolean).join(' · ')],
      ['কেসের ধরন', getVal('caseType')],
      ['প্রধান অভিযোগ', complaints.join(' · ')],
      ['সবচেয়ে কষ্টদায়ক', getVal('priorityComplaint')],
      ['কারণ', getChecks('cause')],
      ['অনুভূতি', getChecks('sensation')],
      ['বৃদ্ধি', getChecks('worseModalities')],
      ['উপশম', getChecks('betterModalities')],
      ['মানসিক', getChecks('mindSymptoms')],
      ['ভয়', getChecks('fearSymptoms')],
      ['আকাঙ্ক্ষা', getChecks('cravings')],
      ['অরুচি', getChecks('aversions')],
      ['তাপ সহ্যক্ষমতা', getChecks('thermalSymptoms')],
      ['বিশেষ লক্ষণ', getVal('peculiarSymptoms')],
      ['জরুরি লক্ষণ', getChecks('redFlags')],
      ['রুব্রিক', rubrics.map(r => r.name).join(' · ')],
    ].filter(([, v]) => v && v.trim());

    host.innerHTML = rows.length
      ? rows.map(([k, v]) => `<div class="sum-row"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')
      : `<div class="sum-empty">আগের ধাপগুলো পূরণ করলে এখানে কেসের সারাংশ দেখাবে।</div>`;
  }

  /* years + months are two boxes but one clinical fact */
  function ageText() {
    const y = getVal('ageYears'), m = getVal('ageMonths');
    if (!y && !m) return '';
    const parts = [];
    if (y) parts.push(`${Shell.bnNum(y)} বছর`);
    if (m) parts.push(`${Shell.bnNum(m)} মাস`);
    return parts.join(' ');
  }

  /* Persist immediately and make the case visible to the rest of the app.
     The dashboard and the prescription builder both read the bridge, so the
     patient and case number are published here rather than only at hand-off. */
  /* The id of the record this form is editing, so re-saving updates it instead
     of appending a copy. It travels inside the draft (__caseId) because the
     draft is what survives a reload and what cases.html hands back when a
     stored case is reopened. */
  let caseId = null;

  function commitCase() {
    clearTimeout(saveTimer);
    saveDraft();
    const patient = getVal('patientName');
    if (!patient) return;

    /* Until now this toast claimed the case was saved while only a draft had
       been written — the draft being a single slot the next patient
       overwrites. A real record is what makes the case reachable again from
       the list page. */
    Shell.bridge.patch({ from: 'case', patient, caseNo: getVal('caseNo') });
    Shell.toast(`${patient} — কেস সংরক্ষিত হয়েছে।`, 'ok');
  }

  /* Keyboard workflow. Alt+arrows walk the steps and Ctrl+S forces a save —
     both ignored while a select is open or a modifier combo belongs to the
     browser, so nothing native is stolen. */
  function bindShortcuts() {
    document.addEventListener('keydown', e => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowRight') { e.preventDefault(); if (validateCurrentStep()) goToStep(currentStep + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goToStep(currentStep - 1); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft();
        Shell.toast('খসড়া সংরক্ষিত।', 'ok');
      }
    });
  }

  /* ==================== rubric autosuggest ====================
     The notes fields feed repertorisation, but only if what gets written in
     them is wording the repertory actually uses. Left to free text, a case
     says "ঘুম আসে না" and Kent files it under "অনিদ্রা" — the search then
     finds nothing and the practitioner concludes the rubric is missing.
     Suggesting Kent's own vocabulary while typing closes that gap without
     forcing anyone through the repertory page first.

     Deliberately partial, per the brief: these are notes fields, not a
     rubric picker. Accepting a suggestion writes plain text, adds no rubric
     to the case, and can be edited or ignored. Step 9's picker stays the
     only place a rubric is formally attached.

     assets/data/case-suggest.json is 227KB and most sessions never open a
     notes field, so it is fetched on first focus rather than at page load —
     the same reason the Organon reads a chapter at a time. */
  // Step 9's prescribing boxes suggest remedy names instead of rubrics.
  const REMEDY_FIELDS = ['constitutionalRemedy', 'acuteRemedy', 'intercurrent',
                         'nosode', 'biochemic', 'flowerTherapy'];

  const SUGGEST_URL = 'assets/data/case-suggest.json';
  let suggestData = null;
  let suggestLoad = null;

  function loadSuggest() {
    if (suggestLoad) return suggestLoad;
    suggestLoad = fetch(SUGGEST_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { suggestData = d; return d; })
      /* Autosuggest is a convenience; the field stays a plain textarea if the
         file is missing, so a failed fetch must not surface as an error. */
      .catch(() => null);
    return suggestLoad;
  }

  /* Terms for one field, resolved through fields -> groups -> chapters. The
     chapter tags along because in Kent it carries part of the meaning: the
     Stool chapter's "Soft" is soft *stool*, and a bare "নরম" in a dropdown
     would be unreadable. */
  const suggestCache = new Map();
  function suggestTerms(field) {
    // Never cache before the fetch resolves — an early call would memoise the
    // empty pool and the field would stay silent for the rest of the session.
    if (!suggestData) return [];
    if (suggestCache.has(field)) return suggestCache.get(field);
    const d = suggestData;
    let out = [];
    const key = d && d.fields && d.fields[field];
    const grp = key && d.groups && d.groups[key];
    if (grp) {
      const limit = grp.limit || 60;
      out = (grp.chapters || []).flatMap(cn => {
        const ch = (d.chapters || {})[cn];
        if (!ch) return [];
        return ch.terms.slice(0, limit).map(([en, bn, n]) => ({
          en, bn, n,
          label: bn || en,
          chap: ch.bn || cn,
          bnLc: (bn || '').toLowerCase(),
          enLc: en.toLowerCase()
        }));
      });
    }
    suggestCache.set(field, out);
    return out;
  }

  function remedyTerms() {
    if (!suggestData) return [];
    if (suggestCache.has('__rx')) return suggestCache.get('__rx');
    const out = ((suggestData && suggestData.remedies) || []).map(([en, bn, n]) => ({
      en, bn, n: n || 0, rx: true,
      label: bn || en,
      chap: bn ? en : '',       // Latin name as the sub-label when Bangla exists
      bnLc: (bn || '').toLowerCase(),
      enLc: en.toLowerCase()
    }));
    suggestCache.set('__rx', out);
    return out;
  }

  /* Same tiering as the repertory search, so a term ranks the same in both
     places: whole-value beats prefix beats word-start beats mid-word. Without
     the word-boundary tier, typing "ঘুম" put "অঘুম-জাতীয়" above "ঘুমের" purely
     on string position. */
  function tier(hay, q) {
    if (!hay) return -1;
    const i = hay.indexOf(q);
    if (i < 0) return -1;
    if (i === 0) return hay.length === q.length ? 1000 : 600;
    return /[\s,;(–—-]/.test(hay[i - 1]) ? 420 : 150;
  }

  /* Bangla and English are scored as separate haystacks and the better of the
     two wins. Concatenating them into one string looked equivalent but was
     not: an English query could never reach the prefix tier because the
     Bangla name sat in front of it, so "arsen" ranked "Aurum Arsenicum"
     (word-boundary) above "Arsenicum Album" (should be prefix). */
  function suggestScore(t, q) {
    const s = Math.max(tier(t.bnLc, q), tier(t.enLc, q));
    if (s < 0) return -1;
    if (t.rx) {
      /* Remedy counts span 3 to 9,033, so a linear boost would let one
         polychrest outrank a whole tier. Log-scaled and capped below the
         600-vs-420 tier gap, it only ever reorders within a tier. */
      return s + Math.min(150, Math.log(t.n + 1) * 17);
    }
    return s
      + Math.min(60, t.n * 0.25)           // broader rubrics first
      + Math.max(0, 40 - t.label.length);  // shorter, more general wording
  }

  /* A notes field holds several symptoms, comma-separated, so the query is
     the segment the caret sits in — not the whole box. Matching the whole box
     stopped suggesting anything the moment a first symptom was written. */
  function activeSegment(el) {
    const pos = el.selectionStart ?? el.value.length;
    const upto = el.value.slice(0, pos);
    const start = Math.max(upto.lastIndexOf(','), upto.lastIndexOf('\n')) + 1;
    return { start, end: pos, text: el.value.slice(start, pos).trim() };
  }

  function bindSuggest() {
    /* case.html writes its text boxes as a bare <input name="..."> with no
       type attribute, so an input[type="text"] selector matched none of the
       step-9 remedy fields. Match on what the browser resolved instead, and
       skip the typed boxes (number/date/checkbox) where a rubric dropdown
       makes no sense. */
    const SKIP_TYPES = new Set(['checkbox', 'radio', 'number', 'date', 'time',
                                'hidden', 'file', 'range', 'color', 'submit',
                                'button', 'email', 'tel', 'url', 'password']);
    /* Each entry pairs a control with the vocabulary key to look it up under.
       For a named field that is just its name; for a pill group's "অন্যান্য"
       box, which carries no name of its own, it is the group's name — that box
       is where a selection field becomes free text, so it needs the same
       vocabulary as any notes field. */
    const fields = [];
    document.querySelectorAll('textarea[name], input[name]').forEach(el => {
      if (el.dataset.suggest === 'off') return;
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(el.type)) return;
      // the hidden store behind each pill group is an input[name] too
      if (el.closest('.pills')) return;
      fields.push({ el, key: el.name });
    });
    document.querySelectorAll('.pills[data-pills] .pill-other').forEach(el => {
      fields.push({ el, key: el.closest('.pills').dataset.pills });
    });

    fields.forEach(({ el, key }) => {
      let box = null, items = [], sel = -1, open = false;

      const kind = REMEDY_FIELDS.includes(key) ? 'rx' : 'note';

      const close = () => {
        open = false; sel = -1;
        if (box) box.hidden = true;
        el.setAttribute('aria-expanded', 'false');
      };

      const ensureBox = () => {
        if (box) return box;
        const wrap = el.closest('label, .field') || el.parentElement;
        if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        box = document.createElement('div');
        box.className = 'cs-pop';
        box.setAttribute('role', 'listbox');
        box.hidden = true;
        wrap.appendChild(box);
        /* mousedown, not click: click fires after the field's blur, by which
           point the caret offsets the insertion needs are already gone. */
        box.addEventListener('mousedown', ev => {
          const row = ev.target.closest('.cs-row');
          if (!row) return;
          ev.preventDefault();
          accept(+row.dataset.i);
        });
        return box;
      };

      const accept = i => {
        const t = items[i];
        if (!t) return;
        const seg = activeSegment(el);
        const before = el.value.slice(0, seg.start);
        const after = el.value.slice(seg.end);
        const pad = before && !/[\s]$/.test(before) ? ' ' : '';
        const text = t.label;
        el.value = before + pad + text + after;
        const caret = (before + pad + text).length;
        el.setSelectionRange(caret, caret);
        close();
        el.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const render = () => {
        const b = ensureBox();
        if (!items.length) { close(); return; }
        b.innerHTML = items.map((t, i) => `
          <div class="cs-row${i === sel ? ' on' : ''}" role="option" data-i="${i}"
               aria-selected="${i === sel}">
            <span class="cs-nm">${esc(t.label)}</span>
            ${t.chap ? `<span class="cs-ch">${esc(t.chap)}</span>` : ''}
          </div>`).join('');
        b.hidden = false;
        open = true;
        el.setAttribute('aria-expanded', 'true');
      };

      const refresh = () => {
        const pool = kind === 'rx' ? remedyTerms() : suggestTerms(key);
        if (!pool.length) { close(); return; }
        const q = activeSegment(el).text.toLowerCase();
        // Two characters is the floor: one Bangla letter matches most of the
        // vocabulary and the dropdown becomes noise rather than a shortlist.
        if (q.length < 2) { close(); return; }
        items = pool
          .map(t => ({ t, s: suggestScore(t, q) }))
          .filter(x => x.s >= 0)
          .sort((a, b) => b.s - a.s || a.t.label.length - b.t.label.length)
          .slice(0, 8)
          .map(x => x.t);
        sel = -1;
        render();
      };

      const armed = () => (kind === 'rx'
        ? true
        : !!(suggestData && suggestData.fields && suggestData.fields[key]));

      el.addEventListener('focus', () => {
        loadSuggest().then(() => { if (armed() && document.activeElement === el) refresh(); });
      });
      el.addEventListener('input', () => { if (suggestData && armed()) refresh(); });
      el.addEventListener('blur', () => setTimeout(close, 120));

      el.addEventListener('keydown', e => {
        if (!open) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          sel = e.key === 'ArrowDown'
            ? (sel + 1) % items.length
            : (sel <= 0 ? items.length - 1 : sel - 1);
          render();
        } else if (e.key === 'Enter' && sel >= 0) {
          // Only swallow Enter once a row is actually highlighted, so an open
          // dropdown never blocks a newline in a notes field.
          e.preventDefault();
          accept(sel);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'Tab' && sel >= 0) {
          accept(sel);
        }
      });

      if (armed() || kind === 'rx') el.setAttribute('autocomplete', 'off');
    });
  }

  // --- Draft autosave (localStorage) ---
  const DRAFT_KEY = 'homeoCaseDraft';
  let saveTimer = null;

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveDraft(); updateStepMarks(); }, 700);
  }

  function collectDraft() {
    const data = { __complaints: complaintCount, __step: currentStep, __saved: new Date().toISOString() };
    /* The record id is not a form field, so it has to be re-attached on every
       collect — otherwise the next autosave (or beforeunload) wrote a draft
       without it and the open case quietly detached from its saved record. */
    if (caseId) data.__caseId = caseId;
    form.querySelectorAll('input, textarea, select').forEach(el => {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        if (el.checked) (data[el.name] = data[el.name] || []).push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else if (el.value) {
        data[el.name] = el.value;
      }
    });
    return data;
  }

  /* Files the open case into the case list. The patient's name is the gate:
     without one there is nothing to identify a record by, and an empty form
     touched once would otherwise litter the list with blank cases. */
  function fileCase(data) {
    if (!window.CaseStore) return false;
    const name = (data.patientName || '').trim();
    if (!name) return false;
    if (!caseId) {
      caseId = CaseStore.newId();
      data.__caseId = caseId;
      // re-persist so the id survives even if this save is the last one
      Shell.store.set(DRAFT_KEY, data);
    }
    return !!CaseStore.upsert(data, caseId);
  }

  function saveDraft() {
    const data = collectDraft();
    if (!Shell.store.set(DRAFT_KEY, data)) return;
    /* Autosave files the case as well as the draft. Filing only on the step-1
       "পরবর্তী" button meant everything typed afterwards lived in the draft
       alone — a single slot the next patient overwrites — so the list showed a
       stale copy of a case that had since been filled in. */
    const filed = fileCase(data);
    markSaved(data, filed);
  }

  function markSaved(data, filed) {
    const n = Object.keys(data).filter(k => !k.startsWith('__')).length;
    // "খসড়া" while there is no patient name and so nothing is filed yet;
    // once the case is in the list, say so rather than under-reporting it.
    const label = n
      ? (filed ? `কেস সংরক্ষিত · ${Shell.bnNum(n)}টি ঘর` : `খসড়া সংরক্ষিত · ${Shell.bnNum(n)}টি ঘর`)
      : 'খসড়া খালি';
    Shell.setChip(label, n ? 'bx-check-circle' : 'bx-save', !n);

    /* The indicator is a transient toast (opacity:0 until .show), so writing
       into it without toggling the class left the confirmation invisible —
       an autosave the practitioner cannot see is one they cannot trust. */
    const ind = document.getElementById('autosaveIndicator');
    if (ind && n) {
      const t = new Date();
      const hh = t.getHours() % 12 || 12, mm = String(t.getMinutes()).padStart(2, '0');
      const ap = t.getHours() < 12 ? 'AM' : 'PM';
      ind.textContent = `সংরক্ষিত ${Shell.bnNum(hh)}:${Shell.bnNum(mm)} ${ap}`;
      ind.classList.add('show');
      clearTimeout(ind._t);
      ind._t = setTimeout(() => ind.classList.remove('show'), 2500);
    }
  }

  function restoreDraft() {
    const data = Shell.store.get(DRAFT_KEY, null);
    if (!data) { Shell.setChip('খসড়া খালি', 'bx-save', true); return; }

    /* Carry the record id back in, so a case reopened from cases.html saves
       over itself instead of being filed again as a new one. */
    if (data.__caseId) caseId = data.__caseId;

    // rebuild the dynamic complaint cards first
    const want = Math.max(1, parseInt(data.__complaints) || 1);
    while (complaintsContainer.children.length < want) addComplaint();

    Object.entries(data).forEach(([name, val]) => {
      if (name.startsWith('__')) return;
      if (Array.isArray(val)) {
        val.forEach(v => {
          const box = form.querySelector(`input[type="checkbox"][name="${CSS.escape(name)}"][value="${CSS.escape(v)}"]`);
          if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: false })); }
        });
      } else {
        const host = document.querySelector(`.pills[data-pills="${CSS.escape(name)}"]`);
        if (host && host._apply) { host._apply(val); return; }
        const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
        if (el && el.type !== 'checkbox') el.value = val;
      }
    });

    // the hidden field is only a transport for autosave; the array is truth
    if (data.rubricsJson) {
      try { rubrics = JSON.parse(data.rubricsJson) || []; } catch (e) { rubrics = []; }
    }

    if (data.__step) currentStep = Math.min(TOTAL_STEPS, Math.max(1, parseInt(data.__step) || 1));
    markSaved(data);
    Shell.toast('আগের খসড়া ফিরিয়ে আনা হয়েছে।', 'ok');
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

  /* ==================== AI export ====================
     A second, machine-shaped rendering of the same case. The readable report
     is for a human reading a printout; this one is for pasting into a model,
     so it is flat KEY: value with no box drawing, and every empty field is
     dropped rather than emitted as a blank line — an LLM given twenty empty
     headings spends its attention on the headings. */
  function generateAiReport() {
    const L = [];
    const put = (k, v) => { if (v && String(v).trim()) L.push(`${k}: ${v}`); };

    const complaints = [];
    const details = [];
    for (let i = 1; i <= complaintCount; i++) {
      const d = getVal(`comp_desc_${i}`);
      if (!d) continue;
      complaints.push(d);
      const bits = [
        getVal(`comp_location_${i}`) && `location=${getVal(`comp_location_${i}`)}`,
        getVal(`comp_side_${i}`) && `side=${getVal(`comp_side_${i}`)}`,
        getVal(`comp_sensation_${i}`) && `sensation=${getVal(`comp_sensation_${i}`)}`,
        getVal(`comp_onset_${i}`) && `onset=${getVal(`comp_onset_${i}`)}`,
        getVal(`comp_duration_${i}`) && `duration=${getVal(`comp_duration_${i}`)}`,
        getVal(`comp_severity_${i}`) && `severity=${getVal(`comp_severity_${i}`)}/10`,
        getVal(`comp_worse_${i}`) && `worse=${getVal(`comp_worse_${i}`)}`,
        getVal(`comp_better_${i}`) && `better=${getVal(`comp_better_${i}`)}`,
        getVal(`comp_time_${i}`) && `time=${getVal(`comp_time_${i}`)}`,
        getVal(`comp_concomitant_${i}`) && `with=${getVal(`comp_concomitant_${i}`)}`,
      ].filter(Boolean);
      if (bits.length) details.push(`  ${d} — ${bits.join('; ')}`);
    }

    L.push('=== HOMEOPATHIC CASE (Bangla) ===');
    put('CASE TYPE', getVal('caseType') || getVal('visitType'));
    put('PATIENT', [getVal('patientName'), ageText(), getVal('gender')].filter(Boolean).join(', '));
    put('OCCUPATION', getVal('occupation'));
    put('DIAGNOSIS SO FAR', getVal('previousDiagnosis'));

    put('CHIEF COMPLAINT', complaints.join(' | '));
    if (details.length) L.push('COMPLAINT DETAIL:\n' + details.join('\n'));
    put('MOST DISTRESSING', getVal('priorityComplaint'));
    put('PATIENT GOAL', getVal('caseGoal'));

    put('HISTORY', getVal('illnessStory'));
    put('ONSET', getVal('onsetHow'));
    put('CAUSATION', getChecks('cause'));
    put('LOCATION', getChecks('exactLocation'));
    put('SENSATION', getChecks('sensation'));
    put('RADIATION', getChecks('radiation'));
    put('DURATION', getVal('episodeDuration'));
    put('FREQUENCY', getVal('episodeFrequency'));
    put('WORSE TIME', getChecks('worseTime'));
    put('CONCOMITANTS', getVal('concomitantSymptoms'));
    put('PROGRESSION', getVal('diseaseProgress'));

    put('MODALITIES WORSE', getChecks('worseModalities'));
    put('MODALITIES BETTER', getChecks('betterModalities'));
    put('MODALITY NOTES', getVal('modalityNotes'));

    put('MENTALS', getChecks('mindSymptoms'));
    put('FEARS', getChecks('fearSymptoms'));
    put('MENTAL CAUSATION', getVal('mentalCause'));
    put('PERSONALITY CHANGE', getChecks('personalityChange'));

    put('APPETITE', getVal('appetite'));
    put('THIRST', getVal('thirst'));
    put('CRAVINGS', getChecks('cravings'));
    put('AVERSIONS', getChecks('aversions'));
    put('FOOD AGGRAVATION', getChecks('foodAggravation'));

    put('THERMAL', getChecks('thermalSymptoms'));
    put('SWEAT', getChecks('sweatSymptoms'));
    put('SLEEP', getVal('sleepQuality'));
    put('DREAMS', getChecks('dreams'));
    put('STOOL', [getVal('stoolFrequency'), getVal('stoolConsistency'), getVal('stoolNotes')].filter(Boolean).join(', '));
    put('URINE', [getVal('urineFrequency'), getVal('urineColor'), getVal('urineNotes')].filter(Boolean).join(', '));
    put('DIGESTION', getChecks('digestiveSymptoms'));

    put('MALE', getChecks('maleSymptoms'));
    put('FEMALE MENSES', [getVal('femaleCycle'), getVal('femaleFlow'), getVal('femalePain')].filter(Boolean).join(', '));
    put('FEMALE PROBLEMS', getVal('femaleProblems'));

    put('PAST HISTORY', getChecks('pastHistory'));
    put('SUPPRESSION', getVal('suppressionHistory'));
    put('FAMILY HISTORY', getChecks('familyHistory'));
    put('ALLERGY', getVal('allergyHistory'));
    put('SKIN', getChecks('skinSymptoms'));
    put('CURRENT MEDICATION', [getVal('currentAllopathy'), getVal('currentHomeopathy'), getVal('currentHerbal')].filter(Boolean).join(' | '));
    put('REPORTS', getVal('otherReports'));
    put('OBSERVATION', [getVal('tongue'), getVal('face'), getVal('observationNotes')].filter(Boolean).join(', '));

    put('PECULIAR SYMPTOMS', getVal('peculiarSymptoms'));
    put('RED FLAGS', getChecks('redFlags'));

    if (rubrics.length) {
      L.push('SELECTED RUBRICS:\n' + rubrics.map(r =>
        `  - ${r.chapter ? '[' + r.chapter + '] ' : ''}${r.name}${r.bn ? ' (' + r.bn + ')' : ''} [grade ${r.grade}]`
      ).join('\n'));
    }
    put('MIASM (practitioner)', getChecks('miasm'));
    put('REMEDY CONSIDERED', [getVal('constitutionalRemedy'), getVal('acuteRemedy')].filter(Boolean).join(', '));

    const asks = getChecks('aiNeeds');
    if (asks) L.push(`\nANALYSIS REQUESTED: ${asks}`);
    put('EXTRA INSTRUCTION', getVal('additionalInstruction'));

    L.push('\nNOTE: এটি শিক্ষামূলক বিশ্লেষণের জন্য। চূড়ান্ত সিদ্ধান্ত চিকিৎসকের।');
    return L.join('\n');
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
      fieldItem('বয়স', ageText()),
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
      if (!d) continue;
      compList.push(`  ${cIdx}. ${d}`);
      // one labelled line per detail actually filled — a complaint with no
      // detail stays a single clean line instead of eight empty ones
      [['সময়কাল', 'duration'], ['তীব্রতা', 'severity'], ['স্থান', 'location'],
       ['দিক', 'side'], ['অনুভূতি', 'sensation'], ['শুরু', 'onset'],
       ['বৃদ্ধি', 'worse'], ['উপশম', 'better'], ['সময়', 'time'],
       ['সঙ্গে', 'concomitant']].forEach(([label, key]) => {
        const v = getVal(`comp_${key}_${i}`);
        if (v) compList.push(`       ◦ ${label}: ${v}`);
      });
      cIdx++;
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
      rubrics.length ? listGroup('নির্বাচিত রুব্রিক', rubrics.map(r =>
        `${r.chapter ? '[' + r.chapter + '] ' : ''}${r.name}${r.bn ? ' — ' + r.bn : ''} (তীব্রতা ${Shell.bnNum(r.grade)})`)) : '',
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
    Shell.toast('কেস রিপোর্ট তৈরি হয়েছে — নিচে কপি বা ডাউনলোড করুন।', 'ok');
  }

  // --- Phase 4: Case Taking UX Improvements ---

  // Auto-save with timestamp indicator
  let autosaveTimer = null;
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      save();
      showAutosaveIndicator();
    }, 2000); // Save 2s after last input
  }

  function showAutosaveIndicator() {
    const indicator = document.getElementById('autosaveIndicator');
    if (!indicator) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    indicator.textContent = `সংরক্ষিত ${time}`;
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 3500);
  }

  /* Quick-add symptom chips.
     These used to append the symptom as a line of text in the
     "সবচেয়ে কষ্টদায়ক" box, which is a different question — the chip is a
     chief complaint, so it now becomes one: filling the first empty
     complaint card, or adding a new one when they are all in use. */
  function initQuickAddChips() {
    document.querySelectorAll('#quickChips .quick-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.preventDefault();
        const symptom = chip.dataset.add;
        if (!symptom) return;

        // already recorded? don't silently add a duplicate card
        for (let i = 1; i <= complaintCount; i++) {
          if (getVal(`comp_desc_${i}`) === symptom) {
            Shell.toast(`“${symptom}” আগেই যোগ করা আছে।`, 'info');
            return;
          }
        }

        let target = null;
        for (let i = 1; i <= complaintCount; i++) {
          const el = form.querySelector(`[name="comp_desc_${i}"]`);
          if (el && !el.value.trim()) { target = el; break; }
        }
        if (target) {
          target.value = symptom;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          addComplaint(symptom);
        }

        chip.classList.add('active');
        setTimeout(() => chip.classList.remove('active'), 600);
        saveDraft();
        updateStepMarks();
        Shell.toast(`“${symptom}” অভিযোগে যোগ হয়েছে।`, 'ok');
      });
    });
  }

  // Inline validation with orange hint
  function initInlineValidation() {
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
      field.addEventListener('blur', () => {
        validateField(field);
      });
      field.addEventListener('input', () => {
        if (field.value.trim()) {
          clearFieldError(field);
        }
      });
    });
  }

  function validateField(field) {
    if (!field.value.trim()) {
      showFieldError(field, `এই ফিল্ড পূরণ করুন`);
    } else {
      clearFieldError(field);
    }
  }

  function showFieldError(field, message) {
    const fieldLabel = field.closest('.field');
    if (!fieldLabel) return;
    fieldLabel.classList.add('has-error');

    let hint = fieldLabel.querySelector('.field-error');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'field-error';
      fieldLabel.appendChild(hint);
    }
    hint.textContent = message;
  }

  function clearFieldError(field) {
    const fieldLabel = field.closest('.field');
    if (!fieldLabel) return;
    fieldLabel.classList.remove('has-error');
    const hint = fieldLabel.querySelector('.field-error');
    if (hint) hint.remove();
  }

  // Smart defaults for Bangladesh
  function applySmartDefaults() {
    // Set visit date to today if empty
    const visitDate = document.querySelector('input[name="visitDate"]');
    if (visitDate && !visitDate.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      visitDate.value = `${yyyy}-${mm}-${dd}`;
    }
  }

  // Track step completion for progress indicator
  /* updateStepCompletion() removed: it marked every step before the current
     one "completed" regardless of whether anything had been entered, looked
     up a step element it never used, and now contradicts updateStepMarks(),
     which reports actual data. */

  // Enhance init to include Phase 4 features
  const originalInit = init;
  function enhancedInit() {
    originalInit();
    initQuickAddChips();
    initInlineValidation();
    applySmartDefaults();

    /* Autosave is already bound in bindEvents() via scheduleSave(); binding
       scheduleAutosave() here as well meant two timers writing the same draft
       and two different renderings fighting over #autosaveIndicator, so the
       Bangla "সর্বশেষ সংরক্ষণ" line was overwritten 2s later by a bare clock. */
  }

  // Go!
  enhancedInit();
})();
