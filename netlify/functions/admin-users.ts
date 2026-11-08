import type { Config } from '@netlify/functions';
import { parseAction } from '../lib/adminUsers';
import { requireAdmin } from '../lib/auth';
import { json, readJson } from '../lib/http';
import { serviceClient } from '../lib/supabase';

/**
 * /api/admin-users: ניהול מנהלים בלי תלות במיילים.
 *   GET  → רשימת המנהלים (לכל מנהל מחובר)
 *   POST → add / reset / remove (רק owner). כל פעולה נרשמת ב-audit_log.
 * סיסמאות נקבעות ע"י ה-owner ונשמרות רק ב-Supabase Auth (hash), לא אצלנו.
 */
export default async (req: Request): Promise<Response> => {
  const me = await requireAdmin(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const db = serviceClient();

  if (req.method === 'GET') {
    const { data: rows, error } = await db
      .from('admin_users')
      .select('user_id, email, role, created_at')
      .order('created_at');
    if (error) return json({ error: 'server' }, 500);
    const users = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data } = await db.auth.admin.getUserById(r.user_id);
        return {
          ...r,
          last_sign_in_at: data.user?.last_sign_in_at ?? null,
          me: r.user_id === me.id,
        };
      }),
    );
    return json({ users, canManage: me.role === 'owner' });
  }

  if (me.role !== 'owner') return json({ error: 'רק בעלים יכולים לנהל מנהלים' }, 403);
  const parsed = parseAction(await readJson<unknown>(req, 4_000));
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const audit = (action: string, entityId: string, after?: Record<string, unknown>) =>
    db.from('audit_log').insert({
      actor_id: me.id,
      actor_email: me.email,
      entity: 'admin_user',
      entity_id: entityId,
      action,
      after: after ?? null,
    });

  if (parsed.action === 'add') {
    // משתמש חדש מאושר מיד (בלי מייל). אם כבר קיים, מעדכנים לו סיסמה.
    const created = await db.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
    });
    let userId = created.data.user?.id;
    if (!userId) {
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === parsed.email)?.id;
      if (!userId) return json({ error: created.error?.message ?? 'יצירת המשתמש נכשלה' }, 400);
      await db.auth.admin.updateUserById(userId, {
        password: parsed.password,
        email_confirm: true,
      });
    }
    const { error } = await db
      .from('admin_users')
      .upsert(
        { user_id: userId, email: parsed.email, role: parsed.role },
        { onConflict: 'user_id' },
      );
    if (error) return json({ error: 'server' }, 500);
    await audit('add', userId, { email: parsed.email, role: parsed.role });
    return json({ ok: true });
  }

  if (parsed.action === 'reset') {
    const { data: target } = await db
      .from('admin_users')
      .select('user_id')
      .eq('user_id', parsed.userId)
      .maybeSingle();
    if (!target) return json({ error: 'המנהל לא נמצא' }, 404);
    const { error } = await db.auth.admin.updateUserById(parsed.userId, {
      password: parsed.password,
    });
    if (error) return json({ error: error.message }, 400);
    await audit('reset_password', parsed.userId);
    return json({ ok: true });
  }

  // remove
  if (parsed.userId === me.id) return json({ error: 'אי אפשר להסיר את עצמך' }, 400);
  const { data: owners } = await db.from('admin_users').select('user_id').eq('role', 'owner');
  const target = await db
    .from('admin_users')
    .select('role')
    .eq('user_id', parsed.userId)
    .maybeSingle();
  if (target.data?.role === 'owner' && (owners?.length ?? 0) <= 1)
    return json({ error: 'חייב להישאר לפחות בעלים אחד' }, 400);
  await db.from('admin_users').delete().eq('user_id', parsed.userId);
  // החשבון עצמו נחסם מכניסה (ban) כדי שסשנים פתוחים לא ימשיכו לעבוד
  await db.auth.admin.updateUserById(parsed.userId, { ban_duration: '876000h' });
  await audit('remove', parsed.userId);
  return json({ ok: true });
};

export const config: Config = { path: '/api/admin-users', method: ['GET', 'POST'] };
