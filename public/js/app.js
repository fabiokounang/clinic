document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('.js-submit-form');

  forms.forEach((form) => {
    form.addEventListener('submit', () => {
      const button = form.querySelector('.js-submit-button');

      if (button) {
        const loadingText = button.getAttribute('data-loading-text') || 'Processing...';
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = loadingText;
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
      }
    });
  });

  const toggleButton = document.querySelector('[data-mobile-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');

  if (toggleButton && mobileMenu) {
    toggleButton.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  const sidebar = document.querySelector('[data-admin-sidebar]');
  const sidebarBackdrop = document.querySelector('[data-admin-sidebar-backdrop]');
  const sidebarToggles = document.querySelectorAll('[data-admin-sidebar-toggle]');
  const sidebarCloses = document.querySelectorAll('[data-admin-sidebar-close]');

  function openAdminSidebar() {
    if (!sidebar || !sidebarBackdrop) return;
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    sidebarBackdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden', 'lg:overflow-auto');
  }

  function closeAdminSidebar() {
    if (!sidebar || !sidebarBackdrop) return;
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    sidebarBackdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  sidebarToggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const isOpen = sidebar && sidebar.classList.contains('translate-x-0');
      if (isOpen) {
        closeAdminSidebar();
      } else {
        openAdminSidebar();
      }
    });
  });

  sidebarCloses.forEach((btn) => btn.addEventListener('click', closeAdminSidebar));

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeAdminSidebar);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAdminSidebar();
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      sidebarBackdrop?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  });
});