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

create table public.ai_credentials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_key text not null,
 updated_at timestamptz not null default now()
);
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from public,anon,authenticated;
grant all on public.ai_credentials to service_role;
comment on table public.ai_credentials is 'Server-only encrypted personal OpenAI keys. Never returned to a browser.';

-- Profiles and preferences are private. Peer comparisons return aggregates only.
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 representation text not null default 'photo' check (representation in ('photo','digital','stats')),
 gender text not null check (gender in ('woman','man','nonbinary','unspecified')),
 age integer not null check (age between 18 and 120),
 age_updated_on date not null default current_date,
 photo_record_id uuid references public.records(id) on delete set null,
 peer_opt_in boolean not null default false,
 onboarding_completed_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy profiles_insert on public.profiles for insert to authenticated with check (
 (select auth.uid())=user_id and (photo_record_id is null or exists(select 1 from public.records r where r.id=photo_record_id and r.user_id=(select auth.uid()) and r.kind='photo'))
);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check (
 (select auth.uid())=user_id and (photo_record_id is null or exists(select 1 from public.records r where r.id=photo_record_id and r.user_id=(select auth.uid()) and r.kind='photo'))
);
revoke all on public.profiles from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- No parameters: a caller can request only their own age cohort and sources.
-- All participants contribute one mean of daily means, with >=7 UTC days in 30 days.
-- No identities or individual peer values leave this function. Small cohorts are suppressed.
create function public.peer_percentiles() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid := auth.uid(); p public.profiles; result jsonb; lo integer; hi integer;
begin
 if viewer is null then raise exception 'Sign in first'; end if;
 select * into p from public.profiles where user_id=viewer;
 if p.user_id is null then return jsonb_build_object('status','profile_required'); end if;
 if not p.peer_opt_in then return jsonb_build_object('status','opt_in_required'); end if;
 if p.age_updated_on < current_date-366 then return jsonb_build_object('status','age_refresh_required'); end if;
 lo := case when p.age<30 then 18 when p.age>=80 then 80 else (p.age/10)*10 end;
 hi := case when lo=18 then 29 when lo=80 then 120 else lo+9 end;
 with latest as (
  select distinct on(h.kind) h.kind,h.source,h.unit from public.health_readings h
  where h.user_id=viewer and h.observed_at>=now()-interval '30 days' and h.observed_at<=now()
   and h.kind in ('resting_hr','hrv','sleep','steps','recovery','hrv_sdnn')
  order by h.kind,h.observed_at desc,h.id
 ), days as (
  select h.user_id,h.kind,h.source,h.unit,(h.observed_at at time zone 'UTC')::date as day,avg(h.value) as value
  from public.health_readings h join latest l using(kind,source,unit)
  join public.profiles c on c.user_id=h.user_id
  where c.peer_opt_in and c.age between lo and hi and c.age_updated_on>=current_date-366
   and h.observed_at>=now()-interval '30 days' and h.observed_at<=now()
   and h.value::text not in ('NaN','Infinity','-Infinity')
  group by h.user_id,h.kind,h.source,h.unit,(h.observed_at at time zone 'UTC')::date
 ), people as (
  select user_id,kind,source,unit,avg(value) as value,count(*) as days from days
  group by user_id,kind,source,unit having count(*)>=7
 ), comparisons as (
  select mine.kind,mine.source,mine.unit,mine.value,mine.days,count(peer.user_id) as n,
   avg(peer.value) as peer_mean,
   100.0*(count(*) filter(where peer.value<mine.value)+0.5*count(*) filter(where peer.value=mine.value))/nullif(count(peer.user_id),0) as percentile
  from people mine left join people peer on peer.kind=mine.kind and peer.source=mine.source and peer.unit=mine.unit and peer.user_id<>viewer
  where mine.user_id=viewer group by mine.kind,mine.source,mine.unit,mine.value,mine.days
 ) select coalesce(jsonb_agg(jsonb_build_object('kind',l.kind,'source',l.source,'unit',l.unit,
  'status',case when c.kind is null then 'more_days' when c.n<20 then 'growing' else 'ready' end,
  'mean',round(c.value,2),'days',c.days,'peer_count',case when c.n>=20 then c.n else null end,
  'peer_mean',case when c.n>=20 then round(c.peer_mean,2) else null end,
  'percentile',case when c.n>=20 then round(c.percentile,1) else null end) order by l.kind),'[]'::jsonb)
 into result from latest l left join comparisons c using(kind,source,unit);
 return jsonb_build_object('status','ok','age_min',lo,'age_max',hi,'minimum_peers',20,'minimum_days',7,'window_days',30,'metrics',result);
end $$;
revoke all on function public.peer_percentiles() from public,anon;
grant execute on function public.peer_percentiles() to authenticated;

create table public.chat_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 provider text not null check(provider in ('openai','anthropic','gemini')),
 model text not null check(length(model) between 1 and 100),
 encrypted_key text not null,
 updated_at timestamptz not null default now()
);
alter table public.chat_connections enable row level security;
revoke all on public.chat_connections from anon,authenticated;
grant all on public.chat_connections to service_role;
create table public.chat_messages (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, role text not null check(role in ('user','assistant')),
 content text not null check(length(content) between 1 and 16000),
 provider text not null,model text not null,context_shared boolean not null default false,
 created_at timestamptz not null default now(),unique(user_id,request_id,role)
);
create index chat_messages_user_time on public.chat_messages(user_id,created_at desc);
alter table public.chat_messages enable row level security;
create policy chat_messages_read on public.chat_messages for select to authenticated using((select auth.uid())=user_id);
revoke all on public.chat_messages from anon,authenticated;
grant select on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;

-- Portrait rendering and concurrent WHOOP synchronization
begin;
alter table public.wearable_secrets add column sync_started_at timestamptz, add column sync_id uuid;
create function public.claim_whoop_sync(owner uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare conn public.wearable_secrets; lease uuid := gen_random_uuid();
begin
 select * into conn from public.wearable_secrets where user_id=owner and provider='whoop' for update;
 if not found then raise exception 'Connect WHOOP first.'; end if;
 if conn.sync_started_at > now()-interval '3 minutes' then return jsonb_build_object('reason','in_progress'); end if;
 if conn.last_synced_at > now()-interval '30 seconds' then return jsonb_build_object('reason','recent'); end if;
 update public.wearable_secrets set sync_started_at=now(),sync_id=lease where user_id=owner and provider='whoop';
 return jsonb_build_object('lease',lease);
end $$;
revoke all on function public.claim_whoop_sync(uuid) from public,anon,authenticated;
grant execute on function public.claim_whoop_sync(uuid) to service_role;
create table public.portrait_renders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_record_id uuid not null references public.records(id) on delete cascade,
 style_version text not null default 'xeyo-portrait-v1',
 status text not null default 'processing' check(status in ('processing','ready','failed')),
 output_path text,
 error text,
 accepted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (status <> 'ready' or output_path is not null),
 check (output_path is null or split_part(output_path,'/',1)=user_id::text)
);
create unique index portrait_one_active_per_user on public.portrait_renders(user_id) where status='processing';
create index portrait_source_owner on public.portrait_renders(user_id,source_record_id,created_at desc);
alter table public.portrait_renders enable row level security;
create policy "Read own portrait renders" on public.portrait_renders for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.portrait_renders from anon,authenticated;
grant select on public.portrait_renders to authenticated;
grant all on public.portrait_renders to service_role;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('portrait-renders','portrait-renders',false,10485760,array['image/png','image/webp']);
create policy "Read own generated portraits" on storage.objects for select to authenticated using(bucket_id='portrait-renders' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
-- Private observations remain separate from measured wearable data and AI reflections.
create table public.journal_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 content text not null check (char_length(btrim(content)) between 1 and 4000),
 logged_on date not null default current_date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index journal_entries_owner_date on public.journal_entries(user_id,logged_on desc,created_at desc);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon,authenticated;
grant select,delete on public.journal_entries to authenticated;
grant insert(id,user_id,content,logged_on),update(content,logged_on) on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;
create policy journal_owner on public.journal_entries for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.journal_reflections (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_content text not null,
 provider text not null check(provider in ('openai','anthropic','gemini')),
 model text not null,
 context_shared boolean not null default false,
 status text not null default 'processing' check(status in ('processing','ready','failed')),
 content text not null default '',
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(entry_id,user_id) references public.journal_entries(id,user_id) on delete cascade
);
create index journal_reflections_owner on public.journal_reflections(user_id);
alter table public.journal_reflections enable row level security;
revoke all on public.journal_reflections from anon,authenticated;
grant select,delete on public.journal_reflections to authenticated;
grant all on public.journal_reflections to service_role;
create policy reflection_owner_read on public.journal_reflections for select to authenticated using(user_id=(select auth.uid()));
create policy reflection_owner_delete on public.journal_reflections for delete to authenticated using(user_id=(select auth.uid()));

create function public.update_journal_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.content is distinct from old.content or new.logged_on is distinct from old.logged_on then
  new.updated_at=clock_timestamp();
  delete from public.journal_reflections where entry_id=old.id and user_id=old.user_id;
 end if;
 return new;
end $$;
revoke all on function public.update_journal_entry() from public,anon,authenticated;
create trigger journal_entry_changed before update on public.journal_entries for each row execute function public.update_journal_entry();

-- Lock the parent while saving a reflection so a simultaneous edit cannot leave stale AI text.
create function public.validate_journal_reflection() returns trigger language plpgsql security invoker set search_path='' as $$
declare note text;
begin
 select content into note from public.journal_entries where id=new.entry_id and user_id=new.user_id for update;
 if note is null or note is distinct from new.entry_content then raise exception 'Journal entry changed'; end if;
 return new;
end $$;
revoke all on function public.validate_journal_reflection() from public,anon,authenticated;
grant execute on function public.validate_journal_reflection() to service_role;
create trigger journal_reflection_current before insert or update on public.journal_reflections for each row execute function public.validate_journal_reflection();
