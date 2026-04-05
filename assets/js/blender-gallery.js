/* ══════════════════════════════════════════
   3D MODELING GALLERY — gallery.js
   ══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Lazy-load + fade-in for images ──
  const imgs = document.querySelectorAll('.gallery-item img');

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

  // ── Scroll-triggered reveal for gallery items ──
  const items = document.querySelectorAll('.gallery-item');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  items.forEach(item => revealObserver.observe(item));

});