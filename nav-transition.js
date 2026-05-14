/* ─── FinSphere — Shared Navigation & Transition ─── */

/* Sidebar toggle (mobile) */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

/* Smooth page transition on navigation */
(function () {
  const mainWrap = document.querySelector('.main-wrap');
  if (!mainWrap) return;

  /* Fade-in on load */
  mainWrap.style.opacity = '0';
  mainWrap.style.transform = 'translateX(18px)';
  mainWrap.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mainWrap.style.opacity = '1';
      mainWrap.style.transform = 'translateX(0)';
    });
  });

  /* Fade-out before navigation */
  document.querySelectorAll('a.nav-item[href], .sidebar-signout[href]').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href || href === '#') return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      mainWrap.style.opacity = '0';
      mainWrap.style.transform = 'translateX(-18px)';
      setTimeout(function () {
        window.location.href = href;
      }, 220);
    });
  });
})();
