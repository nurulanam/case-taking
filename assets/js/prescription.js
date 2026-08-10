/* ==========================================================================
   Prescription builder — turns a finished case + repertorisation into a
   printable prescription without retyping anything.

   Sources it pulls from, in order of authority:
     Shell.bridge  the repertory's picked rubrics + ranked remedy (and the case
                   name/number the case form put there)
     homeoCaseDraft  the case form's own fields — patient, age, potency, dose,
                   repetition, follow-up, diet advice, the remedy the doctor
                   actually wrote
     rx_doctor_v1  the prescriber's own letterhead, remembered between visits

   Nothing here decides anything clinical. Every field is the doctor's own text;
   the page only lays it out and prints it. The remedy the *doctor* wrote always
   wins over the repertory's ranking — the ranking is only used to fill an
   otherwise empty row, and is labelled as coming from the repertory.
   ========================================================================== */
(function () {
  'use strict';

  const bn = v => Shell.bnNum(v);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DOC_KEY = 'rx_doctor_v1';      // letterhead, remembered
  const DRAFT_KEY = 'rx_draft_v1';     // this prescription in progress
  const SAVED_KEY = 'rx_saved_v1';     // history
  const CASE_KEY = 'homeoCaseDraft';

  const POTENCIES = ['6', '12', '30', '200', '1M', '10M', '50M', 'CM', 'LM1', 'LM2', 'LM3'];
  const FORMS = ['ডিলিউশন (Dilution)', 'গ্লোবিউল / বড়ি', 'মাদার টিংচার (Q)',
                 'বায়োকেমিক ট্যাবলেট', 'ট্রিটুরেশন (চূর্ণ)', 'প্লেসিবো'];
  const REPEATS = ['শুধু ১ ডোজ', 'দিনে ১ বার', 'দিনে ২ বার', 'দিনে ৩ বার', 'দিনে ৪ বার',
                   'সপ্তাহে ১ বার', '১৫ দিনে ১ বার', 'প্রয়োজন অনুযায়ী (SOS)'];
  const WHENS = ['সকালে খালি পেটে', 'সকালে ও রাতে', 'খাওয়ার আগে', 'খাওয়ার পরে',
                 'রাতে ঘুমানোর আগে', 'সময় নির্দিষ্ট নয়'];

  const form = document.getElementById('rxForm');
  const itemsHost = document.getElementById('rxItems');
  const sheet = document.getElementById('rxSheet');

  let items = [];        // [{ remedy, potency, form, repeat, when, days, note, source }]

  /* ==================== field helpers ==================== */
  const val = name => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : '';
  };
  const setVal = (name, v) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && v != null && v !== '') el.value = v;
  };

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function bnDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    try {
      return new Intl.DateTimeFormat('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
    } catch (e) { return iso; }
  }

  /* ==================== medicine rows ==================== */
  function blankItem() {
    return { remedy: '', potency: '', form: '', repeat: '', when: '', days: '', note: '', source: '' };
  }

  function opts(list, cur) {
    return '<option value="">—</option>' +
      list.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }

  function renderItems() {
    if (!items.length) items = [blankItem()];
    itemsHost.innerHTML = items.map((it, i) => `
      <div class="rx-item" data-i="${i}">
        <div class="rx-item-head">
          <span class="rx-item-n">${bn(i + 1)}</span>
          ${it.source ? `<span class="rx-src-tag" title="রিপার্টরির র‍্যাঙ্ক থেকে বসানো — যাচাই করুন">
            <i class='bx bx-book-bookmark'></i> ${esc(it.source)}</span>` : ''}
          <button class="rx-del" type="button" data-del="${i}" title="সরান"
            ${items.length === 1 ? 'disabled' : ''}><i class='bx bx-trash'></i></button>
        </div>
        <div class="grid two">
          <label class="field full"><span>ঔষধের নাম</span>
            <input data-f="remedy" value="${esc(it.remedy)}" placeholder="যেমন: Pulsatilla Nigricans"/></label>
          <label class="field"><span>শক্তি</span>
            <select data-f="potency">${opts(POTENCIES, it.potency)}</select></label>
          <label class="field"><span>রূপ</span>
            <select data-f="form">${opts(FORMS, it.form)}</select></label>
          <label class="field"><span>পুনরাবৃত্তি</span>
            <select data-f="repeat">${opts(REPEATS, it.repeat)}</select></label>
          <label class="field"><span>কখন</span>
            <select data-f="when">${opts(WHENS, it.when)}</select></label>
          <label class="field"><span>কত দিন</span>
            <input data-f="days" value="${esc(it.days)}" placeholder="যেমন: ৭ দিন"/></label>
          <label class="field full"><span>বিশেষ নির্দেশ</span>
            <input data-f="note" value="${esc(it.note)}" placeholder="ঐচ্ছিক"/></label>
        </div>
      </div>`).join('');

    itemsHost.querySelectorAll('.rx-item').forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll('[data-f]').forEach(el => {
        el.addEventListener('input', () => {
          items[i][el.dataset.f] = el.value;
          // the doctor has taken ownership of this row; stop crediting the
          // repertory for a name they may have replaced
          if (el.dataset.f === 'remedy') { items[i].source = ''; row.querySelector('.rx-src-tag')?.remove(); }
          paint();
        });
      });
    });
    itemsHost.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
      items.splice(+btn.dataset.del, 1);
      renderItems(); paint();
    }));
  }

  /* ==================== the printed sheet ==================== */
  function paint() {
    const name = val('patientName'), age = val('age'), gender = val('gender');
    const meds = items.filter(it => it.remedy.trim());

    const line = it => {
      const bits = [it.potency, it.form].filter(Boolean).join(' · ');
      const how = [it.repeat, it.when, it.days].filter(Boolean).join(' · ');
      return `<tr>
        <td class="rs-rx">
          <b>${esc(it.remedy)}</b>${bits ? `<span>${esc(bits)}</span>` : ''}
          ${it.note ? `<em>${esc(it.note)}</em>` : ''}
        </td>
        <td class="rs-how">${how ? esc(how) : '<span class="rs-dim">—</span>'}</td>
      </tr>`;
    };

    sheet.innerHTML = `
      <div class="rs-head">
        <div class="rs-doc">
          <b>${esc(val('docName') || 'চিকিৎসকের নাম')}</b>
          ${val('docQual') ? `<span>${esc(val('docQual'))}</span>` : ''}
          ${val('docReg') ? `<span>রেজি. ${esc(val('docReg'))}</span>` : ''}
        </div>
        <div class="rs-clinic">
          ${val('docClinic') ? esc(val('docClinic')).replace(/\n/g, '<br>') : ''}
          ${val('docPhone') ? `<div>মোবাইল: ${esc(val('docPhone'))}</div>` : ''}
        </div>
      </div>

      <div class="rs-patient">
        <div><label>রোগী</label><b>${esc(name || '—')}</b></div>
        <div><label>বয়স / লিঙ্গ</label><b>${esc([age, gender].filter(Boolean).join(' / ') || '—')}</b></div>
        <div><label>কেস নং</label><b>${esc(val('caseNo') || '—')}</b></div>
        <div><label>তারিখ</label><b>${esc(bnDate(val('rxDate')) || '—')}</b></div>
      </div>

      ${val('diagnosis') ? `<div class="rs-dx"><label>সংক্ষেপ</label>${esc(val('diagnosis'))}</div>` : ''}

      <div class="rs-body">
        <div class="rs-rxmark">℞</div>
        ${meds.length ? `<table class="rs-table"><tbody>${meds.map(line).join('')}</tbody></table>`
          : `<p class="rs-empty">এখনো কোনো ঔষধ লেখা হয়নি — বাঁ পাশে ঔষধের নাম দিন।</p>`}
      </div>

      ${val('dietAdvice') ? `<div class="rs-adv"><label>খাদ্য ও জীবনযাপন</label>
        <p>${esc(val('dietAdvice')).replace(/\n/g, '<br>')}</p></div>` : ''}
      ${val('generalAdvice') ? `<div class="rs-adv"><label>নির্দেশনা</label>
        <p>${esc(val('generalAdvice')).replace(/\n/g, '<br>')}</p></div>` : ''}

      <div class="rs-foot">
        <div class="rs-follow">
          ${val('followUp') || val('followUpDate')
            ? `<label>পরবর্তী সাক্ষাৎ</label><b>${esc([val('followUp'), bnDate(val('followUpDate'))].filter(Boolean).join(' · '))}</b>`
            : ''}
        </div>
        <div class="rs-sign"><span></span>চিকিৎসকের স্বাক্ষর</div>
      </div>`;
    saveDraft();
  }

  /* ==================== prefill from case + repertory ==================== */
  function prefill() {
    const doc = Shell.store.get(DOC_KEY, null) || {};
    Object.entries(doc).forEach(([k, v]) => setVal(k, v));

    const draft = Shell.store.get(DRAFT_KEY, null);
    if (draft) {                       // resume an unfinished prescription first
      Object.entries(draft.fields || {}).forEach(([k, v]) => setVal(k, v));
      items = (draft.items || []).map(x => Object.assign(blankItem(), x));
      if (!val('rxDate')) setVal('rxDate', todayISO());
      return;
    }

    const c = Shell.store.get(CASE_KEY, null) || {};
    const b = Shell.bridge.get() || {};

    setVal('patientName', c.patientName || b.patient || '');
    setVal('caseNo', c.caseNo || b.caseNo || '');
    setVal('age', c.age || '');
    setVal('gender', c.gender || '');
    setVal('rxDate', todayISO());
    setVal('diagnosis', c.previousDiagnosis || c.mainCategory || '');
    setVal('followUp', c.followUp || '');
    setVal('dietAdvice', c.dietAdvice || '');

    // One row per remedy the doctor already named in the case, in clinical
    // order. These are the doctor's own choices, so they carry no source tag.
    [['constitutionalRemedy', 'গঠনগত'], ['acuteRemedy', 'আকস্মিক'],
     ['intercurrent', 'মধ্যবর্তী'], ['nosode', 'নোসোড'], ['biochemic', 'বায়োকেমিক']]
      .forEach(([f, note]) => {
        if (!c[f]) return;
        items.push(Object.assign(blankItem(), {
          remedy: c[f], note: note,
          potency: POTENCIES.includes(String(c.potency)) ? String(c.potency) : '',
          repeat: REPEATS.includes(c.repetition) ? c.repetition : '',
        }));
      });

    // Nothing written yet? Offer the repertory's top pick, clearly labelled as
    // a suggestion rather than a decision.
    if (!items.length && b.remedy && b.remedy.name) {
      items.push(Object.assign(blankItem(), {
        remedy: b.remedy.bangla ? `${b.remedy.name} (${b.remedy.bangla})` : b.remedy.name,
        source: b.book ? `${b.book} — শীর্ষ ফল` : 'রিপার্টরির শীর্ষ ফল',
      }));
    }
  }

  function renderBridge() {
    const host = document.getElementById('rxBridge');
    const b = Shell.bridge.get();
    const c = Shell.store.get(CASE_KEY, null);
    const bits = [];
    if (c && c.patientName) bits.push(`কেস: <b>${esc(c.patientName)}</b>`);
    if (b && Array.isArray(b.rubrics) && b.rubrics.length)
      bits.push(`${bn(b.rubrics.length)}টি রুব্রিক`);
    if (b && b.remedy && b.remedy.name) bits.push(`শীর্ষ ওষুধ: <b>${esc(b.remedy.name)}</b>`);
    if (!bits.length) { host.hidden = true; return; }
    host.hidden = false;
    const short = (b && b.shortlist) || [];
    host.innerHTML = `
      <div class="cb-head">
        <i class='bx bx-transfer-alt'></i>
        <div><b>কেস ও রিপার্টরি থেকে নেওয়া হয়েছে</b>
          <span>${bits.join(' · ')}</span></div>
        <a class="btn ghost btn-sm" href="repertory.html"><i class='bx bx-book-bookmark'></i> রিপার্টরি</a>
      </div>
      ${short.length > 1 ? `<div class="cb-chips">
        ${short.slice(0, 8).map(r => `<button class="cb-chip" data-rx="${esc(r.name)}"
            data-bn="${esc(r.bangla || '')}" title="ঔষধের ঘরে বসান">
            <span class="cb-chip-lbl">${bn(r.total)}</span>${esc(r.bangla || r.name)}</button>`).join('')}
      </div>` : ''}`;
    host.querySelectorAll('[data-rx]').forEach(btn => btn.addEventListener('click', () => {
      const label = btn.dataset.bn ? `${btn.dataset.rx} (${btn.dataset.bn})` : btn.dataset.rx;
      const empty = items.findIndex(i => !i.remedy.trim());
      const row = Object.assign(blankItem(), { remedy: label, source: 'রিপার্টরির তালিকা' });
      if (empty >= 0) items[empty] = row; else items.push(row);
      renderItems(); paint();
      Shell.toast(`${btn.dataset.bn || btn.dataset.rx} ঔষধের ঘরে বসানো হয়েছে।`, 'ok');
    }));
  }

  /* ==================== persistence ==================== */
  function fields() {
    const o = {};
    form.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.name) o[el.name] = el.value;
    });
    return o;
  }

  let t = null;
  function saveDraft() {
    clearTimeout(t);
    t = setTimeout(() => {
      Shell.store.set(DRAFT_KEY, { fields: fields(), items: items });
      // the letterhead is worth remembering across prescriptions
      const f = fields();
      Shell.store.set(DOC_KEY, {
        docName: f.docName, docQual: f.docQual, docReg: f.docReg,
        docPhone: f.docPhone, docClinic: f.docClinic,
      });
    }, 400);
  }

  function asText() {
    const L = [];
    L.push('প্রেসক্রিপশন');
    if (val('docName')) L.push(`${val('docName')}${val('docQual') ? ', ' + val('docQual') : ''}`);
    if (val('docClinic')) L.push(val('docClinic'));
    L.push('');
    L.push(`রোগী: ${val('patientName') || '—'}   বয়স/লিঙ্গ: ${[val('age'), val('gender')].filter(Boolean).join(' / ') || '—'}`);
    L.push(`কেস নং: ${val('caseNo') || '—'}   তারিখ: ${bnDate(val('rxDate')) || '—'}`);
    if (val('diagnosis')) L.push(`সংক্ষেপ: ${val('diagnosis')}`);
    L.push('');
    L.push('Rx');
    items.filter(i => i.remedy.trim()).forEach((it, n) => {
      const bits = [it.potency, it.form].filter(Boolean).join(' · ');
      const how = [it.repeat, it.when, it.days].filter(Boolean).join(' · ');
      L.push(`  ${bn(n + 1)}. ${it.remedy}${bits ? ' — ' + bits : ''}`);
      if (how) L.push(`      ${how}`);
      if (it.note) L.push(`      (${it.note})`);
    });
    if (val('dietAdvice')) { L.push(''); L.push(`খাদ্য ও জীবনযাপন: ${val('dietAdvice')}`); }
    if (val('generalAdvice')) { L.push(`নির্দেশনা: ${val('generalAdvice')}`); }
    const fu = [val('followUp'), bnDate(val('followUpDate'))].filter(Boolean).join(' · ');
    if (fu) { L.push(''); L.push(`পরবর্তী সাক্ষাৎ: ${fu}`); }
    return L.join('\n');
  }

  function renderSaved() {
    const list = Shell.store.get(SAVED_KEY, []) || [];
    const wrap = document.getElementById('savedWrap');
    const host = document.getElementById('savedList');
    if (!list.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    host.innerHTML = list.map((r, i) => `
      <div class="recent-row">
        <span class="recent-ic"><i class='bx bx-receipt'></i></span>
        <span class="recent-txt">
          <b>${esc(r.patient || 'নামহীন')}${r.caseNo ? ' · ' + esc(r.caseNo) : ''}</b>
          <span>${esc(bnDate(r.date))} — ${esc(r.summary || '')}</span></span>
        <button class="btn ghost btn-sm" data-load="${i}" type="button">খুলুন</button>
        <button class="btn ghost btn-sm danger" data-drop="${i}" type="button"><i class='bx bx-trash'></i></button>
      </div>`).join('');
    host.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
      const r = list[+b.dataset.load];
      Object.entries(r.fields || {}).forEach(([k, v]) => { const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v || ''; });
      items = (r.items || []).map(x => Object.assign(blankItem(), x));
      renderItems(); paint();
      Shell.toast('সংরক্ষিত প্রেসক্রিপশন খোলা হয়েছে।', 'ok');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    host.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => {
      list.splice(+b.dataset.drop, 1);
      Shell.store.set(SAVED_KEY, list);
      renderSaved();
    }));
  }

  /* ==================== wiring ==================== */
  function bind() {
    form.addEventListener('input', paint);
    form.addEventListener('change', paint);

    document.getElementById('addRxBtn').addEventListener('click', () => {
      items.push(blankItem()); renderItems(); paint();
    });

    document.getElementById('printRx').addEventListener('click', () => {
      if (!items.some(i => i.remedy.trim())) {
        Shell.toast('অন্তত একটি ঔষধ লিখুন।', 'warn'); return;
      }
      window.print();
    });

    document.getElementById('copyRx').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(asText()); Shell.toast('প্রেসক্রিপশন কপি হয়েছে।', 'ok'); }
      catch (e) { Shell.toast('কপি করা যায়নি।', 'err'); }
    });

    document.getElementById('saveRx').addEventListener('click', () => {
      const meds = items.filter(i => i.remedy.trim());
      if (!meds.length) { Shell.toast('অন্তত একটি ঔষধ লিখুন।', 'warn'); return; }
      const list = Shell.store.get(SAVED_KEY, []) || [];
      list.unshift({
        patient: val('patientName'), caseNo: val('caseNo'), date: val('rxDate'),
        summary: meds.map(m => `${m.remedy}${m.potency ? ' ' + m.potency : ''}`).join(', ').slice(0, 90),
        fields: fields(), items: items,
      });
      Shell.store.set(SAVED_KEY, list.slice(0, 40));   // keep the list usable
      renderSaved();
      Shell.toast('প্রেসক্রিপশন সংরক্ষিত হয়েছে।', 'ok');
    });

    document.getElementById('clearRx').addEventListener('click', () => {
      if (!confirm('এই প্রেসক্রিপশনের লেখা মুছে যাবে। চিকিৎসকের তথ্য ও সংরক্ষিত তালিকা থাকবে। ঠিক আছে?')) return;
      Shell.store.del(DRAFT_KEY);
      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.name || el.name.startsWith('doc')) return;   // keep the letterhead
        el.value = '';
      });
      items = [blankItem()];
      setVal('rxDate', todayISO());
      renderItems(); paint();
      Shell.toast('মুছে ফেলা হয়েছে।', 'ok');
    });
  }

  function boot() {
    prefill();
    renderBridge();
    renderItems();
    bind();
    paint();
    renderSaved();
    const n = items.filter(i => i.remedy.trim()).length;
    Shell.setChip(n ? `${bn(n)}টি ঔষধ` : 'নতুন প্রেসক্রিপশন', 'bx-receipt', !n);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
