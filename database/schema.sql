-- Apply to a dedicated Supabase project, then run tests/staging-rls.sql (synthetic fixtures rolled back).
create table public.meals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 200), calories numeric not null check(calories between 0 and 10000),
 protein numeric not null check(protein between 0 and 10000), carbs numeric not null check(carbs between 0 and 10000), fat numeric not null check(fat between 0 and 10000),
 meal_type text not null check(meal_type in ('Breakfast','Lunch','Dinner','Snack')),source text not null check(length(source)<=500),
 logged_on date not null default current_date,created_at timestamptz not null default now()
);
create index meals_user_day on public.meals(user_id,logged_on);
alter table public.meals enable row level security;
create policy meals_read on public.meals for select to authenticated using ((select auth.uid())=user_id);
create policy meals_insert on public.meals for insert to authenticated with check ((select auth.uid())=user_id);
create policy meals_update on public.meals for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy meals_delete on public.meals for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.meals to authenticated;
revoke all on public.meals from anon;
create table public.records (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name)<=255), path text not null unique check(length(path)<=500), kind text not null check(kind in ('lab','photo')),mime text not null,
 created_at timestamptz not null default now(), check(split_part(path,'/',1)=user_id::text)
);
create index records_user on public.records(user_id);
alter table public.records enable row level security;
create policy records_read on public.records for select to authenticated using ((select auth.uid())=user_id);
create policy records_insert on public.records for insert to authenticated with check ((select auth.uid())=user_id);
create policy records_delete on public.records for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,delete on public.records to authenticated;
revoke all on public.records from anon;
create table public.health_readings (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,value numeric not null,unit text not null,source text not null,external_id text not null,observed_at timestamptz not null,
 unique(user_id,source,external_id,kind)
);
create index readings_user_time on public.health_readings(user_id,observed_at desc);
alter table public.health_readings enable row level security;
create policy readings_read on public.health_readings for select to authenticated using ((select auth.uid())=user_id);
grant select on public.health_readings to authenticated;
revoke all on public.health_readings from anon;
revoke insert,update,delete on public.health_readings from authenticated;
create table public.wearable_secrets (user_id uuid not null references auth.users(id) on delete cascade,provider text not null,encrypted_tokens text not null,updated_at timestamptz default now(),primary key(user_id,provider));
create table public.oauth_states (state text primary key,user_id uuid not null references auth.users(id) on delete cascade,expires_at timestamptz not null);
create index oauth_states_user on public.oauth_states(user_id);
create table public.api_usage(user_id uuid not null references auth.users(id) on delete cascade,bucket timestamptz not null,requests int not null default 1,primary key(user_id,bucket));
alter table public.wearable_secrets enable row level security;
alter table public.oauth_states enable row level security;
alter table public.api_usage enable row level security;
revoke all on public.wearable_secrets,public.oauth_states,public.api_usage from anon,authenticated;
grant all on public.meals,public.records,public.health_readings,public.wearable_secrets,public.oauth_states,public.api_usage to service_role;
create function public.take_api_credit(owner uuid) returns boolean language sql security invoker set search_path='' as $$
 insert into public.api_usage(user_id,bucket,requests) values(owner,date_trunc('hour',now()),1)
 on conflict(user_id,bucket) do update set requests=public.api_usage.requests+1
 returning requests<=40;
$$;
revoke all on function public.take_api_credit(uuid) from public,anon,authenticated;
grant execute on function public.take_api_credit(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('health-records','health-records',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy records_storage_read on storage.objects for select to authenticated using(bucket_id='health-records' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy records_storage_insert on storage.objects for insert to authenticated with check(bucket_id='health-records' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy records_storage_delete on storage.objects for delete to authenticated using(bucket_id='health-records' and (storage.foldername(name))[1]=(select auth.uid())::text);

create table public.lab_results (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 marker text not null check(length(trim(marker)) between 1 and 120),
 value numeric not null check(value >= 0 and value <= 1000000000),
 unit text not null check(length(trim(unit)) between 1 and 40),
 collected_on date not null,
 reference_low numeric check(reference_low >= 0 and reference_low <= 1000000000),
 reference_high numeric check(reference_high >= 0 and reference_high <= 1000000000),
 laboratory text not null default '' check(length(laboratory) <= 160),
 notes text not null default '' check(length(notes) <= 2000),
 created_at timestamptz not null default now(),
 check(reference_low is null or reference_high is null or reference_low <= reference_high)
);
create index lab_results_user_date on public.lab_results(user_id,collected_on desc);
alter table public.lab_results enable row level security;
create policy labs_read on public.lab_results for select to authenticated using ((select auth.uid())=user_id);
create policy labs_insert on public.lab_results for insert to authenticated with check ((select auth.uid())=user_id);
create policy labs_update on public.lab_results for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy labs_delete on public.lab_results for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.lab_results to authenticated;
revoke all on public.lab_results from anon;
grant all on public.lab_results to service_role;
alter table public.oauth_states add column return_origin text;
alter table public.wearable_secrets add column last_synced_at timestamptz;
