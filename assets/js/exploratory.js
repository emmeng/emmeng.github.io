/* ══════════════════════════════════════════
   EXPLORATORY PROJECTS — exploratory.js
   ══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Lazy-load + fade-in for images ──
  const imgs = document.querySelectorAll('.project-media img');

  const imgObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const img = e.target;
      const onLoad = () => img.classList.add('loaded');
      if (img.complete) { onLoad(); }
      else { img.addEventListener('load', onLoad, { once: true }); }
      imgObserver.unobserve(img);
    });
  }, { rootMargin: '300px' });

  imgs.forEach(img => imgObserver.observe(img));

  // ── Scroll-triggered reveal for project rows ──
  const rows = document.querySelectorAll('.project-row');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  rows.forEach(row => revealObserver.observe(row));

});
