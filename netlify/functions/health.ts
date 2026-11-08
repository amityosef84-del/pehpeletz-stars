import type { Config } from '@netlify/functions';
import { env } from '../lib/env';
import { serviceClient } from '../lib/supabase';

/**
 * GET /api/health: בדיקת חיים לפריסה.
 * מחזיר אילו הגדרות קיימות (true/false בלבד, בלי ערכים) והאם ה-DB זמין.
 */
export default async (): Promise<Response> => {
  const configured = {
    supabase: Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')),
    sumit: Boolean(env('SUMIT_COMPANY_ID') && env('SUMIT_API_KEY')),
    email: Boolean(env('RESEND_API_KEY')),
  };

  let db: 'ok' | 'error' | 'not_configured' = 'not_configured';
  let activeProducts: number | null = null;
  if (configured.supabase) {
    const { count, error } = await serviceClient()
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    db = error ? 'error' : 'ok';
    activeProducts = error ? null : count;
    if (error) console.error('health: db check failed', error.message);
  }

  const ok = db === 'ok';
  return Response.json(
    { ok, db, activeProducts, configured, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
};

export const config: Config = {
  path: '/api/health',
  method: 'GET',
};
