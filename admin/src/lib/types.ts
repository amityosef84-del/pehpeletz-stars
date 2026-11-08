export interface Breakdown {
  sessions: number;
  orders: number;
  revenue?: number;
}
export interface Summary {
  range: { from: string; to: string };
  visitors: number;
  sessions: number;
  bounce_rate: number;
  orders: number;
  revenue: number;
  refunds: number;
  aov: number;
  conversion_rate: number;
  revenue_per_visitor: number;
  funnel: { step: string; count: number }[];
  by_day: { day: string; visits: number; orders: number; revenue: number }[];
  by_source: (Breakdown & { source: string; medium: string })[];
  by_campaign: (Breakdown & { campaign: string; content: string })[];
  by_device: (Breakdown & { device: string })[];
  by_package: { package: string; orders: number; qty: number; revenue: number }[];
  time_to_purchase_hours: { median: number; p90: number };
  abandoned: { count: number; recovered: number; value: number };
  top_ctas: { location: string; clicks: number }[];
  scroll: Record<'25' | '50' | '75' | '100', number>;
}
