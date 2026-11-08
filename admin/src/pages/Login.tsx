import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('אימייל או סיסמה שגויים');
  }

  async function reset() {
    if (!supabase || !email.trim()) {
      setError('הזינו אימייל ואז לחצו שוב');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/admin/`,
    });
    setError(
      error
        ? 'שליחת המייל נכשלה (מגבלת מיילים זמנית). נסו שוב בעוד שעה, או בקשו מבעל החשבון קישור כניסה ישיר.'
        : null,
    );
    setInfo(error ? null : 'אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה');
  }

  return (
    <main className="login">
      <form className="login__box" onSubmit={submit} noValidate>
        <h1>כניסה למערכת הניהול</h1>
        <label htmlFor="email">אימייל</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">סיסמה</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="muted" role="status">
            {info}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'מתחבר…' : 'כניסה'}
        </button>
        <button type="button" className="btn btn--link" onClick={reset}>
          שכחתי סיסמה
        </button>
      </form>
    </main>
  );
}
