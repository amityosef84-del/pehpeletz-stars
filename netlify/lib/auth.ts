import { serviceClient } from './supabase';

export interface AdminUser {
  id: string;
  email: string | null;
}

/** מאמת את ה-JWT של Supabase מכותרת Authorization ובודק שהמשתמש ב-admin_users. */
export async function requireAdmin(req: Request): Promise<AdminUser | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  return row ? { id: data.user.id, email: data.user.email ?? null } : null;
}
