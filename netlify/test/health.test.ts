import { afterEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('מחזיר 503 ו-not_configured כשאין חיבור ל-Supabase, בלי לחשוף ערכים', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUMIT_API_KEY', 'secret-value-should-not-leak');
    vi.stubEnv('SUMIT_COMPANY_ID', '123');
    const { default: handler } = await import('../functions/health');
    const res = await handler();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toContain('secret-value-should-not-leak');
    const body = JSON.parse(text);
    expect(body).toMatchObject({
      ok: false,
      db: 'not_configured',
      configured: { supabase: false, sumit: true },
    });
  });
});
