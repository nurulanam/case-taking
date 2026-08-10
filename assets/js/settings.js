(function () {
  'use strict';

  const form = document.getElementById('settingsForm');
  const themePicker = document.getElementById('themePicker');
  const colorPicker = document.getElementById('colorPicker');

  const COLORS = [
    { id: 'teal', hex: '#0f766e', label: 'Teal' },
    { id: 'blue', hex: '#2563eb', label: 'Blue' },
    { id: 'purple', hex: '#7c3aed', label: 'Purple' },
    { id: 'orange', hex: '#ea580c', label: 'Orange' },
    { id: 'rose', hex: '#e11d48', label: 'Rose' }
  ];

  function init() {
    // 1. Load Doctor Profile
    const docInfo = Shell.store.get('rx_doctor_v1', {});
    ['docName', 'docQual', 'docReg', 'docPhone', 'docClinic'].forEach(name => {
      const el = form.elements[name];
      if (el && docInfo[name]) el.value = docInfo[name];
    });

    // 2. Setup Theme Picker
    const currentTheme = Shell.store.get('theme_preference', 'system');
    Array.from(themePicker.children).forEach(btn => {
      if (btn.dataset.val === currentTheme) btn.classList.add('active');
      btn.addEventListener('click', () => {
        Array.from(themePicker.children).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newTheme = btn.dataset.val;
        Shell.store.set('theme_preference', newTheme);
        
        let applyTheme = newTheme;
        if (newTheme === 'system') {
          applyTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.dataset.theme = applyTheme;
      });
    });

    // 3. Setup Color Picker
    const currentColor = Shell.store.get('theme_color_v1', 'teal');
    colorPicker.innerHTML = COLORS.map(c => `
      <div class="color-option ${c.id === currentColor ? 'active' : ''}" 
           data-val="${c.id}" 
           style="background: ${c.hex};" 
           title="${c.label}">
        <i class='bx bx-check'></i>
      </div>
    `).join('');

    Array.from(colorPicker.children).forEach(btn => {
      btn.addEventListener('click', () => {
        Array.from(colorPicker.children).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newColor = btn.dataset.val;
        Shell.store.set('theme_color_v1', newColor);
        document.documentElement.dataset.color = newColor;
      });
    });

    // 4. Handle Save Form
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        docName: form.elements['docName'].value.trim(),
        docQual: form.elements['docQual'].value.trim(),
        docReg: form.elements['docReg'].value.trim(),
        docPhone: form.elements['docPhone'].value.trim(),
        docClinic: form.elements['docClinic'].value.trim()
      };
      Shell.store.set('rx_doctor_v1', data);
      Shell.toast('সেটিংস সফলভাবে সংরক্ষিত হয়েছে', 'ok');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
