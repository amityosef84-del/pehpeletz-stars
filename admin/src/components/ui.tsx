import { useState, type ReactNode } from 'react';
import { STATUS_LABELS, type OrderStatus } from '@pehpeletz/shared';
import { PAY_LABELS } from '../lib/format';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`st st--${status}`}>{STATUS_LABELS[status]}</span>;
}
export function PayBadge({ status }: { status: string }) {
  return <span className={`st st--pay-${status}`}>{PAY_LABELS[status] ?? status}</span>;
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  if (error)
    return (
      <div className="panel">
        <p className="error" role="alert">
          {error}
        </p>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>
            נסו שוב
          </button>
        )}
      </div>
    );
  return <p className="muted">טוען…</p>;
}

export type Msg = { ok: boolean; text: string } | null;
export function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={msg.ok ? 'notice notice--ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>
      {msg.text}
    </p>
  );
}

/** מריץ פעולה עם מצב busy והודעת הצלחה/שגיאה */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run<T>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | null> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (ok) setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok });
      return r;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, setMsg, run };
}

export function rebuildText(r: Record<string, unknown> | null): string {
  if (r?.rebuild === 'started') return 'נשמר. האתר מתעדכן ויציג את השינוי תוך כ-2 דקות';
  if (r?.rebuild === 'failed') return 'נשמר, אבל עדכון האתר לא התחיל. השינוי יופיע בפרסום הבא';
  return 'נשמר. השינוי יופיע באתר בפרסום הבא';
}

export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
