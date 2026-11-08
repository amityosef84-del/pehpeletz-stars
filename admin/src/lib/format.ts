export const nf = new Intl.NumberFormat('he-IL');
export const ils = (n: number) =>
  `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}\u00A0₪`;
export const pct = (n: number) =>
  `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 1 })}%`;
export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

export const STEP_LABELS: Record<string, string> = {
  visit: 'ביקור',
  view_pricing: 'צפייה בחבילות',
  select_package: 'בחירת חבילה',
  begin_checkout: 'עמוד תשלום',
  add_payment_info: 'לחיצה על תשלום',
  purchase: 'רכישה',
};
export const DEVICE_LABELS: Record<string, string> = {
  mobile: 'נייד',
  desktop: 'מחשב',
  tablet: 'טאבלט',
  unknown: 'לא ידוע',
};

export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const dateOnly = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('he-IL') : '—';

/** "לפני 3 שעות" */
export function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}

/** מספר ישראלי → פורמט וואטסאפ (972...) */
export function waNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`;
  if (/^9725\d{8}$/.test(d)) return d;
  return null;
}
export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
export const firstName = (name: string | null | undefined) =>
  (name ?? '').trim().split(/\s+/)[0] ?? '';

export const PAY_LABELS: Record<string, string> = {
  unpaid: 'לא שולם',
  pending: 'בתהליך',
  paid: 'שולם',
  failed: 'נכשל',
  refunded: 'זוכה',
  partially_refunded: 'זוכה חלקית',
};
