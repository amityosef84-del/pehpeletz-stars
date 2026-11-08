import { useState, type FormEvent } from 'react';
import { Loading, Notice, rebuildText, useAction } from '../components/ui';
import { ils } from '../lib/format';
import { api, useLoad, type Product } from '../lib/store';

function ProductForm({ p, demo, onSaved }: { p: Product; demo: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    name: p.name,
    description: p.description ?? '',
    price_ils: String(p.price_ils),
    compare_at_price: p.compare_at_price === null ? '' : String(p.compare_at_price),
    stock: p.stock === null ? '' : String(p.stock),
    active: p.active,
    sort: String(p.sort),
  });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const dirty =
    f.name !== p.name ||
    f.description !== (p.description ?? '') ||
    Number(f.price_ils) !== p.price_ils ||
    f.compare_at_price !== (p.compare_at_price === null ? '' : String(p.compare_at_price)) ||
    f.stock !== (p.stock === null ? '' : String(p.stock)) ||
    f.active !== p.active ||
    f.sort !== String(p.sort);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.active && p.active && !window.confirm(`להסתיר את "${p.name}" מהאתר?`)) return;
    const r = await act.run(
      () =>
        api.act(demo, {
          action: 'product.update',
          id: p.id,
          patch: { ...f, description: f.description || null },
        }),
      rebuildText,
    );
    if (r) onSaved();
  }

  const id = `p-${p.slug}`;
  return (
    <form className="panel stack product" onSubmit={save} aria-labelledby={`${id}-t`}>
      <div className="product__head">
        <h2 id={`${id}-t`} className="panel__title">
          {p.name}{' '}
          <span className="muted small">· {p.units === 1 ? 'ערכה אחת' : `${p.units} ערכות`}</span>
        </h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))}
          />
          {f.active ? 'מוצג באתר' : 'מוסתר'}
        </label>
      </div>
      <Notice msg={act.msg} />
      <label className="field">
        שם החבילה
        <input value={f.name} onChange={set('name')} maxLength={80} required />
      </label>
      <div className="form-grid">
        <label className="field">
          מחיר הערכה (₪)
          <input inputMode="decimal" value={f.price_ils} onChange={set('price_ils')} />
        </label>
        <label className="field">
          מחיר לפני הנחה (₪)
          <input
            inputMode="decimal"
            value={f.compare_at_price}
            onChange={set('compare_at_price')}
            placeholder="ריק = בלי"
          />
        </label>
        <label className="field">
          מלאי
          <input
            inputMode="numeric"
            value={f.stock}
            onChange={set('stock')}
            placeholder="ריק = לא מוגבל"
          />
        </label>
        <label className="field">
          סדר
          <input inputMode="numeric" value={f.sort} onChange={set('sort')} />
        </label>
      </div>
      {f.stock === '0' && (
        <p className="warn">מלאי 0: החבילה תוצג כ"אזלה זמנית" ולא תופיע בקופה.</p>
      )}
      <div>
        <button type="submit" className="btn btn--primary" disabled={act.busy || !dirty}>
          {act.busy ? 'שומר…' : 'שמירה'}
        </button>
      </div>
    </form>
  );
}

export function Products({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api.products(demo), [demo]);
  const ship = useLoad(() => api.settings(demo), [demo]);
  const per = ship.data?.shipping.mode === 'per_unit' ? ship.data.shipping.amount : null;
  const offerOk = data?.every((p) => p.price_ils === 0) && per !== null;

  return (
    <div className="page">
      <header className="page__head">
        <h1>מוצרים</h1>
      </header>
      <section className="panel info">
        <p>
          ארבע החבילות שמוצגות בדף. שינוי כאן מעדכן את האתר אוטומטית תוך כ-2 דקות.
          {per !== null && ` המשלוח (${ils(per)} לערכה) נקבע ב`}
          {per !== null && <a href="#settings">הגדרות</a>}.
        </p>
        {data && !offerOk && (
          <p className="warn">
            שימו לב: הטקסטים בדף אומרים "הערכה במתנה, משלמים רק משלוח". מחיר שאינו 0 או משלוח שאינו
            לפי ערכה דורשים לעדכן גם את הטקסטים. דברו איתי לפני שמשנים את מבנה המבצע.
          </p>
        )}
      </section>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : (
        data!.map((p) => (
          <ProductForm
            key={`${p.id}-${p.name}-${p.price_ils}-${p.active}`}
            p={p}
            demo={demo}
            onSaved={reload}
          />
        ))
      )}
    </div>
  );
}
