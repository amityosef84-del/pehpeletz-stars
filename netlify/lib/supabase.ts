import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

let client: SupabaseClient | undefined;

/**
 * Client עם service_role: עוקף RLS. לשימוש רק בתוך Netlify Functions.
 * אסור להחזיר ממנו נתונים ללקוח בלי סינון.
 */
export function serviceClient(): SupabaseClient {
  client ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
