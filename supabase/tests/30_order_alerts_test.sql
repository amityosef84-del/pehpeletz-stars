-- בדיקות התראות הזמנה: הטריגר לא מכשיל עדכון גם בלי pg_net/הגדרות, ומנויי Push מוגנים.
\set ON_ERROR_STOP on
truncate public.order_items, public.orders, public.customers cascade;

insert into public.customers (id, name, email, phone) values ('dddddddd-0000-4000-8000-0000000000aa', 'בדיקה', 'alerts@test.co', '0500000001');
insert into public.orders (id, customer_id, subtotal, shipping, total, shipping_address)
  values ('eeeeeeee-0000-4000-8000-0000000000aa', 'dddddddd-0000-4000-8000-0000000000aa', 0, 50, 50, '{}');
insert into ops.config (key, value) values ('order_webhook_url', 'https://example.invalid/api/order-notify'), ('order_webhook_secret', 'x')
  on conflict (key) do update set value = excluded.value;
update public.orders set payment_status = 'paid', paid_at = now(), sumit_transaction_id = 'T-ALERT'
  where id = 'eeeeeeee-0000-4000-8000-0000000000aa';

do $$
begin
  if (select payment_status from public.orders where id = 'eeeeeeee-0000-4000-8000-0000000000aa') <> 'paid' then
    raise exception 'FAIL: order update blocked by alert trigger';
  end if;
end $$;

-- anon/authenticated לא קוראים את ops.config ולא כותבים מנויים
set role anon;
do $$
begin
  begin
    perform 1 from ops.config;
    raise exception 'FAIL: anon can read ops.config';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values ('00000000-0000-0000-0000-0000000000a1', 'https://push.example/x', 'k', 'a');
    raise exception 'FAIL: authenticated can insert push_subscriptions directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'order alerts: all checks passed' as result;
