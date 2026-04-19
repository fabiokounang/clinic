(function () {
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'share-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(function () {
      el.remove();
    }, 2600);
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-copy-url]');
    if (!btn) {
      return;
    }
    e.preventDefault();
    const url = btn.getAttribute('data-copy-url');
    if (!url) {
      return;
    }

    function fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Tautan disalin');
      } catch (err) {
        window.prompt('Salin tautan:', text);
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('Tautan disalin');
      }).catch(function () {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  });
})();
