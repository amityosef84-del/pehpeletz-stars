// הקמת Supabase מקצה לקצה ושמירת המפתחות ב-Netlify. לא מדפיס אף סוד.
//
//   node scripts/setup/provision-supabase.mjs [--org <slug>] [--name pehpeletz-stars]
//
// אימות: בסביבת הענן של Claude ה-proxy מוסיף את הטוקנים לבד. מחוץ לה:
//   SUPABASE_ACCESS_TOKEN=sbp_... NETLIFY_AUTH_TOKEN=... node scripts/setup/provision-supabase.mjs
//
// מה הסקריפט עושה (אידמפוטנטי ככל האפשר):
//  1. מוצא/יוצר פרויקט בשם הנתון (region: eu-central-1, פרנקפורט)
//  2. מחכה שיהיה פעיל ומריץ את כל קובצי supabase/migrations שעוד לא רצו
//  3. מגדיר Auth: site_url וכתובות redirect לאדמין
//  4. שומר ב-Netlify: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (secret)
import { randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
import { readdirSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc),
      [],
    ),
);
const NAME = args.name ?? 'pehpeletz-stars';
const REGION = 'eu-central-1';
const NETLIFY_SITE = args.site ?? '2682d6d7-b44e-48b4-8eab-c6d69fb21b55';
const SITE_URL = args.url ?? 'https://pehpeletz-stars.netlify.app';

const sbHeaders = { 'content-type': 'application/json' };
if (process.env.SUPABASE_ACCESS_TOKEN)
  sbHeaders.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
const nlHeaders = { 'content-type': 'application/json' };
if (process.env.NETLIFY_AUTH_TOKEN)
  nlHeaders.authorization = `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`;

async function sb(path, init = {}) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: { ...sbHeaders, ...init.headers },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Supabase ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`,
    );
  return text ? JSON.parse(text) : null;
}
async function nl(path, init = {}) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: { ...nlHeaders, ...init.headers },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Netlify ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`,
    );
  return text ? JSON.parse(text) : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (ref, query) =>
  sb(`/v1/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

// 1. פרויקט: אם קיים פרויקט בשם הזה (בכל ארגון נגיש) משתמשים בו
let project = (await sb('/v1/projects')).find((p) => p.name === NAME);
if (!project) {
  const orgs = await sb('/v1/organizations');
  const org = args.org ? orgs.find((o) => o.slug === args.org || o.id === args.org) : orgs[0];
  if (!org) throw new Error('No Supabase organization found');
  console.log(`creating project "${NAME}" in ${REGION} (org ${org.name})…`);
  project = await sb('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: NAME,
      organization_id: org.slug ?? org.id,
      region: REGION,
      // סיסמת DB אקראית; לא נשמרת. אפשר לאפס בכל עת ב-Project Settings → Database.
      db_pass: randomBytes(24).toString('base64url'),
    }),
  });
} else console.log(`project "${NAME}" exists (${project.id}, region ${project.region})`);
const ref = project.id ?? project.ref;

for (let i = 0; i < 90; i++) {
  const p = await sb(`/v1/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (i % 6 === 0) console.log(`waiting for project… (${p.status})`);
  await sleep(10_000);
}

// 2. migrations (טבלת מעקב פשוטה כדי לא להריץ פעמיים)
await sql(
  ref,
  `create schema if not exists ops; create table if not exists ops.applied_migrations (name text primary key, applied_at timestamptz default now());`,
);
const applied = new Set(
  (await sql(ref, 'select name from ops.applied_migrations')).map((r) => r.name),
);
for (const f of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  if (applied.has(f)) {
    console.log(`= ${f}`);
    continue;
  }
  console.log(`→ ${f}`);
  await sql(ref, readFileSync(`supabase/migrations/${f}`, 'utf8'));
  await sql(ref, `insert into ops.applied_migrations (name) values ('${f.replace(/'/g, "''")}')`);
}
await sql(ref, 'revoke all on schema ops from anon, authenticated;');

// 3. Auth
await sb(`/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  body: JSON.stringify({
    site_url: `${SITE_URL}/admin/`,
    uri_allow_list: `${SITE_URL}/admin/**,https://*--pehpeletz-stars.netlify.app/admin/**,http://localhost:5174/admin/**`,
    disable_signup: true,
  }),
});
console.log('auth configured (signups disabled; admins are invited)');

// 4. מפתחות → Netlify
const keys = await sb(`/v1/projects/${ref}/api-keys?reveal=true`);
const anon = keys.find((k) => k.name === 'anon')?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key;
if (!anon || !service) throw new Error('could not read API keys');
const site = await nl(`/sites/${NETLIFY_SITE}`);
const account = site.account_id;
const vars = [
  ['SUPABASE_URL', `https://${ref}.supabase.co`, false],
  ['SUPABASE_ANON_KEY', anon, false],
  ['SUPABASE_SERVICE_ROLE_KEY', service, true],
];
const existing = new Set(
  (await nl(`/accounts/${account}/env?site_id=${NETLIFY_SITE}`)).map((e) => e.key),
);
for (const [key, value, secret] of vars) {
  // בתוכנית החינמית של Netlify אי אפשר לבחור scopes או לסמן secret (--paid מפעיל אותם)
  const body = args.paid
    ? {
        key,
        scopes: ['builds', 'functions', 'runtime'],
        values: [{ value, context: 'all' }],
        is_secret: secret,
      }
    : { key, values: [{ value, context: 'all' }] };
  if (existing.has(key)) {
    await nl(`/accounts/${account}/env/${key}?site_id=${NETLIFY_SITE}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } else {
    await nl(`/accounts/${account}/env?site_id=${NETLIFY_SITE}`, {
      method: 'POST',
      body: JSON.stringify([body]),
    });
  }
  console.log(`netlify env ${key} ✓`);
}
// 5. התראות הזמנה: מפתחות VAPID ל-Push וסוד משותף ל-webhook מה-DB
const envNow = await nl(`/accounts/${account}/env?site_id=${NETLIFY_SITE}`);
const valueOf = (k) =>
  envNow.find((e) => e.key === k)?.values?.find((v) => v.context === 'all')?.value;
async function putEnv(key, value) {
  const body = { key, values: [{ value, context: 'all' }] };
  if (envNow.some((e) => e.key === key)) {
    await nl(`/accounts/${account}/env/${key}?site_id=${NETLIFY_SITE}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } else {
    await nl(`/accounts/${account}/env?site_id=${NETLIFY_SITE}`, {
      method: 'POST',
      body: JSON.stringify([body]),
    });
  }
  console.log(`netlify env ${key} ✓`);
}
if (!valueOf('VAPID_PUBLIC_KEY') || !valueOf('VAPID_PRIVATE_KEY')) {
  const v = webpush.generateVAPIDKeys();
  await putEnv('VAPID_PUBLIC_KEY', v.publicKey);
  await putEnv('VAPID_PRIVATE_KEY', v.privateKey);
}
if (!valueOf('VAPID_SUBJECT')) await putEnv('VAPID_SUBJECT', SITE_URL);
let hookSecret = valueOf('ORDER_WEBHOOK_SECRET');
if (!hookSecret) {
  hookSecret = randomBytes(32).toString('hex');
  await putEnv('ORDER_WEBHOOK_SECRET', hookSecret);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
await sql(
  ref,
  `insert into ops.config (key, value) values ('order_webhook_url', ${q(`${SITE_URL}/api/order-notify`)}), ('order_webhook_secret', ${q(hookSecret)})
   on conflict (key) do update set value = excluded.value`,
);
console.log('order webhook configured in the database');

console.log(
  `done. project ref: ${ref}. Trigger a Netlify deploy so the new variables take effect.`,
);
