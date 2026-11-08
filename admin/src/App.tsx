import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { SetPassword } from './pages/SetPassword';
import { Analytics } from './pages/Analytics';

type Gate = 'loading' | 'anon' | 'set-password' | 'not-admin' | 'admin';

export function App() {
  const demo = new URLSearchParams(location.search).has('demo') && !configured;
  const [gate, setGate] = useState<Gate>(demo ? 'admin' : 'loading');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const check = async (s: Session | null) => {
      setSession(s);
      if (!s) return setGate('anon');
      const { data } = await supabase!.rpc('is_admin');
      setGate(data === true ? 'admin' : 'not-admin');
    };
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (
        event === 'PASSWORD_RECOVERY' ||
        (event === 'SIGNED_IN' && /type=(invite|recovery)/.test(location.hash))
      ) {
        setSession(s);
        setGate('set-password');
      } else check(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured && !demo) {
    return (
      <main className="login">
        <div className="login__box">
          <h1>מערכת הניהול</h1>
          <p>מסד הנתונים עוד לא מחובר לאתר. אחרי החיבור תופיע כאן כניסה עם אימייל וסיסמה.</p>
          <a className="btn btn--link" href="?demo">
            לתצוגה עם נתוני דוגמה
          </a>
        </div>
      </main>
    );
  }
  if (gate === 'loading') return <p className="muted center">טוען…</p>;
  if (gate === 'anon') return <Login />;
  if (gate === 'set-password') return <SetPassword onDone={() => setGate('admin')} />;
  if (gate === 'not-admin') {
    return (
      <main className="login">
        <div className="login__box">
          <h1>אין הרשאה</h1>
          <p>החשבון {session?.user.email} אינו מוגדר כמנהל.</p>
          <button className="btn btn--link" type="button" onClick={() => supabase?.auth.signOut()}>
            התנתקות
          </button>
        </div>
      </main>
    );
  }
  return (
    <div className="shell">
      <nav className="nav" aria-label="ניווט ראשי">
        <p className="nav__brand">פהפלצת · ניהול</p>
        <ul>
          <li>
            <a href="/admin/" aria-current="page">
              אנליטיקס
            </a>
          </li>
          <li className="nav__soon">הזמנות (שלב 4)</li>
          <li className="nav__soon">לקוחות (שלב 4)</li>
          <li className="nav__soon">מוצרים וקופונים (שלב 4)</li>
        </ul>
        {!demo && (
          <button
            className="btn btn--link nav__out"
            type="button"
            onClick={() => supabase?.auth.signOut()}
          >
            התנתקות
          </button>
        )}
      </nav>
      <main className="main">
        <Analytics demo={demo} />
      </main>
    </div>
  );
}
