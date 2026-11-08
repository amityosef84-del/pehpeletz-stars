/**
 * אפקטים של הדף. בלי ספריות, כמה KB בלבד.
 * - [data-reveal]: נחשף כשנכנס למסך
 * - [data-scene]: מקבל --p (0..1) לפי ההתקדמות שלו במסך, לסצנות גלילה ב-CSS
 * - [data-parallax]: מקבל --mx/--my (-1..1) לפי מיקום העכבר, לשכבות עומק
 * - [data-tilt]: הטיה תלת־ממדית בריחוף (עכבר בלבד)
 * - [data-burst]: פיצוץ כוכבים בלחיצה
 * - html.is-scrolled, html.sticky-on, --scroll (0..1) לפס ההתקדמות
 * בתנועה מופחתת: רק reveal מיידי ומצבי header/sticky.
 */

const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
root.classList.add('fx-ready');

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ---------- Reveal ----------
const revealEls = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (reduced || !('IntersectionObserver' in window)) {
  revealEls.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  revealEls.forEach((el) => io.observe(el));
}

// ---------- Scroll state ----------
const scenes = new Set<HTMLElement>();
const sceneEls = document.querySelectorAll<HTMLElement>('[data-scene]');
if (!reduced && sceneEls.length) {
  const sio = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) scenes.add(el);
        else scenes.delete(el);
      }
      requestTick();
    },
    { rootMargin: '20% 0px 20% 0px' },
  );
  sceneEls.forEach((el) => sio.observe(el));
} else {
  sceneEls.forEach((el) => el.style.setProperty('--p', '0.6'));
}

let ticking = false;
function requestTick() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(onFrame);
  }
}
function onFrame() {
  ticking = false;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const max = document.documentElement.scrollHeight - vh;
  root.classList.toggle('is-scrolled', y > 24);
  root.style.setProperty('--scroll', String(max > 0 ? clamp(y / max) : 0));
  for (const el of scenes) {
    const r = el.getBoundingClientRect();
    const p = clamp((vh - r.top) / (vh + r.height));
    el.style.setProperty('--p', p.toFixed(4));
  }
}
window.addEventListener('scroll', requestTick, { passive: true });
window.addEventListener('resize', requestTick, { passive: true });
requestTick();

// ---------- Sticky CTA (מובייל): גלוי אחרי ה-Hero, מוסתר מעל החבילות והפוטר ----------
const hero = document.querySelector('[data-hero]');
const hideZones = document.querySelectorAll('[data-sticky-hide]');
if (hero && 'IntersectionObserver' in window) {
  let heroVisible = true;
  const hidden = new Set<Element>();
  const update = () => root.classList.toggle('sticky-on', !heroVisible && hidden.size === 0);
  new IntersectionObserver(([e]) => {
    heroVisible = !!e?.isIntersecting;
    update();
  }).observe(hero);
  const zio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) hidden.add(e.target);
      else hidden.delete(e.target);
    }
    update();
  });
  hideZones.forEach((z) => zio.observe(z));
}

// ---------- Pointer parallax ----------
if (!reduced && finePointer) {
  const layers = document.querySelectorAll<HTMLElement>('[data-parallax]');
  layers.forEach((layer) => {
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    const step = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      layer.style.setProperty('--mx', cx.toFixed(3));
      layer.style.setProperty('--my', cy.toFixed(3));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    layer.addEventListener('pointermove', (e) => {
      const r = layer.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    });
    layer.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(step);
    });
  });

  // ---------- Tilt ----------
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

// ---------- Star burst ----------
export function burst(x: number, y: number, count = 16) {
  if (reduced) return;
  const colors = ['#ffe08a', '#ffc94a', '#8af5ea', '#ffffff', '#b7a8ff'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'fx-spark';
    s.setAttribute('aria-hidden', 'true');
    const size = 6 + Math.random() * 10;
    s.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${colors[i % colors.length]}`;
    document.body.appendChild(s);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 50 + Math.random() * 90;
    s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.2) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1) rotate(${Math.random() * 180}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 700 + Math.random() * 300,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'forwards',
      },
    ).onfinish = () => s.remove();
  }
}

document.addEventListener('click', (e) => {
  const t = (e.target as Element | null)?.closest<HTMLElement>('[data-burst]');
  if (!t) return;
  const r = t.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
  // מעבר חלק (View Transitions) של תמונת החבילה לעמוד התשלום
  const img = t.closest('[data-package]')?.querySelector<HTMLElement>('[data-vt-box]');
  if (img) img.style.viewTransitionName = 'kit-box';
});
