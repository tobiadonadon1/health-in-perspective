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
