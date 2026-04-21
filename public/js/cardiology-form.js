(function () {
  'use strict';

  function syncExamBlock(block) {
    if (!block) return;
    var checked = block.querySelector('input[data-exam-mode]:checked');
    var mode = checked && checked.value === 'pdf' ? 'pdf' : 'text';
    var textPanel = block.querySelector('[data-exam-panel="text"]');
    var pdfPanel = block.querySelector('[data-exam-panel="pdf"]');
    if (textPanel) textPanel.classList.toggle('hidden', mode === 'pdf');
    if (pdfPanel) pdfPanel.classList.toggle('hidden', mode !== 'pdf');
  }

  document.querySelectorAll('[data-exam-block]').forEach(function (block) {
    block.addEventListener('change', function (e) {
      if (e.target && e.target.matches && e.target.matches('[data-exam-mode]')) {
        syncExamBlock(block);
      }
    });
    syncExamBlock(block);
  });

  function clearInputs(root) {
    root.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else {
        el.value = '';
      }
    });
  }

  document.querySelectorAll('[data-clinical-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sel = btn.getAttribute('data-clinical-add');
      var container = sel ? document.querySelector(sel) : null;
      if (!container) return;
      var first = container.querySelector('[data-clinical-row]');
      if (!first) return;
      var clone = first.cloneNode(true);
      clearInputs(clone);
      container.appendChild(clone);
    });
  });

  document.addEventListener('click', function (e) {
    var removeBtn = e.target.closest('[data-clinical-remove]');
    if (!removeBtn) return;
    var row = removeBtn.closest('[data-clinical-row]');
    var container = row && row.parentElement;
    if (!container || !row) return;
    var rows = container.querySelectorAll('[data-clinical-row]');
    if (rows.length > 1) {
      row.remove();
    } else {
      clearInputs(row);
    }
  });

  function appendSecondaryDiagnosis() {
    var addInput = document.getElementById('pf-secondary-add');
    var target = document.getElementById('pf-secondary');
    if (!addInput || !target) return;
    var val = (addInput.value || '').trim();
    if (!val) return;
    var next = (target.value || '').trim();
    target.value = next ? next + '\n' + val : val;
    addInput.value = '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var secondaryAddBtn = document.getElementById('pf-secondary-add-btn');
  if (secondaryAddBtn) {
    secondaryAddBtn.addEventListener('click', appendSecondaryDiagnosis);
  }
  var secondaryAddInput = document.getElementById('pf-secondary-add');
  if (secondaryAddInput) {
    secondaryAddInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        appendSecondaryDiagnosis();
      }
    });
  }

  function getCheckedRiskLabels() {
    var labels = [];
    document.querySelectorAll('.chips-risk .chip-input').forEach(function (input) {
      if (!input.checked) return;
      var label = input.closest('label');
      var textEl = label && label.querySelector('.chip-label');
      var text = textEl ? (textEl.textContent || '').trim() : '';
      if (text) labels.push(text);
    });
    return labels;
  }

  function buildSoapClinicalNotes() {
    var sMain = (document.getElementById('soap-s-main') || {}).value || '';
    var sCurrent = (document.getElementById('soap-s-current') || {}).value || '';
    var sHistory = (document.getElementById('soap-s-history') || {}).value || '';
    var oVitals = (document.getElementById('soap-o-vitals') || {}).value || '';
    var pTherapy = (document.getElementById('soap-p-therapy') || {}).value || '';
    var diagnosisMain = (document.getElementById('pf-primary') || {}).value || '';
    var diagnosisSecondary = (document.getElementById('pf-secondary') || {}).value || '';
    var cardiacHistory = (document.getElementById('pf-cardiac') || {}).value || '';

    var meds = [];
    document.querySelectorAll('#med-rows [data-clinical-row]').forEach(function (row) {
      var n = (row.querySelector('input[name="med_name"]') || {}).value || '';
      var d = (row.querySelector('input[name="med_dose"]') || {}).value || '';
      var f = (row.querySelector('input[name="med_freq"]') || {}).value || '';
      var parts = [n.trim(), d.trim(), f.trim()].filter(Boolean);
      if (parts.length) meds.push('- ' + parts.join(' · '));
    });

    var risk = getCheckedRiskLabels();
    var lines = [
      'Subjective (S)',
      '- Keluhan Utama: ' + (sMain.trim() || '-'),
      '- Keluhan Saat Ini: ' + (sCurrent.trim() || '-'),
      '- Riwayat Pengobatan: ' + (sHistory.trim() || '-'),
      '- Riwayat Penyakit/Tindakan: ' + (cardiacHistory.trim() || '-'),
      '- Faktor Risiko: ' + (risk.length ? risk.join(', ') : '-'),
      '',
      'Objective (O)',
      '- Tanda Vital:',
      (oVitals.trim() || '-'),
      '',
      'Assessment (A)',
      '- Diagnosa Utama: ' + (diagnosisMain.trim() || '-'),
      '- Diagnosa Sekunder:',
      (diagnosisSecondary.trim() || '-'),
      '',
      'Plan (P)',
      '- Terapi: ' + (pTherapy.trim() || '-'),
      '- Obat:',
      meds.length ? meds.join('\n') : '-'
    ];
    return lines.join('\n');
  }

  var soapForm = document.querySelector('[data-soap-form]');
  if (soapForm) {
    var form = soapForm.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        var hiddenNotes = document.getElementById('soap-clinical-notes');
        if (hiddenNotes) {
          hiddenNotes.value = buildSoapClinicalNotes();
        }
      });
    }
  }
})();
