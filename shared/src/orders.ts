/** סטטוסי הזמנה ומעברים מותרים: משותף לשרת ולמערכת הניהול. */
export type OrderStatus =
  'pending' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

/** מעברי סטטוס ידניים. paid מגיע רק מהסליקה, refunded רק מזיכוי (שלב 2). */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled'],
  paid: ['packed', 'shipped', 'cancelled'],
  packed: ['paid', 'shipped', 'cancelled'],
  shipped: ['packed', 'delivered'],
  delivered: ['shipped'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה, לאריזה',
  packed: 'ארוזה',
  shipped: 'נשלחה',
  delivered: 'נמסרה',
  cancelled: 'בוטלה',
  refunded: 'זוכתה',
};

/** שם הפעולה על הכפתור שמעביר לסטטוס */
export const STATUS_ACTIONS: Partial<Record<OrderStatus, string>> = {
  paid: 'החזרה לטיפול',
  packed: 'סימון כארוזה',
  shipped: 'סימון כנשלחה',
  delivered: 'סימון כנמסרה',
  cancelled: 'ביטול ההזמנה',
};
