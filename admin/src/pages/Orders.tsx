import { useMemo, useState } from 'react';
import { STATUS_LABELS, type OrderStatus } from '@pehpeletz/shared';
import { Loading, PayBadge, Seg, StatusBadge } from '../components/ui';
import { downloadCsv, toCsv } from '../lib/csv';
import { dateTime, ils, PAY_LABELS } from '../lib/format';
import { api, useLoad, type Order } from '../lib/store';

type Filter = 'todo' | 'all' | 'shipped' | 'pending' | 'closed';
const FILTERS: { key: Filter; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: 'todo', label: 'לטיפול', match: (s) => s === 'paid' || s === 'packed' },
  { key: 'shipped', label: 'נשלחו', match: (s) => s === 'shipped' || s === 'delivered' },
  { key: 'pending', label: 'לא שולמו', match: (s) => s === 'pending' },
  { key: 'closed', label: 'בוטלו/זוכו', match: (s) => s === 'cancelled' || s === 'refunded' },
  { key: 'all', label: 'הכל', match: () => true },
];

export const kitsText = (o: Order) =>
  o.items.map((i) => `${i.name_snapshot}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');
export const addressText = (o: Order) => {
  const a = o.shipping_address ?? {};
  return [
    [a.street, a.house].filter(Boolean).join(' '),
    a.apartment ? `דירה ${a.apartment}` : '',
    a.city,
    a.zip,
  ]
    .filter(Boolean)
    .join(', ');
};

export function Orders({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api.orders(demo), [demo]);
  const [filter, setFilter] = useState<Filter>('todo');
  const [term, setTerm] = useState('');

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of FILTERS) c[f.key] = (data ?? []).filter((o) => f.match(o.status)).length;
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const t = term.trim().toLowerCase().replace(/^#/, '');
    const digits = t.replace(/\D/g, '');
    return (data ?? [])
      .filter((o) => (t ? true : f.match(o.status)))
      .filter((o) => {
        if (!t) return true;
        const c = o.customer;
        return (
          String(o.order_number) === t ||
          (c?.name ?? '').toLowerCase().includes(t) ||
          (c?.email ?? '').toLowerCase().includes(t) ||
          (digits.length >= 4 && (c?.phone ?? '').replace(/\D/g, '').includes(digits)) ||
          (o.tracking_number ?? '').toLowerCase().includes(t)
        );
      })
      .sort((a, b) =>
        filter === 'todo' && !t
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
      );
  }, [data, filter, term]);

  function exportCsv() {
    const csv = toCsv(rows, [
      { label: 'מספר הזמנה', value: (o) => o.order_number },
      { label: 'תאריך', value: (o) => dateTime(o.created_at) },
      { label: 'סטטוס', value: (o) => STATUS_LABELS[o.status] },
      { label: 'תשלום', value: (o) => PAY_LABELS[o.payment_status] },
      { label: 'שם', value: (o) => o.customer?.name },
      { label: 'טלפון', value: (o) => o.customer?.phone },
      { label: 'מייל', value: (o) => o.customer?.email },
      { label: 'כתובת', value: addressText },
      { label: 'חבילה', value: kitsText },
      { label: 'ערכות', value: (o) => o.items.reduce((s, i) => s + i.units_snapshot * i.qty, 0) },
      { label: 'משלוח', value: (o) => o.shipping },
      { label: 'הנחה', value: (o) => o.discount },
      { label: 'קופון', value: (o) => o.coupon_code },
      { label: 'סה"כ', value: (o) => o.total },
      { label: 'זוכה', value: (o) => o.refunded_amount },
      { label: 'מספר מעקב', value: (o) => o.tracking_number },
      { label: 'הערות לקוח', value: (o) => o.notes },
      { label: 'מקור', value: (o) => o.utm?.source },
      { label: 'קמפיין', value: (o) => o.utm?.campaign },
    ]);
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>הזמנות</h1>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>
          ייצוא לאקסל ({rows.length})
        </button>
      </header>
      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">חיפוש הזמנה</span>
          <input
            type="search"
            placeholder="חיפוש: מספר הזמנה, שם, טלפון, מייל"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        {!term && (
          <Seg
            label="סינון הזמנות"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              key: f.key,
              label: `${f.label}${data ? ` (${counts[f.key]})` : ''}`,
            }))}
          />
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <section className="panel empty">
          <p>
            {term
              ? 'לא נמצאו הזמנות לחיפוש הזה'
              : filter === 'todo'
                ? 'אין הזמנות שמחכות לטיפול. הכל נשלח 🎉'
                : 'אין הזמנות בקטגוריה הזו עדיין'}
          </p>
        </section>
      ) : (
        <ul className="cards" aria-label="רשימת הזמנות">
          {rows.map((o) => (
            <li key={o.id}>
              <a className="ocard" href={`#orders/${o.id}`}>
                <span className="ocard__num">#{o.order_number}</span>
                <span className="ocard__name">{o.customer?.name ?? 'ללא שם'}</span>
                <span className="ocard__total">{ils(o.total)}</span>
                <span className="ocard__meta muted small">
                  {dateTime(o.created_at)} · {kitsText(o)}
                  {o.shipping_address?.city ? ` · ${o.shipping_address.city}` : ''}
                </span>
                <span className="ocard__badges">
                  <StatusBadge status={o.status} />
                  {o.payment_status !== 'paid' && <PayBadge status={o.payment_status} />}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
