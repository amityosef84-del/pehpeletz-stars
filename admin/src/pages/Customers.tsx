import { useMemo, useState } from 'react';
import { Loading, StatusBadge } from '../components/ui';
import { downloadCsv, toCsv } from '../lib/csv';
import { dateOnly, dateTime, ils, waLink, firstName } from '../lib/format';
import { api, useLoad, type Customer } from '../lib/store';

/** שווי לקוח: סכום הזמנות ששולמו פחות זיכויים */
export function ltv(c: Customer): number {
  return c.orders
    .filter((o) => o.payment_status === 'paid' || o.payment_status === 'partially_refunded')
    .reduce((s, o) => s + o.total - o.refunded_amount, 0);
}
const paidCount = (c: Customer) =>
  c.orders.filter((o) => o.payment_status === 'paid' || o.payment_status === 'partially_refunded')
    .length;
const lastOrder = (c: Customer) =>
  c.orders.reduce<string | null>((m, o) => (!m || o.created_at > m ? o.created_at : m), null);

type Sort = 'recent' | 'ltv' | 'orders';

export function Customers({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api.customers(demo), [demo]);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    const list = (data ?? []).filter(
      (c) =>
        !t ||
        c.name.toLowerCase().includes(t) ||
        c.email.toLowerCase().includes(t) ||
        (digits.length >= 4 && c.phone.replace(/\D/g, '').includes(digits)),
    );
    const key = (c: Customer) =>
      sort === 'ltv' ? ltv(c) : sort === 'orders' ? paidCount(c) : (lastOrder(c) ?? c.created_at);
    return list.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return typeof ka === 'number' ? (kb as number) - ka : String(kb).localeCompare(String(ka));
    });
  }, [data, term, sort]);

  const totals = useMemo(() => {
    const list = data ?? [];
    const buyers = list.filter((c) => paidCount(c) > 0);
    const repeat = buyers.filter((c) => paidCount(c) > 1).length;
    const revenue = buyers.reduce((s, c) => s + ltv(c), 0);
    return {
      buyers: buyers.length,
      repeat,
      avg: buyers.length ? revenue / buyers.length : 0,
      consent: list.filter((c) => c.marketing_consent).length,
    };
  }, [data]);

  function exportCsv(onlyConsent: boolean) {
    const list = onlyConsent ? rows.filter((c) => c.marketing_consent) : rows;
    downloadCsv(
      `customers${onlyConsent ? '-marketing' : ''}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(list, [
        { label: 'שם', value: (c) => c.name },
        { label: 'טלפון', value: (c) => c.phone },
        { label: 'מייל', value: (c) => c.email },
        { label: 'הזמנות ששולמו', value: paidCount },
        { label: 'סה"כ', value: ltv },
        { label: 'הזמנה אחרונה', value: (c) => dateOnly(lastOrder(c)) },
        { label: 'אישור דיוור', value: (c) => (c.marketing_consent ? 'כן' : 'לא') },
        { label: 'לקוח מאז', value: (c) => dateOnly(c.created_at) },
      ]),
    );
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>לקוחות</h1>
        <div className="alerts-actions">
          <button
            type="button"
            className="btn"
            onClick={() => exportCsv(false)}
            disabled={!rows.length}
          >
            ייצוא לאקסל
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => exportCsv(true)}
            disabled={!totals.consent}
          >
            רק מאשרי דיוור ({totals.consent})
          </button>
        </div>
      </header>
      {data && (
        <div className="kpis">
          <div className="kpi">
            <p className="kpi__label">לקוחות משלמים</p>
            <p className="kpi__value">{totals.buyers}</p>
          </div>
          <div className="kpi">
            <p className="kpi__label">חזרו לקנות שוב</p>
            <p className="kpi__value">{totals.repeat}</p>
          </div>
          <div className="kpi">
            <p className="kpi__label">ממוצע ללקוח</p>
            <p className="kpi__value">{ils(Math.round(totals.avg))}</p>
          </div>
        </div>
      )}
      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">חיפוש לקוח</span>
          <input
            type="search"
            placeholder="חיפוש: שם, טלפון, מייל"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        <label className="field field--inline">
          מיון
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">פעילות אחרונה</option>
            <option value="ltv">הכי הרבה כסף</option>
            <option value="orders">הכי הרבה הזמנות</option>
          </select>
        </label>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <section className="panel empty">
          <p>{term ? 'לא נמצאו לקוחות' : 'עוד אין לקוחות. הם יופיעו כאן אחרי ההזמנה הראשונה'}</p>
        </section>
      ) : (
        <ul className="cards" aria-label="רשימת לקוחות">
          {rows.map((c) => (
            <li key={c.id}>
              <a className="ocard" href={`#customers/${c.id}`}>
                <span className="ocard__num">{c.name}</span>
                <span className="ocard__total">{ils(ltv(c))}</span>
                <span className="ocard__meta muted small">
                  <span dir="ltr">{c.phone}</span> · {paidCount(c)} הזמנות · אחרונה{' '}
                  {dateOnly(lastOrder(c))}
                </span>
                <span className="ocard__badges">
                  {paidCount(c) > 1 && <span className="st st--delivered">חוזר/ת</span>}
                  {c.marketing_consent && <span className="st">מאשר/ת דיוור</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CustomerDetail({ demo, id }: { demo: boolean; id: string }) {
  const { data, error, loading, reload } = useLoad(() => api.customers(demo), [demo]);
  if (loading && !data) return <Loading />;
  if (error) return <Loading error={error} onRetry={reload} />;
  const c = data?.find((x) => x.id === id);
  if (!c)
    return (
      <div className="page">
        <p>הלקוח לא נמצא.</p>
        <a href="#customers">חזרה ללקוחות</a>
      </div>
    );
  const wa = waLink(c.phone, `היי ${firstName(c.name)}, כאן הכוכבים של פהפלצת 🦸`);
  const orders = [...c.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="page">
      <a className="back" href="#customers">
        → כל הלקוחות
      </a>
      <header className="page__head">
        <h1>{c.name}</h1>
      </header>
      <div className="kpis">
        <div className="kpi">
          <p className="kpi__label">סה״כ קניות</p>
          <p className="kpi__value">{ils(ltv(c))}</p>
        </div>
        <div className="kpi">
          <p className="kpi__label">הזמנות ששולמו</p>
          <p className="kpi__value">{paidCount(c)}</p>
        </div>
        <div className="kpi">
          <p className="kpi__label">לקוח מאז</p>
          <p className="kpi__value kpi__value--sm">{dateOnly(c.created_at)}</p>
        </div>
      </div>
      <section className="panel">
        <h2 className="panel__title">פרטים</h2>
        <dl className="dl">
          <dt>טלפון</dt>
          <dd>
            <a href={`tel:${c.phone}`} dir="ltr">
              {c.phone}
            </a>
          </dd>
          <dt>מייל</dt>
          <dd>
            <a href={`mailto:${c.email}`} dir="ltr">
              {c.email}
            </a>
          </dd>
          <dt>דיוור</dt>
          <dd>{c.marketing_consent ? 'אישר/ה קבלת עדכונים' : 'לא אישר/ה. אין לשלוח פרסום'}</dd>
        </dl>
        {wa && (
          <a className="btn btn--small" href={wa} target="_blank" rel="noopener">
            וואטסאפ
          </a>
        )}
      </section>
      <section className="panel">
        <h2 className="panel__title">הזמנות</h2>
        <ul className="cards">
          {orders.map((o) => (
            <li key={o.id}>
              <a className="ocard" href={`#orders/${o.id}`}>
                <span className="ocard__num">#{o.order_number}</span>
                <span className="ocard__total">{ils(o.total)}</span>
                <span className="ocard__meta muted small">{dateTime(o.created_at)}</span>
                <span className="ocard__badges">
                  <StatusBadge status={o.status} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
