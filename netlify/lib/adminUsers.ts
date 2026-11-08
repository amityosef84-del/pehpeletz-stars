/** ולידציה לניהול מנהלים (טהור, נבדק ביחידה) */
export const MIN_PASSWORD = 8;

export type AdminAction =
  | { action: 'add'; email: string; password: string; role: 'owner' | 'staff' }
  | { action: 'reset'; userId: string; password: string }
  | { action: 'remove'; userId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD)
    return `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD} תווים`;
  if (p.length > 72) return 'הסיסמה ארוכה מדי';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|12345678|87654321|password|qwerty)/i.test(p)) {
    return 'הסיסמה קלה מדי לניחוש';
  }
  return null;
}

export function parseAction(raw: unknown): AdminAction | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'בקשה לא תקינה' };
  const b = raw as Record<string, unknown>;
  if (b.action === 'add') {
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 120) return { error: 'כתובת מייל לא תקינה' };
    const pw = passwordProblem(b.password);
    if (pw) return { error: pw };
    const role = b.role === 'staff' ? 'staff' : 'owner';
    return { action: 'add', email, password: b.password as string, role };
  }
  if (b.action === 'reset') {
    if (typeof b.userId !== 'string' || !UUID_RE.test(b.userId)) return { error: 'משתמש לא תקין' };
    const pw = passwordProblem(b.password);
    if (pw) return { error: pw };
    return { action: 'reset', userId: b.userId, password: b.password as string };
  }
  if (b.action === 'remove') {
    if (typeof b.userId !== 'string' || !UUID_RE.test(b.userId)) return { error: 'משתמש לא תקין' };
    return { action: 'remove', userId: b.userId };
  }
  return { error: 'פעולה לא מוכרת' };
}
