-- מדמה את מה ש-Supabase מספק מראש (roles, auth.users, auth.uid()),
-- כדי שאפשר יהיה להריץ את ה-migrations על Postgres נקי ב-CI ובפיתוח מקומי.
-- לא רץ מול Supabase אמיתי.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- כמו ב-Supabase: ברירת מחדל נותנת הכל לכולם, וה-migration אמור לסגור את זה.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
