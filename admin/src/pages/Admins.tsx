import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PasswordField } from '../components/PasswordField';
import { passwordProblem } from '../lib/password';
import { supabase } from '../lib/supabase';

interface AdminRow {
  user_id: string;
  email: string;
  role: 'owner' | 'staff';
  created_at: string;
  last_sign_in_at: string | null;
  me: boolean;
}

export async function adminApi(path: string, method: 'GET' | 'POST', body?: unknown) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('פג תוקף ההתחברות. התנתקו והתחברו שוב.');
  if (!res.ok) throw new Error(json.error ?? 'הפעולה נכשלה');
  return json;
}

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
    : 'עוד לא נכנס/ה';
const LOGIN_URL = `${location.origin}/admin/`;

interface Credentials {
  email: string;
  password: string;
}

function CredentialsCard({ c, onClose }: { c: Credentials; onClose: () => void }) {
  const text = `כניסה למערכת הניהול של פהפלצת\n${LOGIN_URL}\nמייל: ${c.email}\nסיסמה: ${c.password}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel creds" aria-label="פרטי כניסה למסירה">
      <h2 className="panel__title">פרטי הכניסה מוכנים למסירה</h2>
      <pre className="creds__box" dir="rtl">
        {text}
      </pre>
      <div className="alerts-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? 'הועתק ✓' : 'העתקת הפרטים'}
        </button>
        <a
          className="btn"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener"
        >
          שליחה בוואטסאפ
        </a>
        <button type="button" className="btn btn--link" onClick={onClose}>
          סגירה
        </button>
      </div>
      <p className="muted small">
        הסיסמה לא נשמרת אצלנו בגלוי ולא תוצג שוב. אפשר תמיד לקבוע חדשה ב"איפוס סיסמה".
      </p>
    </section>
  );
}

export function Admins({ demo }: { demo: boolean }) {
  const [users, setUsers] = useState<AdminRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('owner');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [myPw, setMyPw] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      setUsers([
        {
          user_id: '1',
          email: 'owner@example.com',
          role: 'owner',
          created_at: '',
          last_sign_in_at: new Date().toISOString(),
          me: true,
        },
        {
          user_id: '2',
          email: 'team@example.com',
          role: 'staff',
          created_at: '',
          last_sign_in_at: null,
          me: false,
        },
      ]);
      setCanManage(true);
      setLoaded(true);
      return;
    }
    try {
      const r = await adminApi('/api/admin-users', 'GET');
      setUsers(r.users);
      setCanManage(r.canManage);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setLoaded(true);
    }
  }, [demo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function run(label: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      if (demo) throw new Error('בתצוגת דוגמה אין שמירה');
      await adminApi('/api/admin-users', 'POST', body);
      setMsg({ ok: true, text: label });
      await load();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      return setMsg({ ok: false, text: 'כתובת מייל לא תקינה' });
    if (p) return setMsg({ ok: false, text: `הסיסמה ${p}` });
    const c = { email: email.trim().toLowerCase(), password };
    if (
      await run(`${c.email} נוסף/ה ויכול/ה להיכנס עכשיו`, {
        action: 'add',
        email: c.email,
        password,
        role,
      })
    ) {
      setCreds(c);
      setEmail('');
      setPassword('');
    }
  }

  async function saveReset(u: AdminRow) {
    const p = passwordProblem(resetPw);
    if (p) return setMsg({ ok: false, text: `הסיסמה ${p}` });
    if (
      await run(`הסיסמה של ${u.email} עודכנה`, {
        action: 'reset',
        userId: u.user_id,
        password: resetPw,
      })
    ) {
      if (!u.me) setCreds({ email: u.email, password: resetPw });
      setResetFor(null);
      setResetPw('');
    }
  }

  async function remove(u: AdminRow) {
    if (window.confirm(`להסיר את הגישה של ${u.email}?`)) {
      await run(`הגישה של ${u.email} הוסרה`, { action: 'remove', userId: u.user_id });
    }
  }

  async function changeMine(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const p = passwordProblem(myPw);
    if (p) return setMsg({ ok: false, text: `הסיסמה ${p}` });
    if (demo || !supabase) return setMsg({ ok: false, text: 'בתצוגת דוגמה אין שמירה' });
    const { error } = await supabase.auth.updateUser({ password: myPw });
    setMsg(
      error ? { ok: false, text: 'עדכון הסיסמה נכשל' } : { ok: true, text: 'הסיסמה שלך עודכנה' },
    );
    if (!error) setMyPw('');
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>מנהלים</h1>
      </header>
      {msg && (
        <p className={msg.ok ? 'notice notice--ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {creds && <CredentialsCard c={creds} onClose={() => setCreds(null)} />}

      {canManage && (
        <section className="panel">
          <h2 className="panel__title">הוספת מנהל</h2>
          <p className="muted">
            בלי מייל אישור: קובעים סיסמה, לוחצים "הוספה", ושולחים את הפרטים בוואטסאפ.
          </p>
          <form className="stack" onSubmit={add} noValidate>
            <label className="field">
              מייל
              <input
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <PasswordField label="סיסמה" value={password} onChange={setPassword} generator />
            <label className="field">
              הרשאה
              <select value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}>
                <option value="owner">בעלים: הכל, כולל ניהול מנהלים</option>
                <option value="staff">צוות: הזמנות ולקוחות, בלי מוצרים והגדרות</option>
              </select>
            </label>
            <div>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'מוסיף…' : 'הוספה'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">מי יכול להיכנס</h2>
        {!loaded && <p className="muted">טוען…</p>}
        <ul className="admins">
          {users.map((u) => (
            <li key={u.user_id} className="admins__item">
              <div className="admins__row">
                <div>
                  <p className="admins__email" dir="ltr">
                    {u.email}
                  </p>
                  <p className="muted small">
                    {u.role === 'owner' ? 'בעלים' : 'צוות'} · כניסה אחרונה: {fmt(u.last_sign_in_at)}{' '}
                    {u.me && '· (את/ה)'}
                  </p>
                </div>
                {canManage && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      aria-expanded={resetFor === u.user_id}
                      onClick={() => {
                        setResetFor(resetFor === u.user_id ? null : u.user_id);
                        setResetPw('');
                      }}
                    >
                      איפוס סיסמה
                    </button>
                    {!u.me && (
                      <button
                        type="button"
                        className="btn btn--small danger"
                        onClick={() => remove(u)}
                        disabled={busy}
                      >
                        הסרה
                      </button>
                    )}
                  </div>
                )}
              </div>
              {resetFor === u.user_id && (
                <div className="admins__reset">
                  <PasswordField
                    label={`סיסמה חדשה ל-${u.email}`}
                    value={resetPw}
                    onChange={setResetPw}
                    generator
                  />
                  <div className="alerts-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => saveReset(u)}
                      disabled={busy}
                    >
                      שמירת הסיסמה
                    </button>
                    <button
                      type="button"
                      className="btn btn--link"
                      onClick={() => setResetFor(null)}
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">שינוי הסיסמה שלי</h2>
        <form className="stack" onSubmit={changeMine} noValidate>
          <PasswordField label="סיסמה חדשה" value={myPw} onChange={setMyPw} />
          <div>
            <button type="submit" className="btn">
              עדכון
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
