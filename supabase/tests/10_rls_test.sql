-- בדיקות הרשאות: הציבור לא רואה כלום, משתמש מחובר שאינו אדמין לא רואה כלום,
-- אדמין קורא אבל לא כותב, service_role כותב.
\set ON_ERROR_STOP on

-- נתוני בדיקה (כ-superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000b2', 'user@test');
insert into public.admin_users (user_id, email, role)
  values ('00000000-0000-0000-0000-0000000000a1', 'admin@test', 'owner');
insert into public.customers (id, name, email, phone)
  values ('00000000-0000-0000-0000-00000000c001', 'בדיקה', 'c@test.co', '0500000000');
insert into public.orders (customer_id, subtotal, shipping, total, shipping_address)
  values ('00000000-0000-0000-0000-00000000c001', 0, 100, 100, '{"city":"תל אביב"}');

-- 1) anon: אין הרשאה בכלל
set role anon;
do $$
begin
  begin
    perform 1 from public.orders;
    raise exception 'FAIL: anon can read orders';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.events (name) values ('page_view');
    raise exception 'FAIL: anon can insert events';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_admin();
    raise exception 'FAIL: anon can execute is_admin';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- 2) authenticated שאינו אדמין: 0 שורות
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$
begin
  if (select count(*) from public.orders) <> 0 then raise exception 'FAIL: non-admin sees orders'; end if;
  if (select count(*) from public.products) <> 0 then raise exception 'FAIL: non-admin sees products'; end if;
  if public.is_admin() then raise exception 'FAIL: non-admin is_admin() true'; end if;
end
$$;
reset role;

-- 3) אדמין: קורא, לא כותב
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  if not public.is_admin() then raise exception 'FAIL: admin is_admin() false'; end if;
  if (select count(*) from public.orders) <> 1 then raise exception 'FAIL: admin cannot read orders'; end if;
  if (select count(*) from public.products) <> 4 then raise exception 'FAIL: admin does not see 4 products'; end if;
  begin
    update public.orders set status = 'paid';
    raise exception 'FAIL: admin can update orders directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.admin_users (user_id, email) values ('00000000-0000-0000-0000-0000000000b2', 'x');
    raise exception 'FAIL: admin can insert admin_users directly';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 4) service_role (Functions): כותב
set role service_role;
insert into public.events (name, props) values ('page_view', '{"t":1}');
reset role;

-- 5) אילוצי שלמות
do $$
begin
  begin
    insert into public.orders (customer_id, subtotal, shipping, total, shipping_address)
      values ('00000000-0000-0000-0000-00000000c001', 0, 100, 1, '{}');
    raise exception 'FAIL: total mismatch accepted';
  exception when check_violation then null;
  end;
  begin
    update public.orders set payment_status = 'paid';
    raise exception 'FAIL: paid without paid_at/transaction accepted';
  exception when check_violation then null;
  end;
  update public.orders set payment_status = 'paid', paid_at = now(), sumit_transaction_id = 'P1';
  begin
    insert into public.orders (customer_id, subtotal, shipping, total, shipping_address, sumit_transaction_id)
      values ('00000000-0000-0000-0000-00000000c001', 0, 50, 50, '{}', 'P1');
    raise exception 'FAIL: duplicate sumit_transaction_id accepted';
  exception when unique_violation then null;
  end;
  if (select min(order_number) from public.orders) <> 1001 then
    raise exception 'FAIL: order numbers do not start at 1001';
  end if;
end
$$;

select 'RLS + constraints: all checks passed' as result;
