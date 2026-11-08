/**
 * פרטי העסק, יצירת קשר ודגלים. פריטים עם TODO_LEGAL ממתינים להשלמה/בדיקת עו"ד
 * ומסומנים בדפי המדיניות בצבע בולט כדי שלא יתפספסו.
 */
export const TODO_LEGAL = '[להשלמה]';

export const site = {
  brand: 'הכוכבים של פהפלצת',
  shortBrand: 'פהפלצת',
  tagline: 'לא עוד קרבות על הצחצוח, עכשיו זה זמן הרפתקאות',
  description:
    'ערכת גיבורי־על לצחצוח שיניים לילדים: ספר הרפתקאות מאויר, לוח צחצוח שבועי, מדבקות עידוד, מברשת אישית וחוברת צביעה. הופכים את הצחצוח למשחק.',
  locale: 'he_IL',

  // יצירת קשר
  whatsapp: '972506705556',
  whatsappDisplay: '050-670-5556',
  whatsappMessage: 'היי, יש לי שאלה על ערכת הכוכבים של פהפלצת',
  supportEmail: '', // TODO: מייל תמיכה
  supportHours: 'א׳–ה׳, 9:00–18:00',

  // פרטי עוסק (חובה בעסקת מכר מרחוק). להשלמה ע"י הלקוח/עו"ד.
  legal: {
    businessName: TODO_LEGAL,
    businessId: TODO_LEGAL,
    address: TODO_LEGAL,
    accessibilityCoordinator: TODO_LEGAL,
    accessibilityContact: TODO_LEGAL,
    policiesUpdated: '8 בנובמבר 2026',
  },

  shipping: {
    perKit: 50,
    maxBusinessDays: 10,
    label: 'משלוח עד הבית',
  },

  returnsDays: 14,

  /**
   * האם מנועי חיפוש רשאים לאנדקס. כבוי עד ההשקה (שלב 5).
   * מופעל ע"י PUBLIC_INDEXABLE=true ב-Netlify.
   */
  indexable: import.meta.env.PUBLIC_INDEXABLE === 'true',

  /** כפתור התשלום פעיל רק כשהפונקציה create-order קיימת (שלב 2). */
  checkoutEnabled: import.meta.env.PUBLIC_CHECKOUT_ENABLED === 'true',
} as const;

export function whatsappLink(message: string = site.whatsappMessage): string {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const nav = {
  policies: [
    { href: '/privacy', label: 'מדיניות פרטיות' },
    { href: '/returns', label: 'ביטול עסקה והחזרות' },
    { href: '/terms', label: 'תקנון ותנאי שימוש' },
    { href: '/accessibility', label: 'הצהרת נגישות' },
    { href: '/contact', label: 'צור קשר' },
  ],
} as const;
