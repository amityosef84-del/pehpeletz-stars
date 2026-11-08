/** כללי סיסמה (זהים לשרת) ומחולל סיסמאות קריאות */
export const MIN_PASSWORD = 8;

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `לפחות ${MIN_PASSWORD} תווים`;
  if (p.length > 72) return 'ארוכה מדי';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|12345678|87654321|password|qwerty)/i.test(p)) {
    return 'קלה מדי לניחוש';
  }
  return null;
}

const WORDS = [
  'Star',
  'Moon',
  'Robot',
  'Fairy',
  'Comet',
  'Rocket',
  'Galaxy',
  'Hero',
  'Orbit',
  'Nova',
  'Brush',
  'Smile',
];

/** סיסמה שקל להקריא בטלפון: Word-Word-1234 */
export function generatePassword(): string {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  const w1 = WORDS[r[0]! % WORDS.length]!;
  let w2 = WORDS[r[1]! % WORDS.length]!;
  if (w2 === w1) w2 = WORDS[(r[1]! + 1) % WORDS.length]!;
  return `${w1}-${w2}-${1000 + (r[2]! % 9000)}`;
}
