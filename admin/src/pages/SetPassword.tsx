import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/** אחרי קישור הזמנה / איפוס: בחירת סיסמה חדשה */
export function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError('לפחות 10 תווים');
      return;
    }
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) setError('לא הצלחנו לשמור את הסיסמה');
    else onDone();
  }
  return (
    <main className="login">
      <form className="login__box" onSubmit={submit} noValidate>
        <h1>בחירת סיסמה</h1>
        <label htmlFor="np">סיסמה חדשה</label>
        <input
          id="np"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary">
          שמירה
        </button>
      </form>
    </main>
  );
}
