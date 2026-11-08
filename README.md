# הכוכבים של פהפלצת

דף נחיתה ממוקד המרה, תשלום בסאמיט ומערכת ניהול לערכת הצחצוח "הכוכבים של פהפלצת".
האפיון המלא: [SPEC.md](SPEC.md). התוכן מהאתר הישן: [docs/old-site-content.md](docs/old-site-content.md).

| שלב | מה                                        | סטטוס                          |
| --- | ----------------------------------------- | ------------------------------ |
| 0   | הקמה: repo, Netlify, Supabase, CI         | ✅ (Supabase ממתין למפתח תקין) |
| 1   | דף נחיתה, מדיניות, נגישות, ביצועים        | ✅ ממתין לאישור                |
| 2   | רכישה: create-order, סאמיט, חשבונית, מייל | ⏳                             |
| 3   | מעקב, פיקסלים, CAPI, דשבורד               | ✅ קוד מוכן, ממתין ל-Supabase  |
| 4   | Admin                                     | ⏳                             |
| 5   | ליטוש והשקה                               | ⏳                             |

## מבנה

```
site/                 דף הנחיתה (Astro, סטטי). נבנה ל-site/dist
admin/                אפליקציית ניהול (React + Vite). נבנית ל-site/dist/admin
shared/               קוד משותף לשרת ולבדיקות (חישוב מחירים)
netlify/functions/    Netlify Functions (TypeScript). כל פונקציה מגדירה path משלה תחת /api
netlify/lib/          עזרים לפונקציות (env, Supabase service client)
netlify/test/         בדיקות לפונקציות (מחוץ לתיקיית functions בכוונה)
supabase/migrations/  סכמת ה-DB
supabase/tests/       shim של Supabase + בדיקות RLS ל-CI
scripts/qa/           בדיקות QA: נגישות (axe), זרימת תשלום, צילומי מסך
scripts/assets/       יצירת תמונת השיתוף (OG)
```

### דף הנחיתה (`site/`)

| קובץ                            | מה יש בו                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `site/src/config/landing.ts`    | **כל הטקסטים** של הדף: כותרות, כאב, פתרון, מה בערכה, צעדים, המלצות, שאלות ותשובות. לשינוי טקסט או ל-A/B עורכים כאן בלבד |
| `site/src/config/packages.ts`   | החבילות, הסדר, תגיות ("הכי פופולרי") וכלל המשלוח. משקף את ה-seed ב-DB                                                   |
| `site/src/config/site.ts`       | וואטסאפ, שעות מענה, פרטי עוסק (ממתינים להשלמה), דגלים                                                                   |
| `site/src/components/sections/` | מקטע לכל חלק בדף, לפי הסדר בסעיף 6 באפיון                                                                               |
| `site/src/scripts/fx.ts`        | אפקטים: חשיפה בגלילה, סצנות גלילה, parallax, הטיית כרטיסים, פיצוץ כוכבים                                                |
| `site/src/scripts/starfield.ts` | שדה הכוכבים ב-canvas + קפיצת ה-warp בכניסה                                                                              |
| `site/src/scripts/checkout.ts`  | ולידציה, סיכום, טיוטה מקומית ושליחה ל-`/api/create-order`                                                               |
| `site/src/pages/*.astro`        | דף הבית, תשלום, תודה, מדיניות, נגישות, צור קשר, 404                                                                     |
| `site/src/assets/`              | דמויות (מתוך קובצי ה-PDF של המדבקות והלוח), תמונות מוצר, לוגו                                                           |

כל האנימציות כבויות כשבמכשיר מוגדרת "הפחתת תנועה". אין סקריפטים inline (בשביל CSP קשיח).

`public/` מהאפיון יושב ב-`site/public`, כמקובל ב-Astro.

## הרצה מקומית

דרישות: Node 22.23.4 ומעלה (`.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

| פקודה                   | מה עושה                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | דף הנחיתה ב-localhost:4321                                       |
| `npm run dev -w admin`  | האדמין ב-localhost:5174/admin                                    |
| `npm run build`         | build מלא (אתר + אדמין) ל-`site/dist`                            |
| `npm test`              | בדיקות Vitest                                                    |
| `npm run lint`          | ESLint                                                           |
| `npm run typecheck`     | TypeScript + astro check                                         |
| `npm run db:validate`   | מריץ migrations + בדיקות RLS על Postgres ריק (`DATABASE_URL`)    |
| `npm run qa:a11y`       | axe (WCAG 2.1 AA) על כל העמודים, מובייל ודסקטופ. דורש שרת ב-4321 |
| `npm run qa:checkout`   | בדיקת זרימה מלאה לעמוד התשלום                                    |
| `npm run qa:lighthouse` | Lighthouse CI על ה-build (סף: ביצועים 85, נגישות 95)             |

לבדיקות ה-QA צריך שרת: `npm run build && (cd site && npx astro preview)`.

## מעקב ואנליטיקס (שלב 3)

```
דפדפן                                   שרת (Netlify Functions)              Supabase
site/src/scripts/track.ts  ─ beacon ─▶  /api/track ── ingest_events() ──▶  sessions, events
  (visitor/session, UTM, אירועים)        (ולידציה, rate limit, בוטים)
site/src/scripts/checkout.ts ───────▶  /api/checkout-draft ───────────▶  abandoned_checkouts
site/src/scripts/pixels.ts  ─ אחרי הסכמה ─▶ Meta Pixel / GA4 / TikTok (אותו event_id)
                                       netlify/lib/conversions.ts ─▶  Meta CAPI / GA4 MP / TikTok Events API
                                       (Purchase מהשרת אחרי אימות תשלום, שלב 2)
admin (React) ── rpc('analytics_summary') ─────────────────────────▶  מדדים, משפך, פילוחים
```

- **מזהים:** `pp_vid` (מבקר, קבוע) ו-`pp_sess` (ביקור, 30 דקות חוסר פעילות או קמפיין חדש) ב-localStorage.
- **אירועים:** `page_view`, `scroll_25/50/75/100`, `cta_click` (לפי `data-cta`), `view_pricing`, `select_package`,
  `begin_checkout`, `checkout_field_filled` (שם השדה בלבד), `add_payment_info`, `coupon_applied`, `faq_open`,
  `whatsapp_click`, `video_play`. `purchase` נדחה מהדפדפן ונרשם רק בשרת.
- **אמינות:** שליחה ב-`sendBeacon` כל 3 שניות וביציאה מהדף, ועותק ב-sessionStorage שנשלח שוב בעמוד הבא.
  השרת מתעלם מ-`event_id` שכבר נקלט.
- **פרטיות:** referrer נשמר כדומיין בלבד, בלי IP (rate limit לפי hash יומי), בלי תוכן שדות. פיקסלים שיווקיים
  רק אחרי הסכמה. בלי `PUBLIC_*_PIXEL_ID` אין באנר ואין סקריפטים חיצוניים.
- **דשבורד:** `/admin` → כניסה עם אימייל וסיסמה (Supabase Auth, הרשמה סגורה; אדמינים מוזמנים).
  `?demo` מציג נתוני דוגמה כשמסד הנתונים לא מחובר.
- **הקמת Supabase:** `node scripts/setup/provision-supabase.mjs` יוצר פרויקט, מריץ migrations ושומר את
  המפתחות ב-Netlify.
- **בדיקות:** `npm run qa:tracking` (אירועים ושיוך), `npm run qa:pixels` (באנר ופיקסלים, דורש build עם מזהים
  פיקטיביים), ובדיקות SQL ב-`supabase/tests/20_tracking_test.sql`.

## מערכת הניהול (שלב 4)

כתובת: `/admin/`. תצוגה עם נתוני דוגמה: `/admin/?demo` (רק כשהמסד לא מחובר, למשל בפיתוח מקומי).

| מסך                       | מה עושים בו                                                                                                    | מי    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ----- |
| בית                       | הזמנות היום, מה מחכה למשלוח, עגלות לטיפול                                                                      | כולם  |
| הזמנות                    | חיפוש, סינון, ייצוא לאקסל, פרטי הזמנה, שינוי סטטוס, מספר מעקב, הערות פנימיות, הדפסת תעודת משלוח, וואטסאפ ללקוח | כולם  |
| עגלות נטושות              | הודעת וואטסאפ מוכנה עם קישור חזרה לקופה, סימון "פנינו"                                                         | כולם  |
| לקוחות                    | שווי לקוח, היסטוריה, ייצוא (כולל רק מאשרי דיוור)                                                               | כולם  |
| מוצרים / קופונים / הגדרות | מחיר, מלאי, הסתרה, קופונים, משלוח, פרטי עסק                                                                    | בעלים |
| מנהלים                    | הוספה עם סיסמה בלי מייל, איפוס, הסרה                                                                           | בעלים |

- קריאה: ישירות מ-Supabase עם RLS (מנהלים בלבד). כתיבה: רק דרך `/api/admin-action`
  (ולידציה ב-`netlify/lib/adminActions.ts`, הרשאה לפי תפקיד, תיעוד ב-`audit_log`).
- מעברי סטטוס מוגדרים ב-`shared/src/orders.ts`. `paid` מגיע רק מהסליקה, `refunded` רק מזיכוי.
- האתר הציבורי קורא את החבילות, המשלוח ופרטי העסק בזמן build דרך `public_catalog()`
  (`site/src/config/catalog.ts`). שמירה במערכת הניהול מפעילה `NETLIFY_BUILD_HOOK_URL`
  והאתר מתעדכן תוך כ-2 דקות. בלי חיבור למסד הבנייה ממשיכה עם ברירות המחדל שבקוד.
- בדיקות: `npm run qa:admin` (זרימה מלאה בנתוני דוגמה) ו-`npm run qa:a11y` (כולל מסכי הניהול).

## פריסה ל-Netlify

1. Netlify → Add new site → Import from Git → בחירת ה-repo. Production branch: `main`.
   ההגדרות (build command, publish dir, functions, headers) נקראות מ-`netlify.toml`.
2. Site configuration → Environment variables: להגדיר את המשתנים מ-[.env.example](.env.example).
   **אף סוד לא נכנס לקוד או לצ'אט.**
3. אחרי פריסה: `https://<site>/api/health` אמור להחזיר `{"ok": true, "db": "ok", "activeProducts": 4}`.
4. דגלים: `PUBLIC_INDEXABLE=true` רק בהשקה (עד אז כל העמודים `noindex`). `PUBLIC_CHECKOUT_ENABLED=true`
   אחרי ש-`create-order` עולה (שלב 2). עד אז כפתור התשלום פותח וואטסאפ עם פרטי ההזמנה.

האתר מחובר ל-Netlify בשם `pehpeletz-stars` (https://pehpeletz-stars.netlify.app). כל push ל-`main` נפרס
ל-production, ו-push לענף העבודה נפרס ככתובת preview.

## Supabase

1. פותחים פרויקט חדש ב-supabase.com (region: Frankfurt, הכי קרוב לישראל).
2. ב-Netlify מגדירים `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (Project Settings → API).
3. migrations:
   - **אוטומטי (מומלץ):** ב-GitHub → Settings → Secrets and variables → Actions מגדירים
     `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens), `SUPABASE_DB_PASSWORD`
     ו-`SUPABASE_PROJECT_REF`. כל merge ל-`main` שמשנה את `supabase/migrations` מריץ
     `supabase db push` (`.github/workflows/db-migrate.yml`). אפשר גם להריץ ידנית מ-Actions.
   - **ידני:** להדביק את קובצי `supabase/migrations/*.sql` לפי הסדר ב-SQL Editor.
4. משתמש אדמין ראשון (עד שמסך ניהול המשתמשים ייבנה בשלב 4):
   Authentication → Users → Add user, ואז ב-SQL Editor:
   ```sql
   insert into public.admin_users (user_id, email, role)
   select id, email, 'owner' from auth.users where email = 'YOUR_EMAIL';
   ```
5. גיבויים: בתוכנית החינמית אין גיבוי יומי (SPEC §10). לפני השקה כדאי לעבור לתוכנית בתשלום.

### מודל הרשאות

- RLS פעיל בכל הטבלאות. ל-`anon` אין שום הרשאה.
- `authenticated` מקבל קריאה בלבד, ו-RLS מצמצם אותה למשתמשים שרשומים ב-`admin_users`.
- כל כתיבה עוברת דרך Netlify Functions עם `service_role`. כך כל שינוי מהאדמין נרשם ב-`audit_log`.
- `scripts/db-validate.sh` בודק את כל זה ב-CI מול Postgres נקי.

## תמחור (החלטה מ-2026-11-08)

- הערכה עצמה במתנה (`price_ils = 0`), ומשלמים רק משלוח: **50 ש"ח לכל ערכה**.
  ערכה אחת 50, שתיים 100, שלוש 150, ארבע 200.
- כלל המשלוח שמור ב-`settings.shipping` (`{"mode": "per_unit", "amount": 50}`) וניתן לשינוי בלי קוד.
- החישוב ב-`shared/src/pricing.ts`, רק בשרת, באגורות שלמות. קופונים מחושבים על מוצרים + משלוח.
- התגיות "ההצעה הטובה ביותר" / "המשתלם ביותר" הוסרו: המחיר לערכה זהה בכל החבילות.

## סאמיט (אומת מול התיעוד הרשמי, 2026-11-08)

מקור: [תיעוד ה-API](https://app.sumit.co.il/developers/api/) ו-[Swagger](https://app.sumit.co.il/swagger/v1/swagger.json).
שרת: `https://api.sumit.co.il`. כל קריאה היא `POST` עם JSON, וכוללת
`Credentials: { CompanyID, APIKey }` (מפתחות: app.sumit.co.il/developers/keys).

מצב התשלום שנבחר: **עמוד תשלום מאובטח של סאמיט (redirect)**. פרטי אשראי לא עוברים בשרתים שלנו.

| שלב               | Endpoint                                                            | הערות                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| פתיחת תשלום       | `/billing/payments/beginredirect/`                                  | `Customer`, `Items` (`UnitPrice`, `Quantity`), `VATIncluded`, `DocumentType` (חשבונית מס קבלה = `1`), `RedirectURL`, `CancelRedirectURL`, `ExternalIdentifier` (= מזהה ההזמנה שלנו), `MaximumPayments` (0 = בלי תשלומים), `ExpirationHours`. מחזיר `Data.RedirectURL` |
| חזרה מהתשלום      | —                                                                   | סאמיט מוסיף ל-`RedirectURL` את `OG-PaymentID`, `OG-CustomerID`, `OG-ExternalIdentifier`                                                                                                                                                                               |
| אימות בשרת        | `/billing/payments/get/`                                            | לפי `PaymentID`. מחזיר `ValidPayment`, `Amount`, `ExternalIdentifier`, `DocumentID`, `Status`. **לא סומכים על פרמטרי ה-URL לבד**                                                                                                                                      |
| התאמה תקופתית     | `/billing/payments/list/`                                           | cron למקרה שהלקוח סגר את הדפדפן לפני החזרה                                                                                                                                                                                                                            |
| מסמך              | `/accounting/documents/getpdf/`, `/accounting/documents/send/`      | קישור/שליחת החשבונית                                                                                                                                                                                                                                                  |
| טוקניזציה (חלופה) | `/creditguy/vault/tokenizesingleuse/` + `/billing/payments/charge/` | לא בשימוש כרגע                                                                                                                                                                                                                                                        |

לבירור מול התמיכה של סאמיט לפני שלב 2:

- אין endpoint ייעודי להחזר כספי. ב-`charge` יש `SupportCredit` (זיכוי כשהסכום שלילי). צריך לאשר את הדרך הנכונה.
- ה-Triggers (`/triggers/triggers/subscribe/`) מבוססים על תיקיות CRM, ואין webhook ייעודי לתשלום.
- לא נמצא sandbox. ב-`charge` יש `AuthoriseOnly`, אבל לא ב-`beginredirect`. אם אין מסוף בדיקה, בודקים בחיוב אמיתי קטן ואחריו החזר.
- איך מוצג במסמך פריט במחיר 0 + משלוח.

## פתוח לבדיקה משפטית

- הצגת "ערכה במתנה, משלמים רק משלוח" כשכל ערכה נוספת מוסיפה 50 ש"ח "משלוח" (חוק הגנת הצרכן, הטעיה ופירוט מחיר).
- פרטי העוסק (שם, מספר, כתובת) באתר ובמדיניות. נדרשים בעסקת מכר מרחוק.
- מדיניות ביטול/החזרות: 14 יום, מוצר באריזה סגורה בלבד.
- פרטי רכז/ת נגישות בהצהרת הנגישות.
