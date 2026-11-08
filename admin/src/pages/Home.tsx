import { useMemo, useState } from 'react';
import { Loading, StatusBadge } from '../components/ui';
import { ago, ils } from '../lib/format';
import { api, useLoad, type Abandoned, type Order } from '../lib/store';
import { kitsText } from './Orders';

const isPaid = (o: Order) =>
  o.payment_status === 'paid' || o.payment_status === 'partially_refunded';

export function Home({ demo }: { demo: boolean }) {
  const [now] = useState(() => Date.now());
  const orders = useLoad(() => api.orders(demo), [demo]);
  const carts = useLoad(() => api.abandoned(demo), [demo]);

  const s = useMemo(() => {
    const list = orders.data ?? [];
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const today = list.filter((o) => isPaid(o) && new Date(o.created_at) >= start);
    const weekAgo = now - 7 * 86_400_000;
    const week = list.filter((o) => isPaid(o) && new Date(o.created_at).getTime() >= weekAgo);
    const toShip = list
      .filter((o) => o.status === 'paid' || o.status === 'packed')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const kits = toShip.reduce(
      (n, o) => n + o.items.reduce((k, i) => k + i.units_snapshot * i.qty, 0),
      0,
    );
    const openCarts = (carts.data ?? []).filter(
      (c: Abandoned) =>
        !c.recovered && !c.contacted_at && now - new Date(c.updated_at).getTime() < 14 * 86_400_000,
    );
    return {
      todayCount: today.length,
      todayRevenue: today.reduce((n, o) => n + o.total - o.refunded_amount, 0),
      weekRevenue: week.reduce((n, o) => n + o.total - o.refunded_amount, 0),
      weekCount: week.length,
      toShip,
      kits,
      openCarts,
      recent: list.slice(0, 5),
    };
  }, [orders.data, carts.data, now]);

  const hello = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
  })();

  if (orders.loading && !orders.data) return <Loading />;
  if (orders.error) return <Loading error={orders.error} onRetry={orders.reload} />;

  return (
    <div className="page">
      <header className="page__head">
        <h1>{hello} 👋</h1>
      </header>
      <div className="kpis">
        <a className="kpi kpi--link" href="#orders">
          <p className="kpi__label">הזמנות היום</p>
          <p className="kpi__value">{s.todayCount}</p>
          <p className="kpi__sub">{ils(s.todayRevenue)}</p>
        </a>
        <div className="kpi">
          <p className="kpi__label">7 ימים אחרונים</p>
          <p className="kpi__value">{ils(s.weekRevenue)}</p>
          <p className="kpi__sub">{s.weekCount} הזמנות</p>
        </div>
        <a className={`kpi kpi--link${s.toShip.length ? ' kpi--todo' : ''}`} href="#orders">
          <p className="kpi__label">מחכות למשלוח</p>
          <p className="kpi__value">{s.toShip.length}</p>
          <p className="kpi__sub">{s.kits} ערכות לארוז</p>
        </a>
        <a className={`kpi kpi--link${s.openCarts.length ? ' kpi--todo' : ''}`} href="#abandoned">
          <p className="kpi__label">עגלות לטיפול</p>
          <p className="kpi__value">{s.openCarts.length}</p>
          <p className="kpi__sub">פנייה בוואטסאפ</p>
        </a>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2 className="panel__title">לשליחה (הוותיקות קודם)</h2>
          {s.toShip.length === 0 ? (
            <p className="muted">הכל נשלח. אין הזמנות שמחכות 🎉</p>
          ) : (
            <ul className="mini">
              {s.toShip.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <a href={`#orders/${o.id}`}>
                    <strong>#{o.order_number}</strong> {o.customer?.name}
                  </a>
                  <span className="muted small">
                    {kitsText(o)} · {ago(o.created_at)}
                  </span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
          {s.toShip.length > 8 && <a href="#orders">לכל {s.toShip.length} ההזמנות</a>}
        </section>

        <section className="panel">
          <h2 className="panel__title">הזמנות אחרונות</h2>
          {s.recent.length === 0 ? (
            <p className="muted">עוד אין הזמנות. כשתיכנס הזמנה תשמעו קאצ׳ינג 💰</p>
          ) : (
            <ul className="mini">
              {s.recent.map((o) => (
                <li key={o.id}>
                  <a href={`#orders/${o.id}`}>
                    <strong>#{o.order_number}</strong> {o.customer?.name}
                  </a>
                  <span className="muted small">
                    {ils(o.total)} · {ago(o.created_at)}
                  </span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
