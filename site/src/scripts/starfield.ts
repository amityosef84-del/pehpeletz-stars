/**
 * שדה כוכבים ב-canvas מאחורי כל הדף.
 * - 3 שכבות עומק עם parallax לגלילה ולתנועת העכבר
 * - "קפיצת warp" קצרה בכניסה הראשונה לסשן
 * - כוכבים נופלים מדי פעם
 * חסכוני: נטען אחרי ה-load, נעצר כשהטאב מוסתר, DPR מוגבל, ובתנועה מופחתת מצויר פעם אחת בלבד.
 */

interface Star {
  x: number;
  y: number;
  z: number; // 0.15 (רחוק) .. 1 (קרוב)
  r: number;
  a: number;
  tw: number; // מהירות נצנוץ
  ph: number;
  c: number; // אינדקס צבע
}

const canvas = document.querySelector<HTMLCanvasElement>('[data-starfield]');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

if (canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (ctx) start(canvas, ctx);
}

function start(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const COLORS = ['255,255,255', '138,245,234', '255,224,138', '183,168,255'];
  const sprites = COLORS.map((c) => makeSprite(c));
  let stars: Star[] = [];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let mx = 0;
  let my = 0;
  let tmx = 0;
  let tmy = 0;
  let warpStart = 0;
  const WARP_MS = 1300;
  let shooting: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  let nextShoot = performance.now() + 4000;

  function makeSprite(rgb: string) {
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.18, `rgba(${rgb},0.85)`);
    grad.addColorStop(0.45, `rgba(${rgb},0.18)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return s;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.5 : 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(110, Math.min(380, Math.round((W * H) / 5200)));
    if (stars.length !== count) {
      stars = Array.from({ length: count }, () => {
        const z = Math.random() ** 1.8 * 0.85 + 0.15;
        const rnd = Math.random();
        return {
          x: Math.random(),
          y: Math.random(),
          z,
          r: 0.5 + z * 1.7 + (Math.random() < 0.04 ? 1.6 : 0),
          a: 0.35 + Math.random() * 0.65,
          tw: 0.6 + Math.random() * 2.2,
          ph: Math.random() * Math.PI * 2,
          c: rnd < 0.72 ? 0 : rnd < 0.86 ? 1 : rnd < 0.95 ? 2 : 3,
        };
      });
    }
    if (!running) draw(performance.now(), 0);
  }

  function draw(now: number, dt: number) {
    ctx.clearRect(0, 0, W, H);
    const scroll = window.scrollY;
    mx += (tmx - mx) * Math.min(1, dt * 0.004);
    my += (tmy - my) * Math.min(1, dt * 0.004);

    const warp = warpStart ? Math.max(0, 1 - (now - warpStart) / WARP_MS) : 0;
    const warpE = warp * warp * (3 - 2 * warp); // smoothstep
    const cx = W / 2;
    const cy = H * 0.42;

    for (const s of stars) {
      const px = s.x * W + mx * 18 * s.z;
      let py = (s.y * H - scroll * 0.12 * s.z + my * 12 * s.z) % H;
      if (py < 0) py += H;
      const twinkle = reduced.matches ? 1 : 0.65 + 0.35 * Math.sin(now * 0.001 * s.tw + s.ph);
      const alpha = s.a * twinkle;
      const size = s.r * 2.6;

      if (warpE > 0.01) {
        // קווים שנמתחים מהמרכז החוצה
        const dx = px - cx;
        const dy = py - cy;
        const len = warpE * 0.55 * s.z;
        ctx.strokeStyle = `rgba(${COLORS[s.c]},${alpha * (0.4 + warpE * 0.6)})`;
        ctx.lineWidth = Math.max(0.6, s.r * 0.9);
        ctx.beginPath();
        ctx.moveTo(px - dx * len, py - dy * len);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[s.c]!, px - size, py - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;

    // כוכב נופל
    if (!reduced.matches) {
      if (!shooting && now > nextShoot) {
        const fromLeft = Math.random() < 0.5;
        shooting = {
          x: fromLeft ? Math.random() * W * 0.4 : W * (0.6 + Math.random() * 0.4),
          y: Math.random() * H * 0.35,
          vx: (fromLeft ? 1 : -1) * (0.9 + Math.random() * 0.5),
          vy: 0.35 + Math.random() * 0.25,
          life: 1,
        };
        nextShoot = now + 6000 + Math.random() * 7000;
      }
      if (shooting) {
        const s = shooting;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt / 900;
        const tail = 110;
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
        grad.addColorStop(0, `rgba(255,240,200,${0.95 * s.life})`);
        grad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
        ctx.stroke();
        if (s.life <= 0) shooting = null;
      }
    }
  }

  function loop(now: number) {
    const dt = Math.min(64, now - last);
    last = now;
    draw(now, dt);
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (running || reduced.matches || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
  reduced.addEventListener('change', () => {
    stop();
    draw(performance.now(), 0);
    play();
  });
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      tmx = (e.clientX / W - 0.5) * 2;
      tmy = (e.clientY / H - 0.5) * 2;
    },
    { passive: true },
  );
  window.addEventListener(
    'scroll',
    () => {
      if (!running) draw(performance.now(), 0);
    },
    { passive: true },
  );

  const boot = () => {
    resize();
    let first = true;
    try {
      first = !sessionStorage.getItem('pp-warp');
      sessionStorage.setItem('pp-warp', '1');
    } catch {
      /* מצב פרטי / חסום: פשוט נראה את ה-warp */
    }
    if (first && !reduced.matches && window.scrollY < 50) warpStart = performance.now();
    play();
  };

  if (document.readyState === 'complete') queueMicrotask(boot);
  else window.addEventListener('load', boot, { once: true });
}
