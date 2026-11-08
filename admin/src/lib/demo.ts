import type { Summary } from './types';

/** נתוני דוגמה לתצוגה בלבד, כשמסד הנתונים עוד לא מחובר (?demo בכתובת). */
export function demoSummary(days: number): Summary {
  const now = new Date();
  const by_day = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const visits = 180 + Math.round(90 * Math.sin(i / 2) + i * 6);
    const orders = Math.max(1, Math.round(visits * (0.028 + 0.01 * Math.cos(i))));
    return { day: d.toISOString().slice(0, 10), visits, orders, revenue: orders * 96 };
  });
  const sessions = by_day.reduce((a, b) => a + b.visits, 0);
  const orders = by_day.reduce((a, b) => a + b.orders, 0);
  const revenue = by_day.reduce((a, b) => a + b.revenue, 0);
  return {
    range: { from: by_day[0]!.day, to: by_day.at(-1)!.day },
    visitors: Math.round(sessions * 0.82),
    sessions,
    bounce_rate: 41.3,
    orders,
    revenue,
    refunds: 100,
    aov: Math.round((revenue / orders) * 100) / 100,
    conversion_rate: Math.round((orders / sessions) * 10000) / 100,
    revenue_per_visitor: Math.round((revenue / (sessions * 0.82)) * 100) / 100,
    funnel: [
      { step: 'visit', count: sessions },
      { step: 'view_pricing', count: Math.round(sessions * 0.58) },
      { step: 'select_package', count: Math.round(sessions * 0.16) },
      { step: 'begin_checkout', count: Math.round(sessions * 0.12) },
      { step: 'add_payment_info', count: Math.round(sessions * 0.06) },
      { step: 'purchase', count: orders },
    ],
    by_day,
    by_source: [
      {
        source: 'facebook',
        medium: 'paid',
        sessions: Math.round(sessions * 0.52),
        orders: Math.round(orders * 0.55),
        revenue: Math.round(revenue * 0.55),
      },
      {
        source: 'instagram',
        medium: 'paid',
        sessions: Math.round(sessions * 0.21),
        orders: Math.round(orders * 0.2),
        revenue: Math.round(revenue * 0.2),
      },
      {
        source: 'tiktok',
        medium: 'paid',
        sessions: Math.round(sessions * 0.14),
        orders: Math.round(orders * 0.12),
        revenue: Math.round(revenue * 0.12),
      },
      {
        source: '(ישיר)',
        medium: '',
        sessions: Math.round(sessions * 0.13),
        orders: Math.round(orders * 0.13),
        revenue: Math.round(revenue * 0.13),
      },
    ],
    by_campaign: [
      {
        campaign: 'launch',
        content: 'video-guy',
        sessions: Math.round(sessions * 0.34),
        orders: Math.round(orders * 0.4),
        revenue: Math.round(revenue * 0.4),
      },
      {
        campaign: 'launch',
        content: 'carousel-kit',
        sessions: Math.round(sessions * 0.25),
        orders: Math.round(orders * 0.22),
        revenue: Math.round(revenue * 0.22),
      },
      {
        campaign: 'retarget',
        content: 'testimonial',
        sessions: Math.round(sessions * 0.12),
        orders: Math.round(orders * 0.18),
        revenue: Math.round(revenue * 0.18),
      },
    ],
    by_device: [
      { device: 'mobile', sessions: Math.round(sessions * 0.84), orders: Math.round(orders * 0.8) },
      {
        device: 'desktop',
        sessions: Math.round(sessions * 0.13),
        orders: Math.round(orders * 0.17),
      },
      {
        device: 'tablet',
        sessions: Math.round(sessions * 0.03),
        orders: Math.round(orders * 0.03),
      },
    ],
    by_package: [
      {
        package: 'כוח על זוגי',
        orders: Math.round(orders * 0.46),
        qty: Math.round(orders * 0.46),
        revenue: Math.round(orders * 0.46) * 100,
      },
      {
        package: 'כוח הצחצוח',
        orders: Math.round(orders * 0.32),
        qty: Math.round(orders * 0.32),
        revenue: Math.round(orders * 0.32) * 50,
      },
      {
        package: 'כוח על לגיבורים אמיתיים',
        orders: Math.round(orders * 0.15),
        qty: Math.round(orders * 0.15),
        revenue: Math.round(orders * 0.15) * 150,
      },
      {
        package: 'כוח צחצוח משפחתי',
        orders: Math.round(orders * 0.07),
        qty: Math.round(orders * 0.07),
        revenue: Math.round(orders * 0.07) * 200,
      },
    ],
    time_to_purchase_hours: { median: 2.4, p90: 51 },
    abandoned: {
      count: Math.round(orders * 0.7),
      recovered: Math.round(orders * 0.15),
      value: Math.round(orders * 0.55) * 90,
    },
    top_ctas: [
      { location: 'hero', clicks: Math.round(sessions * 0.21) },
      { location: 'pricing-kit-2', clicks: Math.round(sessions * 0.08) },
      { location: 'sticky', clicks: Math.round(sessions * 0.07) },
      { location: 'pricing-kit-1', clicks: Math.round(sessions * 0.05) },
      { location: 'solution', clicks: Math.round(sessions * 0.03) },
    ],
    scroll: {
      '25': Math.round(sessions * 0.78),
      '50': Math.round(sessions * 0.55),
      '75': Math.round(sessions * 0.38),
      '100': Math.round(sessions * 0.21),
    },
  };
}
