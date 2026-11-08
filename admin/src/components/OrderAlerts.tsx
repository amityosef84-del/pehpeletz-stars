import { useCallback, useEffect, useRef, useState } from 'react';
import { playChaChing, unlockAudio } from '../lib/chaching';
import { ils } from '../lib/format';
import {
  disablePush,
  enablePush,
  pushState,
  registerSw,
  sendTestPush,
  type PushState,
} from '../lib/pushClient';
import { supabase } from '../lib/supabase';

interface Toast {
  id: string;
  number: number | string;
  total: number;
}

const SOUND_KEY = 'pp_admin_sound';
const readPref = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
};

/**
 * התראות על הזמנות: מאזין ל-Realtime על טבלת orders. כשהזמנה הופכת ל-paid:
 * צליל קאצ'ינג, הודעה עם מספר ההזמנה, והתראת מערכת אם האפליקציה ברקע.
 */
export function OrderAlerts({ demo }: { demo: boolean }) {
  const [soundOn, setSoundOn] = useState(readPref);
  const [audioReady, setAudioReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [push, setPush] = useState<PushState>('off');
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const seen = useRef(new Set<string>());
  const [started] = useState(() => Date.now());
  const soundRef = useRef(false);
  useEffect(() => {
    soundRef.current = soundOn && audioReady;
  }, [soundOn, audioReady]);

  const announce = useCallback((t: Toast) => {
    if (seen.current.has(t.id)) return;
    seen.current.add(t.id);
    setToasts((x) => [t, ...x].slice(0, 4));
    if (soundRef.current) playChaChing();
    if (
      document.visibilityState === 'hidden' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      navigator.serviceWorker?.getRegistration('/admin/').then((reg) =>
        reg?.showNotification(`💰 הזמנה חדשה #${t.number}`, {
          body: ils(t.total),
          tag: `order-${t.number}`,
          dir: 'rtl',
          lang: 'he',
        }),
      );
    }
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 12_000);
  }, []);

  // הצליל צריך לחיצה אחת כדי להיפתח; אם המשתמש כבר בחר "פועל", כל לחיצה ראשונה פותחת אותו
  useEffect(() => {
    if (!soundOn || audioReady) return;
    const onFirst = () => unlockAudio().then(setAudioReady);
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => window.removeEventListener('pointerdown', onFirst);
  }, [soundOn, audioReady]);

  useEffect(() => {
    registerSw();
    pushState().then(setPush);
  }, []);

  // Realtime
  useEffect(() => {
    if (demo || !supabase) return;
    const channel = supabase
      .channel('orders-paid')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => {
        const row = p.new as {
          id?: string;
          order_number?: number;
          total?: number;
          payment_status?: string;
          paid_at?: string;
        };
        if (!row?.id || row.payment_status !== 'paid') return;
        if (row.paid_at && new Date(row.paid_at).getTime() < started - 60_000) return;
        announce({ id: row.id, number: row.order_number ?? '', total: Number(row.total ?? 0) });
      })
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [demo, announce, started]);

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      /* מתעלמים */
    }
    if (next) {
      const ok = await unlockAudio();
      setAudioReady(ok);
      if (ok) playChaChing(0.6);
    }
  }

  async function togglePush() {
    setMsg(null);
    try {
      const s = push === 'on' ? await disablePush() : await enablePush();
      setPush(s);
      if (s === 'denied') setMsg('ההתראות חסומות בהגדרות הדפדפן. אפשר לאשר אותן בהגדרות האתר.');
      if (s === 'unsupported')
        setMsg('המכשיר לא תומך בהתראות. באייפון: קודם מתקינים את האפליקציה למסך הבית.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function testPush() {
    setMsg(null);
    try {
      const r = await sendTestPush();
      setMsg(r.sent ? 'נשלחה התראת בדיקה' : 'אין מכשירים רשומים. הפעילו קודם התראות לטלפון.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  function simulate() {
    unlockAudio().then((ok) => {
      setAudioReady(ok);
      announce({
        id: `demo-${Date.now()}`,
        number: 1000 + Math.floor(Math.random() * 900),
        total: 100,
      });
    });
  }

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <>
      <div className="alerts-bar">
        <button
          type="button"
          className={soundOn ? 'chip chip--on' : 'chip'}
          aria-pressed={soundOn}
          onClick={toggleSound}
        >
          {soundOn ? '🔔 צליל הזמנות פועל' : '🔕 הפעלת צליל הזמנות'}
        </button>
        <button
          type="button"
          className="chip"
          aria-expanded={open}
          aria-controls="alerts-panel"
          onClick={() => setOpen((v) => !v)}
        >
          📱 התראות לטלפון ואפליקציה
        </button>
      </div>

      {open && (
        <section id="alerts-panel" className="panel alerts-panel" aria-label="הגדרות התראות">
          <h2 className="panel__title">התראות על הזמנות חדשות</h2>
          <p className="muted">
            כשהזמנה משולמת תשמעו "קאצ'ינג" ותראו את מספר ההזמנה. כדי לקבל התראה גם כשהמסך סגור,
            מפעילים התראות לטלפון.
          </p>
          <div className="alerts-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={togglePush}
              disabled={push === 'unsupported' && !ios}
            >
              {push === 'on' ? 'כיבוי התראות במכשיר הזה' : 'הפעלת התראות במכשיר הזה'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={testPush}
              disabled={push !== 'on' || demo}
            >
              שליחת התראת בדיקה
            </button>
            <button type="button" className="btn" onClick={simulate}>
              השמעת קאצ'ינג לדוגמה
            </button>
          </div>
          {msg && (
            <p className="muted" role="status">
              {msg}
            </p>
          )}
          {!standalone && (
            <div className="install">
              <h3>התקנה כאפליקציה בטלפון</h3>
              {ios ? (
                <p>
                  באייפון (Safari): לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), בוחרים "הוספה למסך
                  הבית", ונכנסים מהאייקון. אחרי זה מפעילים כאן התראות.
                </p>
              ) : (
                <p>באנדרואיד (Chrome): תפריט ⋮ ← "התקנת האפליקציה" או "הוספה למסך הבית".</p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="toasts" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="alert">
            <span className="toast__icon" aria-hidden="true">
              💰
            </span>
            <div>
              <strong>הזמנה חדשה #{t.number}</strong>
              <span>{ils(t.total)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
