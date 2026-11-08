-- בדיקות שלב 3: קליטת אירועים, עגלה נטושה, שחזור, אנליטיקס והרשאות.
\set ON_ERROR_STOP on
-- מתחילים נקי מהזמנות של בדיקות קודמות
truncate public.order_items, public.orders, public.customers cascade;

-- 1) anon / authenticated לא יכולים לקרוא לפונקציות הקליטה
set role anon;
do $$
begin
  begin
    perform public.ingest_events('{}'::jsonb, '[]'::jsonb);
    raise exception 'FAIL: anon can call ingest_events';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
do $$
begin
  begin
    perform public.upsert_abandoned_checkout('{}'::jsonb);
    raise exception 'FAIL: authenticated can call upsert_abandoned_checkout';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 2) service_role קולט אירועים; event_id כפול לא נכנס פעמיים
set role service_role;
select public.ingest_events(
  '{"id":"aaaaaaaa-0000-4000-8000-000000000001","visitor_id":"bbbbbbbb-0000-4000-8000-000000000001","utm_source":"facebook","utm_campaign":"launch","device":"mobile"}',
  '[{"id":"cccccccc-0000-4000-8000-000000000001","name":"page_view","path":"/"},
    {"id":"cccccccc-0000-4000-8000-000000000002","name":"view_pricing","path":"/"},
    {"id":"cccccccc-0000-4000-8000-000000000003","name":"begin_checkout","path":"/checkout"}]'
);
select public.ingest_events(
  '{"id":"aaaaaaaa-0000-4000-8000-000000000001","visitor_id":"bbbbbbbb-0000-4000-8000-000000000001"}',
  '[{"id":"cccccccc-0000-4000-8000-000000000001","name":"page_view","path":"/"}]'
);
select public.ingest_events(
  '{"id":"aaaaaaaa-0000-4000-8000-000000000002","visitor_id":"bbbbbbbb-0000-4000-8000-000000000002","device":"desktop"}',
  '[{"id":"cccccccc-0000-4000-8000-000000000004","name":"page_view","path":"/"}]'
);
select public.rate_limit_hit('t', 60, 2), public.rate_limit_hit('t', 60, 2), public.rate_limit_hit('t', 60, 2) as third;
select public.upsert_abandoned_checkout('{"session_id":"aaaaaaaa-0000-4000-8000-000000000001","visitor_id":"bbbbbbbb-0000-4000-8000-000000000001","phone":"0501234567","email":"x@test.co","package_slug":"kit-2","total":100}');
reset role;

do $$
begin
  if (select count(*) from public.events where session_id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 3 then
    raise exception 'FAIL: duplicate event_id was inserted';
  end if;
  if (select utm_source from public.sessions where id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 'facebook' then
    raise exception 'FAIL: attribution not stored';
  end if;
  if (select count(*) from public.abandoned_checkouts) <> 1 then
    raise exception 'FAIL: abandoned checkout not stored';
  end if;
end $$;

-- 3) הזמנה ששולמה מסמנת את העגלה כשוחזרה
insert into public.customers (id, name, email, phone) values ('dddddddd-0000-4000-8000-000000000001', 'לקוח', 'x@test.co', '0501234567');
insert into public.orders (id, customer_id, subtotal, shipping, total, shipping_address, session_id, visitor_id)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 0, 100, 100, '{}',
          'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');
insert into public.order_items (order_id, name_snapshot, unit_price, qty) values ('eeeeeeee-0000-4000-8000-000000000001', 'כוח על זוגי', 0, 1);
update public.orders set payment_status = 'paid', paid_at = now(), status = 'paid', sumit_transaction_id = 'T-1'
  where id = 'eeeeeeee-0000-4000-8000-000000000001';
do $$
begin
  if not (select recovered from public.abandoned_checkouts limit 1) then
    raise exception 'FAIL: abandoned checkout not marked recovered';
  end if;
end $$;

-- 4) אנליטיקס: לא-אדמין נחסם, אדמין מקבל מספרים נכונים
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$
begin
  begin
    perform public.analytics_summary(now() - interval '1 day', now() + interval '1 day');
    raise exception 'FAIL: non-admin can read analytics';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare
  r jsonb := public.analytics_summary(now() - interval '1 day', now() + interval '1 day');
begin
  if (r ->> 'sessions')::int <> 2 then raise exception 'FAIL: sessions %', r ->> 'sessions'; end if;
  if (r ->> 'visitors')::int <> 2 then raise exception 'FAIL: visitors %', r ->> 'visitors'; end if;
  if (r ->> 'orders')::int <> 1 then raise exception 'FAIL: orders %', r ->> 'orders'; end if;
  if (r ->> 'revenue')::numeric <> 100 then raise exception 'FAIL: revenue %', r ->> 'revenue'; end if;
  if (r ->> 'conversion_rate')::numeric <> 50 then raise exception 'FAIL: conversion %', r ->> 'conversion_rate'; end if;
  if (r -> 'funnel' -> 1 ->> 'count')::int <> 1 then raise exception 'FAIL: funnel view_pricing'; end if;
  if (r -> 'abandoned' ->> 'recovered')::int <> 1 then raise exception 'FAIL: abandoned recovered'; end if;
  if jsonb_array_length(r -> 'by_source') < 1 then raise exception 'FAIL: by_source empty'; end if;
end $$;
reset role;

select 'tracking + analytics: all checks passed' as result;
