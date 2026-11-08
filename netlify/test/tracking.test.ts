import { describe, expect, it } from 'vitest';
import { cleanPayload } from '../lib/tracking';

const V = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const E = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const now = new Date('2026-11-08T12:00:00Z');

describe('cleanPayload', () => {
  it('מקבל אירועים מוכרים ומנקה מאפיינים', () => {
    const r = cleanPayload(
      {
        visitor_id: V,
        session_id: S,
        session: {
          utm_source: 'facebook',
          device: 'mobile',
          referrer: 'https://l.facebook.com/l.php?u=secret',
          landing_path: '/?utm_source=facebook#x',
        },
        events: [
          { id: E(1), name: 'page_view', path: '/', ts: now.getTime() },
          { id: E(2), name: 'cta_click', props: { location: 'hero', 'bad key': 1, obj: { a: 1 } } },
        ],
      },
      { isBot: false, country: 'IL', siteHost: 'pehpeletz-stars.netlify.app', now },
    )!;
    expect(r.session.referrer).toBe('l.facebook.com');
    expect(r.session.landing_path).toBe('/?utm_source=facebook');
    expect(r.session.country).toBe('IL');
    expect(r.events).toHaveLength(2);
    expect(r.events[1]!.props).toEqual({ location: 'hero' });
  });

  it('דוחה אירוע purchase מהדפדפן, שמות לא מוכרים ומזהים לא תקינים', () => {
    const r = cleanPayload(
      {
        visitor_id: V,
        session_id: S,
        events: [
          { id: E(1), name: 'purchase', props: { value: 1 } },
          { id: E(2), name: 'drop_table' },
          { id: 'not-a-uuid', name: 'page_view' },
          { id: E(3), name: 'faq_open' },
        ],
      },
      { isBot: false, now },
    )!;
    expect(r.events.map((e) => e.name)).toEqual(['faq_open']);
  });

  it('referrer מאותו אתר לא נשמר; device לא מוכר מתאפס', () => {
    const r = cleanPayload(
      {
        visitor_id: V,
        session_id: S,
        session: { referrer: 'https://site.test/x', device: 'fridge' },
        events: [],
      },
      { isBot: true, siteHost: 'site.test', now },
    )!;
    expect(r.session.referrer).toBeNull();
    expect(r.session.device).toBeNull();
    expect(r.session.is_bot).toBe(true);
  });

  it('מגביל ל-50 אירועים ומתקן זמנים רחוקים', () => {
    const events = Array.from({ length: 80 }, (_, i) => ({ id: E(i), name: 'scroll_25', ts: 0 }));
    const r = cleanPayload({ visitor_id: V, session_id: S, events }, { isBot: false, now })!;
    expect(r.events).toHaveLength(50);
    expect(r.events[0]!.ts).toBe(now.toISOString());
  });

  it('מחזיר null לקלט לא תקין', () => {
    expect(
      cleanPayload({ visitor_id: 'x', session_id: S, events: [] }, { isBot: false }),
    ).toBeNull();
    expect(
      cleanPayload({ visitor_id: V, session_id: S, events: 'x' }, { isBot: false }),
    ).toBeNull();
  });
});
