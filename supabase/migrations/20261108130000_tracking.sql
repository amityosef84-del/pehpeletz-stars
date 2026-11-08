-- =====================================================================
-- שלב 3: מעקב first-party, עגלות נטושות, rate limiting ודשבורד אנליטיקס.
-- =====================================================================

-- ---------- שדות ייחוס נוספים לביקור ----------
alter table public.sessions
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists ttclid text,
  add column if not exists fbp text,
  add column if not exists is_bot boolean not null default false;

-- מזהה אירוע מהדפדפן: דה-דופליקציה מול הפיקסלים ומניעת שליחה כפולה
alter table public.events
  add column if not exists event_id uuid;
create unique index if not exists events_event_id_key on public.events (event_id) where event_id is not null;
create index if not exists events_visitor_idx on public.events (visitor_id);

alter table public.abandoned_checkouts
  add column if not exists package_slug text,
  add column if not exists total numeric(10,2);

-- ---------- Rate limiting ----------
-- המפתח הוא hash (לא שומרים IP). חלון קבוע לפי דקה.
create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  -- ניקוי חלונות ישנים מדי פעם
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- ---------- קליטת אירועים (נקרא רק מ-/api/track עם service_role) ----------
create or replace function public.ingest_events(p_session jsonb, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := (p_session ->> 'id')::uuid;
  vid uuid := (p_session ->> 'visitor_id')::uuid;
  inserted integer;
begin
  insert into public.sessions as s (
    id, visitor_id, first_seen, last_seen, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer, device, country, landing_path, fbclid, gclid, ttclid, fbp, is_bot
  ) values (
    sid, vid, now(), now(),
    p_session ->> 'utm_source', p_session ->> 'utm_medium', p_session ->> 'utm_campaign',
    p_session ->> 'utm_content', p_session ->> 'utm_term', p_session ->> 'referrer',
    p_session ->> 'device', p_session ->> 'country', p_session ->> 'landing_path',
    p_session ->> 'fbclid', p_session ->> 'gclid', p_session ->> 'ttclid', p_session ->> 'fbp',
    coalesce((p_session ->> 'is_bot')::boolean, false)
  )
  on conflict (id) do update set
    last_seen = now(),
    fbp = coalesce(s.fbp, excluded.fbp);

  insert into public.events (session_id, visitor_id, event_id, name, props, path, created_at)
  select sid, vid, (e ->> 'id')::uuid, e ->> 'name', coalesce(e -> 'props', '{}'::jsonb), e ->> 'path',
         least(now(), greatest(now() - interval '1 hour', coalesce((e ->> 'ts')::timestamptz, now())))
  from jsonb_array_elements(p_events) as e
  on conflict (event_id) where event_id is not null do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke execute on function public.ingest_events(jsonb, jsonb) from public, anon, authenticated;

-- ---------- עגלה נטושה (נקרא מ-/api/checkout-draft) ----------
create or replace function public.upsert_abandoned_checkout(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.abandoned_checkouts as a (session_id, visitor_id, name, email, phone, cart, package_slug, total)
  values (
    (p ->> 'session_id')::uuid, (p ->> 'visitor_id')::uuid, p ->> 'name', p ->> 'email', p ->> 'phone',
    coalesce(p -> 'cart', '[]'::jsonb), p ->> 'package_slug', (p ->> 'total')::numeric
  )
  on conflict (session_id) where session_id is not null do update set
    name = coalesce(excluded.name, a.name),
    email = coalesce(excluded.email, a.email),
    phone = coalesce(excluded.phone, a.phone),
    cart = excluded.cart,
    package_slug = excluded.package_slug,
    total = excluded.total
  where a.order_id is null;
end;
$$;
revoke execute on function public.upsert_abandoned_checkout(jsonb) from public, anon, authenticated;

-- כשהזמנה משולמת: העגלה של אותו ביקור/טלפון/מייל מסומנת כ"שוחזרה"
create or replace function public.mark_checkout_recovered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.payment_status = 'paid' and (old.payment_status is distinct from 'paid') then
    select email, phone into c from public.customers where id = new.customer_id;
    update public.abandoned_checkouts
       set order_id = new.id,
           recovered = true,
           recovered_at = now()
     where order_id is null
       and created_at > now() - interval '30 days'
       and (session_id = new.session_id or lower(email) = lower(c.email) or phone = c.phone);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_mark_recovered on public.orders;
create trigger orders_mark_recovered after update of payment_status on public.orders
  for each row execute function public.mark_checkout_recovered();

-- =====================================================================
-- אנליטיקס: פונקציה אחת שמחזירה את כל מדדי הדשבורד לטווח תאריכים.
-- רצה בהרשאות המשתמש (RLS) ובודקת שהוא אדמין.
-- =====================================================================
create or replace function public.analytics_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with
  s as (
    select * from public.sessions
    where first_seen >= p_from and first_seen < p_to and not is_bot
  ),
  ev as (
    select e.* from public.events e join s on s.id = e.session_id
  ),
  sess_events as (
    select session_id, count(*) filter (where name = 'page_view') as pv, count(*) as n
    from ev group by session_id
  ),
  paid as (
    select o.* from public.orders o
    where o.paid_at >= p_from and o.paid_at < p_to and o.payment_status in ('paid', 'partially_refunded', 'refunded')
  ),
  funnel as (
    select
      count(distinct s.id) as visits,
      count(distinct ev.session_id) filter (where ev.name = 'view_pricing') as view_pricing,
      count(distinct ev.session_id) filter (where ev.name = 'select_package') as select_package,
      count(distinct ev.session_id) filter (where ev.name = 'begin_checkout') as begin_checkout,
      count(distinct ev.session_id) filter (where ev.name = 'add_payment_info') as add_payment_info
    from s left join ev on ev.session_id = s.id
  ),
  by_day as (
    select d::date as day,
      (select count(*) from s where s.first_seen::date = d::date) as visits,
      (select count(*) from paid where paid.paid_at::date = d::date) as orders,
      (select coalesce(sum(total - refunded_amount), 0) from paid where paid.paid_at::date = d::date) as revenue
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day') d
  ),
  src as (
    select coalesce(nullif(s.utm_source, ''), case when s.referrer is null or s.referrer = '' then '(ישיר)' else '(הפניה)' end) as source,
           coalesce(s.utm_medium, '') as medium,
           coalesce(s.utm_campaign, '') as campaign,
           coalesce(s.utm_content, '') as content,
           s.device,
           s.id
    from s
  ),
  src_orders as (
    select o.session_id, o.total - o.refunded_amount as net from paid o where o.session_id is not null
  ),
  ttp as (
    select extract(epoch from (o.paid_at - v.first_visit)) / 3600.0 as hours
    from paid o
    join lateral (
      select min(first_seen) as first_visit from public.sessions where visitor_id = o.visitor_id
    ) v on true
    where o.visitor_id is not null
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'visitors', (select count(distinct visitor_id) from s),
    'sessions', (select count(*) from s),
    'bounce_rate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where coalesce(se.pv, 0) <= 1 and coalesce(se.n, 0) <= 2) / count(*), 1) end
                    from s left join sess_events se on se.session_id = s.id),
    'orders', (select count(*) from paid),
    'revenue', (select coalesce(sum(total - refunded_amount), 0) from paid),
    'refunds', (select coalesce(sum(refunded_amount), 0) from paid),
    'aov', (select coalesce(round(avg(total), 2), 0) from paid),
    'conversion_rate', (select case when f.visits = 0 then 0 else round(100.0 * (select count(*) from paid) / f.visits, 2) end from funnel f),
    'revenue_per_visitor', (select case when count(distinct visitor_id) = 0 then 0 else round((select coalesce(sum(total - refunded_amount), 0) from paid) / count(distinct visitor_id), 2) end from s),
    'funnel', (select jsonb_build_array(
        jsonb_build_object('step', 'visit', 'count', f.visits),
        jsonb_build_object('step', 'view_pricing', 'count', f.view_pricing),
        jsonb_build_object('step', 'select_package', 'count', f.select_package),
        jsonb_build_object('step', 'begin_checkout', 'count', f.begin_checkout),
        jsonb_build_object('step', 'add_payment_info', 'count', f.add_payment_info),
        jsonb_build_object('step', 'purchase', 'count', (select count(*) from paid))
      ) from funnel f),
    'by_day', (select coalesce(jsonb_agg(to_jsonb(b) order by b.day), '[]'::jsonb) from by_day b),
    'by_source', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
        select src.source, src.medium, count(*) as sessions, count(so.session_id) as orders, coalesce(sum(so.net), 0) as revenue
        from src left join src_orders so on so.session_id = src.id
        group by src.source, src.medium limit 30) x),
    'by_campaign', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
        select src.campaign, src.content, count(*) as sessions, count(so.session_id) as orders, coalesce(sum(so.net), 0) as revenue
        from src left join src_orders so on so.session_id = src.id
        where src.campaign <> '' or src.content <> ''
        group by src.campaign, src.content limit 30) x),
    'by_device', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]'::jsonb) from (
        select coalesce(src.device, 'unknown') as device, count(*) as sessions, count(so.session_id) as orders
        from src left join src_orders so on so.session_id = src.id group by 1) x),
    'by_package', (select coalesce(jsonb_agg(x order by x.orders desc), '[]'::jsonb) from (
        select oi.name_snapshot as package, count(distinct oi.order_id) as orders, sum(oi.qty) as qty,
               sum(p.total - p.refunded_amount) as revenue
        from paid p join public.order_items oi on oi.order_id = p.id group by oi.name_snapshot) x),
    'time_to_purchase_hours', (select jsonb_build_object(
        'median', coalesce(round((percentile_cont(0.5) within group (order by hours))::numeric, 1), 0),
        'p90', coalesce(round((percentile_cont(0.9) within group (order by hours))::numeric, 1), 0)) from ttp),
    'abandoned', (select jsonb_build_object(
        'count', count(*), 'recovered', count(*) filter (where recovered),
        'value', coalesce(sum(total) filter (where not recovered), 0))
      from public.abandoned_checkouts where created_at >= p_from and created_at < p_to),
    'top_ctas', (select coalesce(jsonb_agg(x order by x.clicks desc), '[]'::jsonb) from (
        select props ->> 'location' as location, count(*) as clicks from ev where name = 'cta_click' group by 1 limit 15) x),
    'scroll', (select jsonb_build_object(
        '25', count(distinct session_id) filter (where name = 'scroll_25'),
        '50', count(distinct session_id) filter (where name = 'scroll_50'),
        '75', count(distinct session_id) filter (where name = 'scroll_75'),
        '100', count(distinct session_id) filter (where name = 'scroll_100')) from ev)
  ) into result;

  return result;
end;
$$;
revoke execute on function public.analytics_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_summary(timestamptz, timestamptz) to authenticated;

-- ההרשאות של service_role ב-Supabase ניתנות כברירת מחדל; כאן מוודאים במפורש
grant execute on function public.ingest_events(jsonb, jsonb) to service_role;
grant execute on function public.upsert_abandoned_checkout(jsonb) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
