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
