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
})();
