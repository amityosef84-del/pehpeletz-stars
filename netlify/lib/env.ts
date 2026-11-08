/** קריאת משתני סביבה בצד השרת. ערכים לעולם לא מוחזרים ללקוח. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
