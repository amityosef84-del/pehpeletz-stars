-- =====================================================================
-- התראות על הזמנה חדשה: Realtime לאדמין פתוח, ו-Push לטלפון כשהאפליקציה סגורה.
-- =====================================================================

-- ---------- Realtime: האדמין מאזין לשינויים בהזמנות (RLS עדיין חל: רק אדמינים רואים) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------- מנויי Push של מנהלים ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;
drop policy if exists own_read on public.push_subscriptions;
create policy own_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

-- ---------- הגדרות פרטיות (לא נגישות דרך ה-API) ----------
create schema if not exists ops;
revoke all on schema ops from public;
create table if not exists ops.config (
  key   text primary key,
  value text not null
);
revoke all on ops.config from public;

-- ---------- Webhook: כשהזמנה הופכת ל-paid, קוראים ל-/api/order-notify ----------
-- דורש pg_net (קיים ב-Supabase). בסביבת בדיקה בלי pg_net הטריגר פשוט לא שולח.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

create or replace function public.notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
  items text;
begin
  if new.payment_status <> 'paid' or old.payment_status = 'paid' then
    return new;
  end if;
  select value into url from ops.config where key = 'order_webhook_url';
  select value into secret from ops.config where key = 'order_webhook_secret';
  if url is null or secret is null
     or not exists (select 1 from pg_namespace where nspname = 'net') then
    return new;
  end if;
  select string_agg(name_snapshot || case when qty > 1 then ' ×' || qty else '' end, ', ')
    into items from public.order_items where order_id = new.id;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using url,
          jsonb_build_object(
            'order_id', new.id,
            'order_number', new.order_number,
            'total', new.total,
            'items', coalesce(items, '')
          ),
          jsonb_build_object('content-type', 'application/json', 'x-webhook-secret', secret);
  return new;
exception when others then
  -- התראה לעולם לא תכשיל עדכון של הזמנה
  raise warning 'notify_order_paid failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists orders_notify_paid on public.orders;
create trigger orders_notify_paid after update of payment_status on public.orders
  for each row execute function public.notify_order_paid();
