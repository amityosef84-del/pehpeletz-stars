-- קטלוג ציבורי: anon קורא חבילות פעילות בלבד, בלי מלאי מדויק.
\set ON_ERROR_STOP on
update public.products set active = false where slug = 'kit-4';
update public.products set stock = 0 where slug = 'kit-3';

set role anon;
do $$
declare c jsonb := public.public_catalog();
begin
  if jsonb_array_length(c->'products') <> 3 then
    raise exception 'FAIL: inactive product exposed (% products)', jsonb_array_length(c->'products');
  end if;
  if c->'products'->0->>'slug' <> 'kit-1' then raise exception 'FAIL: catalog order'; end if;
  if (c->'products'->2->>'sold_out')::boolean is not true then raise exception 'FAIL: sold_out'; end if;
  if c->'products'->0 ? 'stock' then raise exception 'FAIL: stock exposed'; end if;
  if c->'shipping'->>'mode' <> 'per_unit' then raise exception 'FAIL: shipping missing'; end if;
  -- anon עדיין לא קורא טבלאות ישירות
  begin
    if exists (select 1 from public.products) then raise exception 'FAIL: anon reads products'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.products set active = true where slug = 'kit-4';
update public.products set stock = null where slug = 'kit-3';
\echo 'catalog tests passed'
