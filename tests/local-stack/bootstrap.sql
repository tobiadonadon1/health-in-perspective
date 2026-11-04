-- A Supabase-shaped Postgres for local end-to-end tests: the same roles, auth.uid() from PostgREST's JWT claims,
-- and Supabase's default grants (RLS then decides). Then database/schema.sql is applied unchanged.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login password 'authenticator' noinherit; grant anon,authenticated,service_role to authenticator;
create schema auth; create schema storage; create schema extensions;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}',created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'sub','')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' $$;
grant usage on schema auth,public,storage,extensions to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
