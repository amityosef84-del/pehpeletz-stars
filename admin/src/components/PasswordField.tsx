import { useId, useState } from 'react';
import { generatePassword, passwordProblem } from '../lib/password';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** כפתור "יצירת סיסמה" + העתקה (כשמנהל קובע סיסמה למישהו אחר) */
  generator?: boolean;
  autoComplete?: string;
}

export function PasswordField({
  label,
  value,
  onChange,
  generator = false,
  autoComplete = 'new-password',
}: Props) {
  const id = useId();
  const [show, setShow] = useState(generator);
  const [copied, setCopied] = useState(false);
  const problem = value ? passwordProblem(value) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* מתעלמים */
    }
  }

  return (
    <div className="pw">
      <label htmlFor={id}>{label}</label>
      <div className="pw__row">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          dir="ltr"
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          aria-invalid={problem ? true : undefined}
        />
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
        >
          {show ? 'הסתרה' : 'הצגה'}
        </button>
        {generator && (
          <>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                onChange(generatePassword());
                setShow(true);
              }}
            >
              יצירת סיסמה
            </button>
            <button type="button" className="btn btn--small" onClick={copy} disabled={!value}>
              {copied ? 'הועתק ✓' : 'העתקה'}
            </button>
          </>
        )}
      </div>
      <p id={`${id}-hint`} className={problem ? 'error small' : 'muted small'}>
        {problem ? `הסיסמה ${problem}` : 'לפחות 8 תווים'}
      </p>
    </div>
  );
}
