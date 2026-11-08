import { useState, type FormEvent } from 'react';
import { PasswordField } from '../components/PasswordField';
import { passwordProblem } from '../lib/password';
import { supabase } from '../lib/supabase';

/** אחרי קישור הזמנה / איפוס: בחירת סיסמה (חובה לפני הכניסה) */
export function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password);
    if (p) return setError(`הסיסמה ${p}`);
    if (password !== confirm) return setError('שתי הסיסמאות לא זהות');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) setError('לא הצלחנו לשמור את הסיסמה. נסו שוב.');
    else onDone();
  }

  return (
    <main className="login">
      <form className="login__box" onSubmit={submit} noValidate>
        <h1>בחירת סיסמה</h1>
        <p className="muted">
          לחשבון <b dir="ltr">{email}</b>. מהפעם הבאה נכנסים עם המייל והסיסמה הזו.
        </p>
        <PasswordField label="סיסמה חדשה" value={password} onChange={setPassword} />
        <PasswordField label="שוב, לאימות" value={confirm} onChange={setConfirm} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'שומר…' : 'שמירה וכניסה'}
        </button>
      </form>
    </main>
  );
}
