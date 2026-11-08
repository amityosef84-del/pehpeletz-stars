import { useCallback, useEffect, useState } from 'react';
import type { OrderStatus } from '@pehpeletz/shared';
import { adminApi } from '../pages/Admins';
import { demoDb, demoAct } from './demoStore';
import { supabase } from './supabase';

/** שכבת הנתונים של מערכת הניהול: קריאה ישירה מ-Supabase (RLS: מנהלים בלבד), כתיבה דרך /api/admin-action. */

export interface Address {
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  zip?: string;
}
export interface OrderItem {
  name_snapshot: string;
  units_snapshot: number;
  unit_price: number;
  qty: number;
}
export interface CustomerLite {
  id: string;
  name: string;
  email: string;
  phone: string;
}
export interface Order {
  id: string;
  order_number: number;
  status: OrderStatus;
  payment_status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  refunded_amount: number;
  coupon_code: string | null;
  shipping_address: Address;
  notes: string | null;
  tracking_number: string | null;
  utm: Record<string, string> | null;
  sumit_document_url: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  cancelled_at: string | null;
  customer: CustomerLite | null;
  items: OrderItem[];
}
export interface AuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}
export interface CustomerOrder {
  id: string;
  order_number: number;
  total: number;
  refunded_amount: number;
  payment_status: Order['payment_status'];
  status: OrderStatus;
  created_at: string;
}
export interface Customer extends CustomerLite {
  marketing_consent: boolean;
  created_at: string;
  orders: CustomerOrder[];
}
export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  units: number;
  price_ils: number;
  compare_at_price: number | null;
  stock: number | null;
  active: boolean;
  sort: number;
}
export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_total: number;
  usage_limit: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}
export interface Abandoned {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  cart: { productId: string; qty: number }[];
  recovered: boolean;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface ShippingSetting {
  mode: 'per_unit' | 'flat' | 'free';
  amount: number;
  freeOverSubtotal?: number;
  label?: string;
}
export interface StoreSetting {
  name: string;
  legal_name?: string;
  business_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
}
export interface Settings {
  shipping: ShippingSetting;
  store: StoreSetting;
}

const ORDER_COLS =
  'id, order_number, status, payment_status, subtotal, discount, shipping, total, refunded_amount, coupon_code, shipping_address, notes, tracking_number, utm, sumit_document_url, created_at, paid_at, shipped_at, cancelled_at, customer:customers(id, name, email, phone), items:order_items(name_snapshot, units_snapshot, unit_price, qty)';

const num = <T extends object>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys)
    if (out[k] !== null && out[k] !== undefined)
      (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
};
const normOrder = (o: Order): Order =>
  num({ ...o, items: (o.items ?? []).map((i) => num(i, ['unit_price'])) }, [
    'subtotal',
    'discount',
    'shipping',
    'total',
    'refunded_amount',
  ]);

function db() {
  if (!supabase) throw new Error('המסד לא מחובר');
  return supabase;
}
async function q<T>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error('טעינת הנתונים נכשלה. בדקו חיבור ונסו שוב');
  return data as T;
}

export const api = {
  async role(demo: boolean): Promise<'owner' | 'staff'> {
    if (demo) return 'owner';
    const { data } = await db().auth.getUser();
    const row = await q<{ role: 'owner' | 'staff' } | null>(
      db()
        .from('admin_users')
        .select('role')
        .eq('user_id', data.user?.id ?? '')
        .maybeSingle(),
    );
    return row?.role ?? 'staff';
  },
  async orders(demo: boolean): Promise<Order[]> {
    if (demo) return demoDb().orders;
    const rows = await q<Order[]>(
      db().from('orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(1000),
    );
    return rows.map(normOrder);
  },
  async order(demo: boolean, id: string): Promise<{ order: Order; log: AuditEntry[] } | null> {
    if (demo) {
      const d = demoDb();
      const order = d.orders.find((o) => o.id === id);
      return order ? { order, log: d.audit.filter((a) => a.entity_id === id) } : null;
    }
    const order = await q<Order | null>(
      db().from('orders').select(ORDER_COLS).eq('id', id).maybeSingle(),
    );
    if (!order) return null;
    const log = await q<AuditEntry[]>(
      db()
        .from('audit_log')
        .select('id, actor_email, action, before, after, note, created_at')
        .eq('entity', 'order')
        .eq('entity_id', id)
        .order('created_at', { ascending: false }),
    );
    return { order: normOrder(order), log };
  },
  async customers(demo: boolean): Promise<Customer[]> {
    if (demo) return demoDb().customers;
    const rows = await q<Customer[]>(
      db()
        .from('customers')
        .select(
          'id, name, email, phone, marketing_consent, created_at, orders(id, order_number, total, refunded_amount, payment_status, status, created_at)',
        )
        .order('created_at', { ascending: false })
        .limit(2000),
    );
    return rows.map((c) => ({
      ...c,
      orders: c.orders.map((o) => num(o, ['total', 'refunded_amount'])),
    }));
  },
  async products(demo: boolean): Promise<Product[]> {
    if (demo) return demoDb().products;
    const rows = await q<Product[]>(
      db()
        .from('products')
        .select(
          'id, slug, name, description, units, price_ils, compare_at_price, stock, active, sort',
        )
        .order('sort'),
    );
    return rows.map((p) => num(p, ['price_ils', 'compare_at_price']));
  },
  async coupons(demo: boolean): Promise<Coupon[]> {
    if (demo) return demoDb().coupons;
    const rows = await q<Coupon[]>(
      db().from('coupons').select('*').order('created_at', { ascending: false }),
    );
    return rows.map((c) => num(c, ['value', 'min_total']));
  },
  async abandoned(demo: boolean): Promise<Abandoned[]> {
    if (demo) return demoDb().abandoned;
    return q<Abandoned[]>(
      db()
        .from('abandoned_checkouts')
        .select('id, name, email, phone, cart, recovered, contacted_at, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500),
    );
  },
  async settings(demo: boolean): Promise<Settings> {
    if (demo) return demoDb().settings;
    const rows = await q<{ key: string; value: unknown }[]>(
      db().from('settings').select('key, value').in('key', ['shipping', 'store']),
    );
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    return {
      shipping: (get('shipping') as ShippingSetting) ?? { mode: 'per_unit', amount: 50 },
      store: (get('store') as StoreSetting) ?? { name: 'הכוכבים של פהפלצת' },
    };
  },
  /** פעולת כתיבה. מחזיר את תשובת השרת (למשל rebuild: 'started'). */
  async act(demo: boolean, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (demo) return demoAct(body);
    return adminApi('/api/admin-action', 'POST', body);
  },
};

/** טעינת נתונים עם מצב טעינה/שגיאה ורענון. נטען מחדש כשה-deps משתנים או ב-reload(). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
