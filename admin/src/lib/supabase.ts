import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const configured = Boolean(url && anon);

/**
 * כניסה דרך קישור (הזמנה / איפוס סיסמה): חייבים לזהות את זה לפני ש-Supabase קורא את
 * הכתובת ומנקה אותה, אחרת המשתמש נכנס בלי לבחור סיסמה ונשאר בלי סיסמה.
 * הדגל נשמר ב-sessionStorage עד שנבחרה סיסמה.
 */
const NEED_PW = 'pp_need_password';
const fromLink = /(?:^|[#&?])type=(invite|recovery|magiclink)/.test(
  location.hash + location.search,
);
try {
  if (fromLink) sessionStorage.setItem(NEED_PW, '1');
} catch {
  /* מתעלמים */
}
export function needsPassword(): boolean {
  try {
    return fromLink || sessionStorage.getItem(NEED_PW) === '1';
  } catch {
    return fromLink;
  }
}
export function passwordSet() {
  try {
    sessionStorage.removeItem(NEED_PW);
  } catch {
    /* מתעלמים */
  }
}

export const supabase: SupabaseClient | null = configured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
