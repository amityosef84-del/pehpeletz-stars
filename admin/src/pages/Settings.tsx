import { useState, type FormEvent } from 'react';
import { Loading, Notice, rebuildText, useAction } from '../components/ui';
import {
  api,
  useLoad,
  type Settings as S,
  type ShippingSetting,
  type StoreSetting,
} from '../lib/store';

function ShippingForm({
  v,
  demo,
  onSaved,
}: {
  v: ShippingSetting;
  demo: boolean;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    mode: v.mode,
    amount: String(v.amount ?? ''),
    freeOverSubtotal: v.freeOverSubtotal === undefined ? '' : String(v.freeOverSubtotal),
    label: v.label ?? 'משלוח עד הבית',
  });
  const act = useAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      f.mode !== 'per_unit' &&
      !window.confirm('הטקסטים בדף כתובים למשלוח לפי ערכה. לשנות בכל זאת?')
    )
      return;
    const r = await act.run(
      () => api.act(demo, { action: 'settings.shipping', value: f }),
      rebuildText,
    );
    if (r) onSaved();
  }
  return (
    <form className="panel stack" onSubmit={save} aria-labelledby="ship-t">
      <h2 id="ship-t" className="panel__title">
        משלוח
      </h2>
      <Notice msg={act.msg} />
      <label className="field">
        שיטה
        <select
          value={f.mode}
          onChange={(e) => setF({ ...f, mode: e.target.value as ShippingSetting['mode'] })}
        >
          <option value="per_unit">מחיר לכל ערכה (המבצע הנוכחי)</option>
          <option value="flat">מחיר קבוע להזמנה</option>
          <option value="free">משלוח חינם</option>
        </select>
      </label>
      {f.mode !== 'free' && (
        <label className="field">
          {f.mode === 'per_unit' ? 'מחיר לערכה (₪)' : 'מחיר להזמנה (₪)'}
          <input
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </label>
      )}
      {f.mode === 'flat' && (
        <label className="field">
          משלוח חינם מעל (₪)
          <input
            inputMode="decimal"
            value={f.freeOverSubtotal}
            placeholder="ריק = אף פעם"
            onChange={(e) => setF({ ...f, freeOverSubtotal: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        כיתוב
        <input
          value={f.label}
          maxLength={60}
          onChange={(e) => setF({ ...f, label: e.target.value })}
        />
      </label>
      <div>
        <button type="submit" className="btn btn--primary" disabled={act.busy}>
          שמירה
        </button>
      </div>
    </form>
  );
}

const STORE_FIELDS: { key: keyof StoreSetting; label: string; hint?: string; ltr?: boolean }[] = [
  { key: 'name', label: 'שם החנות' },
  { key: 'legal_name', label: 'שם העסק הרשמי', hint: 'כפי שרשום ברשות המסים' },
  { key: 'business_id', label: 'ח.פ / מספר עוסק', ltr: true },
  { key: 'address', label: 'כתובת העסק' },
  { key: 'phone', label: 'טלפון', ltr: true },
  { key: 'email', label: 'מייל לפניות לקוחות', ltr: true },
  { key: 'whatsapp', label: 'וואטסאפ לפניות', hint: 'הכפתור באתר יפנה למספר הזה', ltr: true },
];

function StoreForm({ v, demo, onSaved }: { v: StoreSetting; demo: boolean; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      STORE_FIELDS.map((x) => [
        x.key,
        x.key === 'whatsapp' && v.whatsapp ? v.whatsapp.replace(/^972/, '0') : (v[x.key] ?? ''),
      ]),
    ),
  );
  const act = useAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await act.run(
      () => api.act(demo, { action: 'settings.store', value: f }),
      rebuildText,
    );
    if (r) onSaved();
  }
  return (
    <form className="panel stack" onSubmit={save} aria-labelledby="store-t">
      <h2 id="store-t" className="panel__title">
        פרטי העסק
      </h2>
      <p className="muted small">
        מופיעים בתחתית האתר ובדפי המדיניות (חובה לפי חוק הגנת הצרכן). כל עוד שדה ריק, הדפים מציגים
        "[להשלמה]".
      </p>
      <Notice msg={act.msg} />
      <div className="form-grid">
        {STORE_FIELDS.map((x) => (
          <label key={x.key} className="field">
            {x.label}
            <input
              dir={x.ltr ? 'ltr' : undefined}
              value={f[x.key]}
              onChange={(e) => setF({ ...f, [x.key]: e.target.value })}
            />
            {x.hint && <span className="muted small">{x.hint}</span>}
          </label>
        ))}
      </div>
      <div>
        <button type="submit" className="btn btn--primary" disabled={act.busy}>
          שמירה
        </button>
      </div>
    </form>
  );
}

export function Settings({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad<S>(() => api.settings(demo), [demo]);
  return (
    <div className="page">
      <header className="page__head">
        <h1>הגדרות</h1>
      </header>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : (
        <>
          <ShippingForm
            key={JSON.stringify(data!.shipping)}
            v={data!.shipping}
            demo={demo}
            onSaved={reload}
          />
          <StoreForm
            key={JSON.stringify(data!.store)}
            v={data!.store}
            demo={demo}
            onSaved={reload}
          />
        </>
      )}
    </div>
  );
}
