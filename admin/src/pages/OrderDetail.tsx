import { useState, type FormEvent } from 'react';
import { STATUS_ACTIONS, STATUS_LABELS, TRANSITIONS, type OrderStatus } from '@pehpeletz/shared';
import { Loading, Notice, PayBadge, StatusBadge, useAction } from '../components/ui';
import { dateTime, firstName, ils, waLink } from '../lib/format';
import { api, useLoad, type AuditEntry, type Order } from '../lib/store';
import { addressText, kitsText } from './Orders';

const ACTION_TEXT: Record<string, string> = {
  status_change: 'שינוי סטטוס',
  tracking: 'מספר מעקב',
  note: 'הערה',
};

function logText(a: AuditEntry): string {
  if (a.action === 'status_change') {
    const from = a.before?.status as OrderStatus | undefined;
    const to = a.after?.status as OrderStatus | undefined;
    return `${from ? STATUS_LABELS[from] : ''} ← ${to ? STATUS_LABELS[to] : ''}`.replace(
      /^ ← /,
      '',
    );
  }
  if (a.action === 'tracking') return `מספר מעקב: ${a.after?.tracking_number ?? 'נמחק'}`;
  return a.note ?? ACTION_TEXT[a.action] ?? a.action;
}

function timeline(o: Order, log: AuditEntry[]) {
  const ev: { at: string; text: string; who?: string | null; note?: boolean }[] = [];
  if (o.paid_at) ev.push({ at: o.paid_at, text: `התשלום התקבל (${ils(o.total)})` });
  ev.push({ at: o.created_at, text: 'ההזמנה נוצרה' });
  for (const a of log)
    ev.push({ at: a.created_at, text: logText(a), who: a.actor_email, note: a.action === 'note' });
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}

export function OrderDetail({ demo, id }: { demo: boolean; id: string }) {
  const { data, error, loading, reload } = useLoad(() => api.order(demo, id), [demo, id]);
  const act = useAction();
  const [tracking, setTracking] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (loading && !data) return <Loading />;
  if (error) return <Loading error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="page">
        <p>ההזמנה לא נמצאה.</p>
        <a href="#orders">חזרה להזמנות</a>
      </div>
    );
  const { order: o, log } = data;
  const c = o.customer;
  const trackingValue = tracking ?? o.tracking_number ?? '';
  const units = o.items.reduce((s, i) => s + i.units_snapshot * i.qty, 0);
  const next = TRANSITIONS[o.status];

  async function setStatus(to: OrderStatus) {
    if (to === 'cancelled') {
      const paid = o.payment_status === 'paid';
      const ok = window.confirm(
        paid
          ? `לבטל את הזמנה #${o.order_number}? הביטול לא מחזיר כסף אוטומטית: את הזיכוי עושים כרגע ב-SUMIT.`
          : `לבטל את הזמנה #${o.order_number}?`,
      );
      if (!ok) return;
    }
    const r = await act.run(
      () =>
        api.act(demo, {
          action: 'order.status',
          orderId: o.id,
          status: to,
          trackingNumber: to === 'shipped' ? trackingValue || null : undefined,
        }),
      `הסטטוס עודכן: ${STATUS_LABELS[to]}`,
    );
    if (r) reload();
  }

  async function saveTracking(e: FormEvent) {
    e.preventDefault();
    const r = await act.run(
      () =>
        api.act(demo, { action: 'order.tracking', orderId: o.id, trackingNumber: trackingValue }),
      'מספר המעקב נשמר',
    );
    if (r) {
      setTracking(null);
      reload();
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    const r = await act.run(
      () => api.act(demo, { action: 'order.note', orderId: o.id, note }),
      'ההערה נוספה',
    );
    if (r) {
      setNote('');
      reload();
    }
  }

  const name = firstName(c?.name);
  const waShipped = waLink(
    c?.phone,
    `היי ${name}, כאן הכוכבים של פהפלצת 🦸 הזמנה #${o.order_number} יצאה אליכם!${
      o.tracking_number ? ` מספר מעקב: ${o.tracking_number}` : ''
    }`,
  );
  const waHello = waLink(
    c?.phone,
    `היי ${name}, כאן הכוכבים של פהפלצת לגבי הזמנה #${o.order_number}`,
  );

  return (
    <div className="page">
      <a className="back" href="#orders">
        → כל ההזמנות
      </a>
      <header className="page__head">
        <h1>
          הזמנה #{o.order_number} <StatusBadge status={o.status} />
        </h1>
        <p className="muted">{dateTime(o.created_at)}</p>
      </header>
      <Notice msg={act.msg} />

      {next.length > 0 && (
        <section className="panel" aria-label="פעולות">
          <div className="alerts-actions">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                className={
                  s === 'cancelled'
                    ? 'btn danger'
                    : s === 'paid' || (s === 'packed' && o.status === 'shipped')
                      ? 'btn'
                      : 'btn btn--primary'
                }
                disabled={act.busy}
                onClick={() => setStatus(s)}
              >
                {s === 'packed' && o.status === 'shipped' ? 'החזרה לארוזה' : STATUS_ACTIONS[s]}
              </button>
            ))}
            <button type="button" className="btn" onClick={() => window.print()}>
              הדפסת תעודת משלוח
            </button>
          </div>
          {o.status === 'paid' || o.status === 'packed' ? (
            <p className="muted small">
              טיפ: הזינו מספר מעקב לפני "סימון כנשלחה" והוא יישמר יחד עם הסטטוס.
            </p>
          ) : null}
        </section>
      )}

      <div className="grid2">
        <section className="panel">
          <h2 className="panel__title">לקוח</h2>
          {c ? (
            <dl className="dl">
              <dt>שם</dt>
              <dd>
                <a href={`#customers/${c.id}`}>{c.name}</a>
              </dd>
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
              <dt>כתובת</dt>
              <dd>{addressText(o) || '—'}</dd>
              {o.notes && (
                <>
                  <dt>הערות הלקוח</dt>
                  <dd className="hl">{o.notes}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted">אין פרטי לקוח</p>
          )}
          <div className="alerts-actions">
            {waHello && (
              <a className="btn btn--small" href={waHello} target="_blank" rel="noopener">
                וואטסאפ ללקוח
              </a>
            )}
            {waShipped && (o.status === 'shipped' || o.status === 'packed') && (
              <a className="btn btn--small" href={waShipped} target="_blank" rel="noopener">
                הודעת "ההזמנה יצאה"
              </a>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">תשלום</h2>
          <table className="table sum">
            <tbody>
              {o.items.map((i, k) => (
                <tr key={k}>
                  <th scope="row">
                    {i.name_snapshot}
                    {i.qty > 1 ? ` ×${i.qty}` : ''} ({i.units_snapshot * i.qty} ערכות)
                  </th>
                  <td className="num">{i.unit_price ? ils(i.unit_price * i.qty) : 'במתנה'}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">משלוח</th>
                <td className="num">{ils(o.shipping)}</td>
              </tr>
              {o.discount > 0 && (
                <tr>
                  <th scope="row">הנחה {o.coupon_code && `(${o.coupon_code})`}</th>
                  <td className="num">−{ils(o.discount)}</td>
                </tr>
              )}
              <tr className="sum__total">
                <th scope="row">סה״כ</th>
                <td className="num">{ils(o.total)}</td>
              </tr>
              {o.refunded_amount > 0 && (
                <tr>
                  <th scope="row">זוכה</th>
                  <td className="num">−{ils(o.refunded_amount)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="pay-line">
            <PayBadge status={o.payment_status} />
            {o.sumit_document_url && (
              <a href={o.sumit_document_url} target="_blank" rel="noopener">
                חשבונית
              </a>
            )}
          </p>
          <button type="button" className="btn btn--small" disabled aria-describedby="refund-hint">
            זיכוי
          </button>
          <p id="refund-hint" className="muted small">
            זיכוי מכאן יתאפשר אחרי חיבור הסליקה. בינתיים מזכים ישירות ב-SUMIT.
          </p>
        </section>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2 className="panel__title">משלוח</h2>
          <form className="inline-form" onSubmit={saveTracking}>
            <label className="field">
              מספר מעקב
              <input
                dir="ltr"
                value={trackingValue}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="RR123456789IL"
                maxLength={60}
              />
            </label>
            <button
              type="submit"
              className="btn"
              disabled={act.busy || trackingValue === (o.tracking_number ?? '')}
            >
              שמירה
            </button>
          </form>
          <p className="muted small">
            {units} ערכות
            {o.shipped_at ? ` · נשלחה ${dateTime(o.shipped_at)}` : ''}
          </p>
        </section>

        <section className="panel">
          <h2 className="panel__title">הערה פנימית</h2>
          <form className="stack" onSubmit={addNote}>
            <label className="field">
              <span className="visually-hidden">הערה</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="רק הצוות רואה. למשל: הלקוחה ביקשה לשלוח אחרי יום רביעי"
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={act.busy || !note.trim()}>
                הוספת הערה
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel__title">היסטוריה</h2>
        <ol className="timeline">
          {timeline(o, log).map((e, i) => (
            <li key={i} className={e.note ? 'timeline__note' : undefined}>
              <p>{e.text}</p>
              <p className="muted small">
                {dateTime(e.at)}
                {e.who ? ` · ${e.who}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* תעודת משלוח: מוצגת רק בהדפסה */}
      <div className="slip" aria-hidden="true">
        <h2>הכוכבים של פהפלצת</h2>
        <p className="slip__num">הזמנה #{o.order_number}</p>
        <p>
          <strong>{c?.name}</strong>
          <br />
          {addressText(o)}
          <br />
          <span dir="ltr">{c?.phone}</span>
        </p>
        <p>
          {kitsText(o)} · {units} ערכות
        </p>
        {o.notes && <p>הערות: {o.notes}</p>}
        <p className="slip__thanks">תודה שבחרתם בנו! צחצוח שמח 🦸</p>
      </div>
    </div>
  );
}
