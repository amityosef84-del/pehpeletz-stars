import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '../components/BarChart';
import { DataTable } from '../components/DataTable';
import { Funnel } from '../components/Funnel';
import { demoSummary } from '../lib/demo';
import { dayLabel, DEVICE_LABELS, ils, nf, pct } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Summary } from '../lib/types';

const RANGES = [
  { key: 'today', label: 'היום', days: 1 },
  { key: '7d', label: '7 ימים', days: 7 },
  { key: '30d', label: '30 ימים', days: 30 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

function rangeDates(days: number) {
  const to = new Date();
  to.setHours(24, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from, to };
}

export function Analytics({ demo }: { demo: boolean }) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [live, setLive] = useState<{
    days: number;
    data: Summary | null;
    prev: Summary | null;
    error: string | null;
  } | null>(null);
  const days = RANGES.find((r) => r.key === range)!.days;
  const sample = useMemo(() => (demo || !supabase ? demoSummary(days) : null), [demo, days]);

  useEffect(() => {
    if (demo || !supabase) return;
    let cancelled = false;
    const { from, to } = rangeDates(days);
    const pFrom = new Date(from);
    pFrom.setDate(pFrom.getDate() - days);
    Promise.all([
      supabase.rpc('analytics_summary', { p_from: from.toISOString(), p_to: to.toISOString() }),
      supabase.rpc('analytics_summary', { p_from: pFrom.toISOString(), p_to: from.toISOString() }),
    ]).then(([cur, before]) => {
      if (cancelled) return;
      setLive({
        days,
        data: (cur.data as Summary) ?? null,
        prev: (before.data as Summary) ?? null,
        error: cur.error ? 'לא הצלחנו לטעון נתונים. נסו לרענן.' : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [days, demo]);

  const data = sample ?? live?.data ?? null;
  const prev = sample ?? live?.prev ?? null;
  const error = sample ? null : (live?.error ?? null);
  const loading = !sample && live?.days !== days;

  const kpis = useMemo(() => {
    if (!data) return [];
    const d = (cur: number, p?: number) =>
      p === undefined || p === 0 ? null : ((cur - p) / p) * 100;
    return [
      { label: 'הכנסות', value: ils(data.revenue), delta: d(data.revenue, prev?.revenue) },
      { label: 'הזמנות', value: nf.format(data.orders), delta: d(data.orders, prev?.orders) },
      {
        label: 'אחוז המרה',
        value: pct(data.conversion_rate),
        delta: d(data.conversion_rate, prev?.conversion_rate),
      },
      { label: 'ממוצע להזמנה', value: ils(data.aov), delta: d(data.aov, prev?.aov) },
      { label: 'מבקרים', value: nf.format(data.visitors), delta: d(data.visitors, prev?.visitors) },
      {
        label: 'ביקורים',
        value: nf.format(data.sessions),
        delta: d(data.sessions, prev?.sessions),
      },
      { label: 'נטישה מיידית', value: pct(data.bounce_rate), delta: null },
      {
        label: 'הכנסה למבקר',
        value: ils(data.revenue_per_visitor),
        delta: d(data.revenue_per_visitor, prev?.revenue_per_visitor),
      },
    ];
  }, [data, prev]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>אנליטיקס</h1>
          {demo && <p className="badge">נתוני דוגמה: מסד הנתונים עוד לא מחובר</p>}
        </div>
        <div className="seg" role="group" aria-label="טווח תאריכים">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && !data && <p className="muted">טוען…</p>}

      {data && (
        <div aria-busy={loading}>
          <section className="kpis" aria-label="מדדים מרכזיים">
            {kpis.map((k) => (
              <div key={k.label} className="kpi">
                <p className="kpi__label">{k.label}</p>
                <p className="kpi__value">{k.value}</p>
                {k.delta !== null && (
                  <p className={k.delta >= 0 ? 'kpi__delta up' : 'kpi__delta down'}>
                    {k.delta >= 0 ? '▲' : '▼'} {pct(Math.abs(k.delta))} מול הקודמת
                  </p>
                )}
              </div>
            ))}
          </section>

          <div className="grid2">
            <section className="panel">
              <Funnel steps={data.funnel} />
            </section>
            <section className="panel">
              <BarChart
                title="הכנסות ליום"
                data={data.by_day.map((d) => ({
                  label: dayLabel(d.day),
                  value: Number(d.revenue),
                }))}
                format={ils}
              />
              <BarChart
                title="ביקורים ליום"
                data={data.by_day.map((d) => ({ label: dayLabel(d.day), value: d.visits }))}
                format={(n) => nf.format(n)}
                height={160}
              />
            </section>
          </div>

          <div className="grid2">
            <DataTable
              title="מקורות תנועה"
              rows={data.by_source}
              columns={[
                {
                  key: 's',
                  label: 'מקור',
                  render: (r) => r.source + (r.medium ? ` / ${r.medium}` : ''),
                },
                { key: 'v', label: 'ביקורים', numeric: true, render: (r) => nf.format(r.sessions) },
                { key: 'o', label: 'הזמנות', numeric: true, render: (r) => nf.format(r.orders) },
                {
                  key: 'c',
                  label: 'המרה',
                  numeric: true,
                  render: (r) => pct(r.sessions ? (100 * r.orders) / r.sessions : 0),
                },
                { key: 'r', label: 'הכנסות', numeric: true, render: (r) => ils(r.revenue ?? 0) },
              ]}
            />
            <DataTable
              title="קמפיינים ומודעות"
              rows={data.by_campaign}
              empty="אין עדיין ביקורים עם utm_campaign"
              columns={[
                { key: 'c', label: 'קמפיין', render: (r) => r.campaign || '—' },
                { key: 'a', label: 'מודעה', render: (r) => r.content || '—' },
                { key: 'v', label: 'ביקורים', numeric: true, render: (r) => nf.format(r.sessions) },
                { key: 'o', label: 'הזמנות', numeric: true, render: (r) => nf.format(r.orders) },
                { key: 'r', label: 'הכנסות', numeric: true, render: (r) => ils(r.revenue ?? 0) },
              ]}
            />
          </div>

          <div className="grid3">
            <DataTable
              title="חבילות"
              rows={data.by_package}
              columns={[
                { key: 'p', label: 'חבילה', render: (r) => r.package },
                { key: 'o', label: 'הזמנות', numeric: true, render: (r) => nf.format(r.orders) },
                { key: 'r', label: 'הכנסות', numeric: true, render: (r) => ils(r.revenue) },
              ]}
            />
            <DataTable
              title="מכשירים"
              rows={data.by_device}
              columns={[
                { key: 'd', label: 'מכשיר', render: (r) => DEVICE_LABELS[r.device] ?? r.device },
                { key: 'v', label: 'ביקורים', numeric: true, render: (r) => nf.format(r.sessions) },
                {
                  key: 'c',
                  label: 'המרה',
                  numeric: true,
                  render: (r) => pct(r.sessions ? (100 * r.orders) / r.sessions : 0),
                },
              ]}
            />
            <DataTable
              title="כפתורים שנלחצו"
              rows={data.top_ctas}
              columns={[
                { key: 'l', label: 'מיקום', render: (r) => r.location },
                { key: 'c', label: 'לחיצות', numeric: true, render: (r) => nf.format(r.clicks) },
              ]}
            />
          </div>

          <section className="facts" aria-label="מדדים נוספים">
            <div className="kpi">
              <p className="kpi__label">עגלות נטושות</p>
              <p className="kpi__value">{nf.format(data.abandoned.count)}</p>
              <p className="kpi__sub">
                שוחזרו {nf.format(data.abandoned.recovered)} · שווי פתוח {ils(data.abandoned.value)}
              </p>
            </div>
            <div className="kpi">
              <p className="kpi__label">זמן עד רכישה (חציון)</p>
              <p className="kpi__value">{data.time_to_purchase_hours.median} שעות</p>
              <p className="kpi__sub">90% קונים תוך {data.time_to_purchase_hours.p90} שעות</p>
            </div>
            <div className="kpi">
              <p className="kpi__label">החזרים</p>
              <p className="kpi__value">{ils(data.refunds)}</p>
            </div>
            <div className="kpi">
              <p className="kpi__label">עומק גלילה בדף</p>
              <p className="kpi__sub">
                25%: {nf.format(data.scroll['25'])} · 50%: {nf.format(data.scroll['50'])} · 75%:{' '}
                {nf.format(data.scroll['75'])} · סוף: {nf.format(data.scroll['100'])}
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
