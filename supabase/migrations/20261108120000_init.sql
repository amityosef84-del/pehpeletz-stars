-- =====================================================================
-- הכוכבים של פהפלצת: סכמה ראשונית (SPEC.md סעיף 5)
--
-- עקרונות:
--   * כל הטבלאות עם RLS. אין שום policy ל-anon: הציבור לא קורא ולא כותב ישירות.
--   * כתיבה רק דרך Netlify Functions עם service_role (עוקף RLS).
--   * משתמש אדמין מחובר (authenticated + רשום ב-admin_users) קורא בלבד.
--     שינויים מהאדמין עוברים דרך Functions, שכותבים גם ל-audit_log.
--   * סכומי כסף ב-numeric(10,2) בש"ח. כל החישובים בשרת.
-- =====================================================================

-- ---------- Types ----------
create type public.order_status as enum (
  'pending', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'
);

create type public.payment_status as enum (
  'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
);

create type public.coupon_type as enum ('percent', 'fixed');

create type public.admin_role as enum ('owner', 'staff');

-- ---------- Helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- products ----------
-- כל שורה היא חבילה שמוצגת בדף (ילד יחיד / שני אחים / ...).
-- units = כמה ערכות פיזיות בחבילה. משמש לחישוב משלוח לפי ערכה ולמלאי.
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name             text not null,
  description      text,
  units            integer not null default 1 check (units > 0),
  price_ils        numeric(10,2) not null check (price_ils >= 0),
  compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price > price_ils),
  sku              text unique,
  stock            integer check (stock is null or stock >= 0), -- null = מלאי לא מנוהל
  active           boolean not null default true,
  sort             integer not null default 0,
  image_url        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_active_sort_idx on public.products (active, sort);
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- customers ----------
create table public.customers (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  email                text not null check (position('@' in email) > 1),
  phone                text not null,
  marketing_consent    boolean not null default false,
  marketing_consent_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index customers_email_key on public.customers (lower(email));
create index customers_phone_idx on public.customers (phone);
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------- sessions (מעקב first-party) ----------
-- id ו-visitor_id נוצרים בדפדפן (uuid) ונשלחים לפונקציה track.
create table public.sessions (
  id           uuid primary key,
  visitor_id   uuid not null,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  referrer     text,
  device       text,
  country      text,
  landing_path text
);
create index sessions_visitor_idx on public.sessions (visitor_id);
create index sessions_first_seen_idx on public.sessions (first_seen);
create index sessions_source_idx on public.sessions (utm_source, first_seen);

-- ---------- orders ----------
create sequence public.order_number_seq start with 1001;

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         bigint not null unique default nextval('public.order_number_seq'),
  customer_id          uuid not null references public.customers (id) on delete restrict,
  status               public.order_status not null default 'pending',
  payment_status       public.payment_status not null default 'unpaid',
  subtotal             numeric(10,2) not null check (subtotal >= 0),
  discount             numeric(10,2) not null default 0 check (discount >= 0),
  shipping             numeric(10,2) not null default 0 check (shipping >= 0),
  total                numeric(10,2) not null check (total >= 0),
  refunded_amount      numeric(10,2) not null default 0 check (refunded_amount >= 0),
  currency             char(3) not null default 'ILS',
  coupon_code          text,
  shipping_address     jsonb not null,
  notes                text,          -- הערות הלקוח למשלוח
  tracking_number      text,
  utm                  jsonb,
  visitor_id           uuid,
  session_id           uuid references public.sessions (id) on delete set null,
  -- סאמיט: PaymentID שמוחזר מ-beginredirect / payments/get. unique = הגנת idempotency.
  sumit_transaction_id text unique,
  sumit_customer_id    text,
  sumit_document_id    text,
  sumit_document_url   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  paid_at              timestamptz,
  shipped_at           timestamptz,
  cancelled_at         timestamptz,
  constraint orders_total_matches check (total = subtotal - discount + shipping),
  constraint orders_refund_le_total check (refunded_amount <= total),
  constraint orders_paid_has_payment check (
    payment_status <> 'paid' or (paid_at is not null and sumit_transaction_id is not null)
  )
);
alter sequence public.order_number_seq owned by public.orders.order_number;
create index orders_created_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_session_idx on public.orders (session_id);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------- order_items ----------
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  name_snapshot  text not null,
  units_snapshot integer not null default 1 check (units_snapshot > 0),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  qty            integer not null check (qty > 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- ---------- coupons ----------
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  type        public.coupon_type not null,
  value       numeric(10,2) not null check (value > 0),
  min_total   numeric(10,2) not null default 0 check (min_total >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count  integer not null default 0 check (used_count >= 0),
  starts_at   timestamptz,
  ends_at     timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint coupons_percent_range check (type <> 'percent' or value <= 100),
  constraint coupons_dates check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create unique index coupons_code_key on public.coupons (upper(code));

-- ---------- events ----------
create table public.events (
  id         bigint generated always as identity primary key,
  session_id uuid,
  visitor_id uuid,
  name       text not null check (name ~ '^[a-z0-9_]{1,64}$'),
  props      jsonb not null default '{}'::jsonb,
  path       text,
  created_at timestamptz not null default now()
);
create index events_created_idx on public.events (created_at);
create index events_session_idx on public.events (session_id);
create index events_name_created_idx on public.events (name, created_at);

-- ---------- abandoned_checkouts ----------
create table public.abandoned_checkouts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid,
  visitor_id   uuid,
  name         text,
  email        text,
  phone        text,
  cart         jsonb not null default '[]'::jsonb,
  order_id     uuid references public.orders (id) on delete set null,
  recovered    boolean not null default false,
  recovered_at timestamptz,
  contacted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index abandoned_checkouts_session_key on public.abandoned_checkouts (session_id)
  where session_id is not null;
create index abandoned_checkouts_created_idx on public.abandoned_checkouts (created_at desc);
create trigger abandoned_checkouts_set_updated_at before update on public.abandoned_checkouts
  for each row execute function public.set_updated_at();

-- ---------- admin_users ----------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       public.admin_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- ---------- audit_log ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  entity      text not null,   -- 'order' / 'product' / 'coupon' / ...
  entity_id   text not null,
  action      text not null,   -- 'status_change' / 'refund' / 'note' / ...
  before      jsonb,
  after       jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

-- ---------- settings (הגדרות חנות: משלוח, פרטי עסק, פיקסלים) ----------
create table public.settings (
  key        text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- =====================================================================
-- הרשאות ו-RLS
-- =====================================================================

-- האם המשתמש המחובר הוא אדמין. security definer כדי לקרוא את admin_users בלי לולאת RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- הציבור (anon) לא נוגע בטבלאות בכלל. authenticated: קריאה בלבד, ו-RLS מצמצם לאדמינים.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant select on all tables in schema public to authenticated;

alter table public.products            enable row level security;
alter table public.customers           enable row level security;
alter table public.sessions            enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.coupons             enable row level security;
alter table public.events              enable row level security;
alter table public.abandoned_checkouts enable row level security;
alter table public.admin_users         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.settings            enable row level security;

create policy admin_read on public.products            for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.customers           for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.sessions            for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.orders              for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.order_items         for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.coupons             for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.events              for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.abandoned_checkouts for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.admin_users         for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.audit_log           for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.settings            for select to authenticated using ((select public.is_admin()));

-- טבלאות שייווצרו בעתיד לא יקבלו הרשאות ציבוריות אוטומטית.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;
