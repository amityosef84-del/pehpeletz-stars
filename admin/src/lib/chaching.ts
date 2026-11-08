/**
 * צליל המכירה: הקובץ /admin/sounds/sale.mp3 (נטען פעם אחת לזיכרון).
 * אם הקובץ עוד לא נטען או נכשל, מושמע "קאצ'ינג" מסונתז ב-Web Audio כגיבוי.
 * דפדפנים דורשים לחיצה אחת של המשתמש לפני השמעת צליל: unlockAudio() בלחיצה על "הפעלת צליל".
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

const SOUND_URL = '/admin/sounds/sale.mp3';
let sale: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function loadSale(a: AudioContext): Promise<void> {
  loading ??= fetch(SOUND_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => a.decodeAudioData(b))
    .then((buf) => {
      sale = buf;
    })
    .catch(() => {
      loading = null; // ננסה שוב בפעם הבאה; בינתיים הצליל המסונתז
    });
  return loading;
}

export async function unlockAudio(): Promise<boolean> {
  const a = audio();
  if (!a) return false;
  if (a.state === 'suspended') await a.resume();
  void loadSale(a);
  return a.state === 'running';
}

function noiseBuffer(a: AudioContext, seconds: number) {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** פעמון מתכתי: צליל בסיס + עליונים לא הרמוניים, דעיכה מהירה */
function bell(a: AudioContext, out: AudioNode, t: number, freq: number, gain: number) {
  const partials = [1, 2.76, 5.4, 8.93];
  partials.forEach((ratio, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    const level = gain / (i + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1 / (i * 0.6 + 1));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.3);
  });
}

export function playChaChing(volume = 0.8) {
  const a = audio();
  if (!a || a.state !== 'running') return false;
  if (sale) {
    const src = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = Math.min(1, volume * 1.25);
    src.buffer = sale;
    src.connect(g).connect(a.destination);
    src.start();
    return true;
  }
  void loadSale(a);
  return synth(a, volume);
}

function synth(a: AudioContext, volume: number) {
  const t = a.currentTime + 0.02;
  const master = a.createGain();
  master.gain.value = volume;
  master.connect(a.destination);

  // "קא": הקפיץ של המגירה
  const click = a.createBufferSource();
  click.buffer = noiseBuffer(a, 0.06);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 3;
  const cg = a.createGain();
  cg.gain.setValueAtTime(0.9, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  click.connect(bp).connect(cg).connect(master);
  click.start(t);

  // "צ'ינג": שני פעמונים
  bell(a, master, t + 0.07, 2093, 0.5);
  bell(a, master, t + 0.19, 2637, 0.45);

  // מטבעות
  for (let i = 0; i < 6; i++) {
    const ct = t + 0.3 + i * 0.045 + Math.random() * 0.02;
    bell(a, master, ct, 3500 + Math.random() * 1800, 0.08);
  }
  return true;
}
