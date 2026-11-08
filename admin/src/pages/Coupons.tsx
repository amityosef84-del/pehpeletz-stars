import { useState, type FormEvent } from 'react';
import { Loading, Notice, useAction } from '../components/ui';
import { dateOnly, ils } from '../lib/format';
import { api, useLoad, type Coupon } from '../lib/store';

const EMPTY = {
  id: '',
  code: '',
  type: 'percent' as 'percent' | 'fixed',
  value: '',
  min_total: '',
  usage_limit: '',
  starts_at: '',
  ends_at: '',
  active: true,
};
type Form = typeof EMPTY;

const toForm = (c: Coupon): Form => ({
  id: c.id,
  code: c.code,
  type: c.type,
  value: String(c.value),
  min_total: c.min_total ? String(c.min_total) : '',
  usage_limit: c.usage_limit === null ? '' : String(c.usage_limit),
  starts_at: c.starts_at?.slice(0, 10) ?? '',
  ends_at: c.ends_at?.slice(0, 10) ?? '',
  active: c.active,
});

function state(c: Coupon): { text: string; cls: string } {
  const now = new Date().toISOString();
  if (!c.active) return { text: 'כבוי', cls: 'st--cancelled' };
  if (c.ends_at && c.ends_at < now) return { text: 'פג תוקף', cls: 'st--cancelled' };
  if (c.starts_at && c.starts_at > now) return { text: 'מתוזמן', cls: 'st--pending' };
  if (c.usage_limit !== null && c.used_count >= c.usage_limit)
    return { text: 'נוצל', cls: 'st--cancelled' };
  return { text: 'פעיל', cls: 'st--delivered' };
}

export function Coupons({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api.coupons(demo), [demo]);
  const [f, setF] = useState<Form | null>(null);
  const act = useAction();
  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((s) => (s ? { ...s, [k]: e.target.value } : s));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    // תאריך סיום כולל את כל היום
    const ends = f.ends_at ? new Date(`${f.ends_at}T23:59:59`).toISOString() : null;
    const starts = f.starts_at ? new Date(`${f.starts_at}T00:00:00`).toISOString() : null;
    const r = await act.run(
      () =>
        api.act(demo, {
          action: 'coupon.upsert',
          coupon: { ...f, id: f.id || undefined, starts_at: starts, ends_at: ends },
        }),
      `הקופון ${f.code.toUpperCase()} נשמר`,
    );
    if (r) {
      setF(null);
      reload();
    }
  }

  async function remove(c: Coupon) {
    if (!window.confirm(`למחוק את הקופון ${c.code}?`)) return;
    const r = await act.run(
      () => api.act(demo, { action: 'coupon.delete', id: c.id }),
      (r) =>
        r.deactivated ? `${c.code} כבר שימש בהזמנות, אז כיבינו אותו במקום למחוק` : `${c.code} נמחק`,
    );
    if (r) reload();
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>קופונים</h1>
        {!f && (
          <button type="button" className="btn btn--primary" onClick={() => setF({ ...EMPTY })}>
            קופון חדש
          </button>
        )}
      </header>
      <Notice msg={act.msg} />
      <p className="muted">
        ההנחה מחושבת על כל ההזמנה כולל משלוח. הקופונים יעבדו בקופה מרגע חיבור הסליקה.
      </p>

      {f && (
        <form
          className="panel stack"
          onSubmit={save}
          aria-label={f.id ? 'עריכת קופון' : 'קופון חדש'}
        >
          <h2 className="panel__title">{f.id ? `עריכת ${f.code}` : 'קופון חדש'}</h2>
          <div className="form-grid">
            <label className="field">
              קוד
              <input
                dir="ltr"
                value={f.code}
                onChange={(e) =>
                  setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })
                }
                placeholder="WELCOME10"
                maxLength={40}
                required
              />
            </label>
            <label className="field">
              סוג הנחה
              <select value={f.type} onChange={set('type')}>
                <option value="percent">אחוזים</option>
                <option value="fixed">סכום קבוע (₪)</option>
              </select>
            </label>
            <label className="field">
              {f.type === 'percent' ? 'אחוז הנחה' : 'סכום הנחה (₪)'}
              <input inputMode="decimal" value={f.value} onChange={set('value')} required />
            </label>
            <label className="field">
              מינימום הזמנה (₪)
              <input
                inputMode="decimal"
                value={f.min_total}
                onChange={set('min_total')}
                placeholder="בלי"
              />
            </label>
            <label className="field">
              מקסימום שימושים
              <input
                inputMode="numeric"
                value={f.usage_limit}
                onChange={set('usage_limit')}
                placeholder="ללא הגבלה"
              />
            </label>
            <label className="field">
              מתחיל ב
              <input type="date" value={f.starts_at} onChange={set('starts_at')} />
            </label>
            <label className="field">
              נגמר ב (כולל)
              <input type="date" value={f.ends_at} onChange={set('ends_at')} />
            </label>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={f.active}
              onChange={(e) => setF({ ...f, active: e.target.checked })}
            />
            פעיל
          </label>
          <div className="alerts-actions">
            <button type="submit" className="btn btn--primary" disabled={act.busy}>
              שמירה
            </button>
            <button type="button" className="btn btn--link" onClick={() => setF(null)}>
              ביטול
            </button>
          </div>
        </form>
      )}

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : data!.length === 0 ? (
        <section className="panel empty">
          <p>עוד אין קופונים</p>
        </section>
      ) : (
        <ul className="cards" aria-label="רשימת קופונים">
          {data!.map((c) => {
            const s = state(c);
            return (
              <li key={c.id} className="ocard ocard--static">
                <span className="ocard__num" dir="ltr">
                  {c.code}
                </span>
                <span className="ocard__total">
                  {c.type === 'percent' ? `${c.value}%` : ils(c.value)}
                </span>
                <span className="ocard__meta muted small">
                  נוצל {c.used_count}
                  {c.usage_limit !== null ? ` מתוך ${c.usage_limit}` : ''}
                  {c.min_total ? ` · מעל ${ils(c.min_total)}` : ''}
                  {c.ends_at ? ` · עד ${dateOnly(c.ends_at)}` : ''}
                </span>
                <span className="ocard__badges">
                  <span className={`st ${s.cls}`}>{s.text}</span>
                  <button type="button" className="btn btn--small" onClick={() => setF(toForm(c))}>
                    עריכה
                  </button>
                  <button
                    type="button"
                    className="btn btn--small danger"
                    onClick={() => remove(c)}
                    disabled={act.busy}
                  >
                    מחיקה
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
