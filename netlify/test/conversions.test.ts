/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ga4Payload,
  gaClientIdFromCookie,
  metaPayload,
  normPhone,
  sendPurchase,
  sha256,
  tiktokPayload,
  type PurchaseEvent,
} from '../lib/conversions';

const base: PurchaseEvent = {
  eventId: 'evt-1',
  orderNumber: '1001',
  value: 100,
  currency: 'ILS',
  items: [{ id: 'kit-2', name: 'כוח על זוגי', quantity: 1, price: 100 }],
  email: '  Dana@Example.com ',
  phone: '050-123-4567',
  visitorId: 'v-1',
  sourceUrl: 'https://example.com/thank-you',
  fbp: 'fb.1.1.2',
  fbclid: 'abc',
  eventTime: new Date('2026-11-08T12:00:00Z'),
  consent: true,
};

afterEach(() => vi.unstubAllEnvs());

describe('conversions payloads', () => {
  it('מנרמל ומצפין מייל וטלפון', () => {
    expect(normPhone('050-123-4567')).toBe('972501234567');
    expect(normPhone('+972 50 123 4567')).toBe('972501234567');
    expect(normPhone('03-1234567')).toBeNull();
    const m = (metaPayload(base) as { data: Record<string, any>[] }).data[0]!;
    expect(m.user_data.em).toEqual([sha256('dana@example.com')]);
    expect(m.user_data.ph).toEqual([sha256('972501234567')]);
    expect(m.user_data.fbc).toBe('fb.1.1794139200000.abc');
    expect(m.event_id).toBe('evt-1');
    expect(m.custom_data).toMatchObject({
      currency: 'ILS',
      value: 100,
      num_items: 1,
      content_ids: ['kit-2'],
    });
    expect(JSON.stringify(m)).not.toContain('Dana');
  });

  it('GA4 משתמש ב-client_id מהעוגייה', () => {
    expect(gaClientIdFromCookie('a=1; _ga=GA1.1.12345.67890; b=2')).toBe('12345.67890');
    const g = ga4Payload({ ...base, gaClientId: '12345.67890' });
    expect(g.client_id).toBe('12345.67890');
    expect(g.events[0]!.params).toMatchObject({
      transaction_id: '1001',
      value: 100,
      currency: 'ILS',
    });
  });

  it('TikTok: CompletePayment עם טלפון בפורמט +E.164 מוצפן', () => {
    const t = tiktokPayload(base, 'PIX') as any;
    expect(t.event_source_id).toBe('PIX');
    expect(t.data[0].event).toBe('CompletePayment');
    expect(t.data[0].user.phone).toBe(sha256('+972501234567'));
  });
});

describe('sendPurchase', () => {
  it('בלי הסכמה לא שולח כלום', async () => {
    const f = vi.fn();
    const r = await sendPurchase({ ...base, consent: false }, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
    expect(r.every((x) => x.skipped === 'no_consent')).toBe(true);
  });

  it('שולח רק לפלטפורמות שמוגדרות', async () => {
    vi.stubEnv('PUBLIC_META_PIXEL_ID', '123');
    vi.stubEnv('META_CAPI_TOKEN', 'tok');
    vi.stubEnv('PUBLIC_GA4_ID', '');
    vi.stubEnv('TIKTOK_EVENTS_TOKEN', '');
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    const r = await sendPurchase(base, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('/123/events?access_token=tok');
    expect(r.find((x) => x.platform === 'meta')).toMatchObject({ ok: true, status: 200 });
    expect(r.find((x) => x.platform === 'ga4')?.skipped).toBe('not_configured');
  });

  it('כשל בפלטפורמה לא זורק', async () => {
    vi.stubEnv('PUBLIC_META_PIXEL_ID', '123');
    vi.stubEnv('META_CAPI_TOKEN', 'tok');
    const f = vi.fn(async () => {
      throw new Error('network');
    });
    const r = await sendPurchase(base, f as unknown as typeof fetch);
    expect(r.find((x) => x.platform === 'meta')?.ok).toBe(false);
  });
});
