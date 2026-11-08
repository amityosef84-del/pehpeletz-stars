-- =====================================================================
-- שלב 4: קטלוג ציבורי לבניית האתר.
-- האתר הסטטי קורא את החבילות, המשלוח ופרטי העסק בזמן build עם מפתח anon.
-- הפונקציה מחזירה רק מה שמוצג ממילא בדף: בלי מלאי מדויק, בלי מוצרים מושבתים.
-- =====================================================================
create or replace function public.public_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.slug,
        'name', p.name,
        'description', p.description,
        'units', p.units,
        'price_ils', p.price_ils,
        'compare_at_price', p.compare_at_price,
        'sold_out', coalesce(p.stock = 0, false)
      ) order by p.sort, p.slug)
      from public.products p
      where p.active
    ), '[]'::jsonb),
    'shipping', (select s.value from public.settings s where s.key = 'shipping'),
    'store', (select s.value from public.settings s where s.key = 'store')
  );
$$;
revoke execute on function public.public_catalog() from public;
grant execute on function public.public_catalog() to anon, authenticated;
