import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, needsPassword, passwordSet, supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { SetPassword } from './pages/SetPassword';
import { Analytics } from './pages/Analytics';
import { OrderAlerts } from './components/OrderAlerts';
import { Admins } from './pages/Admins';
import { Home } from './pages/Home';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { CustomerDetail, Customers } from './pages/Customers';
import { Products } from './pages/Products';
import { Coupons } from './pages/Coupons';
import { Abandoned } from './pages/Abandoned';
import { Settings } from './pages/Settings';
import { api } from './lib/store';

const NAV = [
  { key: 'home', label: 'בית' },
  { key: 'orders', label: 'הזמנות' },
  { key: 'abandoned', label: 'עגלות נטושות' },
  { key: 'customers', label: 'לקוחות' },
  { key: 'analytics', label: 'אנליטיקס' },
  { key: 'products', label: 'מוצרים', owner: true },
  { key: 'coupons', label: 'קופונים', owner: true },
  { key: 'settings', label: 'הגדרות', owner: true },
  { key: 'admins', label: 'מנהלים' },
] as const;
type View = (typeof NAV)[number]['key'];

/** ניתוב לפי hash: #orders, #orders/<id>, #customers/<id> ... */
function parseHash(): { view: View; id?: string } {
  const [v, id] = location.hash.replace(/^#\/?/, '').split('/');
  const view = (NAV.find((n) => n.key === v)?.key ?? 'home') as View;
  return { view, id: id || undefined };
}

type Gate = 'loading' | 'anon' | 'set-password' | 'not-admin' | 'admin';

export function App() {
  const demo = new URLSearchParams(location.search).has('demo') && !configured;
  const [gate, setGate] = useState<Gate>(demo ? 'admin' : 'loading');
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState(parseHash);
  const [role, setRole] = useState<'owner' | 'staff'>('owner');

  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (gate === 'admin') api.role(demo).then(setRole, () => setRole('staff'));
  }, [gate, demo]);

  useEffect(() => {
    if (!supabase) return;
    const check = async (s: Session | null) => {
      setSession(s);
      if (!s) return setGate('anon');
      // הגיע מקישור הזמנה/איפוס: קודם בוחרים סיסמה, ורק אז נכנסים
      if (needsPassword()) return setGate('set-password');
      const { data } = await supabase!.rpc('is_admin');
      setGate(data === true ? 'admin' : 'not-admin');
    };
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(s);
        setGate('set-password');
      } else if (event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') check(s);
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
  if (gate === 'set-password')
    return (
      <SetPassword
        email={session?.user.email ?? ''}
        onDone={async () => {
          passwordSet();
          const { data } = await supabase!.rpc('is_admin');
          setGate(data === true ? 'admin' : 'not-admin');
        }}
      />
    );
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
  const nav = NAV.filter((n) => !('owner' in n) || role === 'owner');
  const { view, id } = route;
  const page = (() => {
    if (view === 'orders')
      return id ? <OrderDetail key={id} demo={demo} id={id} /> : <Orders demo={demo} />;
    if (view === 'customers')
      return id ? <CustomerDetail key={id} demo={demo} id={id} /> : <Customers demo={demo} />;
    if (view === 'abandoned') return <Abandoned demo={demo} />;
    if (view === 'analytics') return <Analytics demo={demo} />;
    if (view === 'admins') return <Admins demo={demo} />;
    if (role === 'owner' && view === 'products') return <Products demo={demo} />;
    if (role === 'owner' && view === 'coupons') return <Coupons demo={demo} />;
    if (role === 'owner' && view === 'settings') return <Settings demo={demo} />;
    return <Home demo={demo} />;
  })();

  return (
    <div className="shell">
      <a className="skip" href="#main">
        דילוג לתוכן
      </a>
      <nav className="nav" aria-label="ניווט ראשי">
        <p className="nav__brand">פהפלצת · ניהול</p>
        <ul>
          {nav.map((n) => (
            <li key={n.key}>
              <a
                className="nav__link"
                href={`#${n.key === 'home' ? '' : n.key}`}
                aria-current={view === n.key ? 'page' : undefined}
              >
                {n.label}
              </a>
            </li>
          ))}
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
      <main className="main" id="main" tabIndex={-1}>
        <OrderAlerts demo={demo} />
        {page}
      </main>
    </div>
  );
}
