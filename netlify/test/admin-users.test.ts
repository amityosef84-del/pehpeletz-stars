import { describe, expect, it } from 'vitest';
import { parseAction, passwordProblem } from '../lib/adminUsers';

const ID = '11111111-2222-4333-8444-555555555555';

describe('admin users validation', () => {
  it.each(['1111', '1234567', '11111111', '12345678', 'password1'])('דוחה סיסמה חלשה: %s', (p) => {
    expect(passwordProblem(p)).not.toBeNull();
  });
  it('מקבל סיסמה סבירה', () => {
    expect(passwordProblem('Pehpeletz2026')).toBeNull();
  });
  it('add: מנרמל מייל וקובע owner כברירת מחדל', () => {
    expect(
      parseAction({ action: 'add', email: ' Dana@Example.com ', password: 'Pehpeletz2026' }),
    ).toEqual({
      action: 'add',
      email: 'dana@example.com',
      password: 'Pehpeletz2026',
      role: 'owner',
    });
  });
  it('דוחה מייל לא תקין, משתמש לא תקין ופעולה לא מוכרת', () => {
    expect(parseAction({ action: 'add', email: 'x', password: 'Pehpeletz2026' })).toHaveProperty(
      'error',
    );
    expect(parseAction({ action: 'reset', userId: 'x', password: 'Pehpeletz2026' })).toHaveProperty(
      'error',
    );
    expect(parseAction({ action: 'drop_all' })).toHaveProperty('error');
    expect(parseAction({ action: 'remove', userId: ID })).toEqual({ action: 'remove', userId: ID });
  });
});
