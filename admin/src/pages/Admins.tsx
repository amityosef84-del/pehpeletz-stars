import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface AdminRow {
  user_id: string;
  email: string;
  role: 'owner' | 'staff';
  created_at: string;
  last_sign_in_at: string | null;
  me: boolean;
}

async function api(method: 'GET' | 'POST', body?: unknown) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch('/api/admin-users', {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'הפעולה נכשלה');
  return json;
}

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
    : 'עוד לא נכנס/ה';

export function Admins({ demo }: { demo: boolean }) {
  const [users, setUsers] = useState<AdminRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('owner');
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
      ]);
      setCanManage(true);
      return;
    }
    try {
      const r = await api('GET');
      setUsers(r.users);
      setCanManage(r.canManage);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [demo]);

  useEffect(() => {
    // טעינה ראשונית מהשרת
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function run(label: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      if (demo) throw new Error('בתצוגת דוגמה אין שמירה');
      await api('POST', body);
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
    if (
      await run(`${email.trim()} נוסף/ה. אפשר להיכנס מיד עם הסיסמה שקבעת.`, {
        action: 'add',
        email,
        password,
        role,
      })
    ) {
      setEmail('');
      setPassword('');
    }
  }

  async function reset(u: AdminRow) {
    const pw = window.prompt(`סיסמה חדשה ל-${u.email} (לפחות 8 תווים):`);
    if (pw)
      await run(`הסיסמה של ${u.email} עודכנה`, {
        action: 'reset',
        userId: u.user_id,
        password: pw,
      });
  }

  async function remove(u: AdminRow) {
    if (window.confirm(`להסיר את הגישה של ${u.email}?`))
      await run(`הגישה של ${u.email} הוסרה`, { action: 'remove', userId: u.user_id });
  }

  async function changeMine(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (myPw.length < 8) return setMsg({ ok: false, text: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
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

      <section className="panel">
        <h2 className="panel__title">מי יכול להיכנס</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="רשימת מנהלים">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">מייל</th>
                <th scope="col">הרשאה</th>
                <th scope="col">כניסה אחרונה</th>
                {canManage && <th scope="col">פעולות</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td>
                    {u.email} {u.me && <span className="muted">(את/ה)</span>}
                  </td>
                  <td>{u.role === 'owner' ? 'בעלים' : 'צוות'}</td>
                  <td>{fmt(u.last_sign_in_at)}</td>
                  {canManage && (
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn--link"
                        onClick={() => reset(u)}
                        disabled={busy}
                      >
                        איפוס סיסמה
                      </button>
                      {!u.me && (
                        <button
                          type="button"
                          className="btn btn--link danger"
                          onClick={() => remove(u)}
                          disabled={busy}
                        >
                          הסרה
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && (
        <section className="panel">
          <h2 className="panel__title">הוספת מנהל</h2>
          <p className="muted">
            בלי מייל אישור: קובעים כאן סיסמה, ומוסרים אותה למנהל החדש בעל פה או בהודעה.
          </p>
          <form className="form-row" onSubmit={add} noValidate>
            <label>
              מייל
              <input
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              סיסמה (לפחות 8 תווים)
              <input
                type="text"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              הרשאה
              <select value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}>
                <option value="owner">בעלים (כולל ניהול מנהלים)</option>
                <option value="staff">צוות (צפייה בלבד)</option>
              </select>
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              הוספה
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">שינוי הסיסמה שלי</h2>
        <form className="form-row" onSubmit={changeMine} noValidate>
          <label>
            סיסמה חדשה
            <input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={myPw}
              onChange={(e) => setMyPw(e.target.value)}
              minLength={8}
            />
          </label>
          <button type="submit" className="btn">
            עדכון
          </button>
        </form>
      </section>
    </div>
  );
}
