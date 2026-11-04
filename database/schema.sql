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
 value numeric not null check(value between -1000000000 and 1000000000),
 unit text not null check(length(trim(unit)) between 1 and 40),
 collected_on date not null,
 reference_low numeric check(reference_low between -1000000000 and 1000000000),
 reference_high numeric check(reference_high between -1000000000 and 1000000000),
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
 provider text not null check(provider in ('openai','anthropic','gemini','openrouter','mistral','groq','xai','deepseek')),
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
 mood text check (mood in ('great','good','okay','low','rough')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index journal_entries_owner_date on public.journal_entries(user_id,logged_on desc,created_at desc);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon,authenticated;
grant select,delete on public.journal_entries to authenticated;
grant insert(id,user_id,content,logged_on,mood),update(content,logged_on,mood) on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;
create policy journal_owner on public.journal_entries for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.journal_reflections (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_content text not null,
 provider text not null check(provider in ('openai','anthropic','gemini','openrouter','mistral','groq','xai','deepseek')),
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

-- Narrow RPCs preserve read-only provider records and derive ownership from auth.
create or replace function public.save_body_measurement(p_id uuid,p_kind text,p_value numeric,p_measured_on date)
returns public.health_readings language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result public.health_readings;
begin
 if owner_id is null then raise exception 'Sign in to save a measurement.' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_kind not in ('weight','body_fat','lean_mass') then raise exception 'Invalid measurement.'; end if;
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<=0 or p_value>(case when p_kind='body_fat' then 100 else 1000 end) then raise exception 'Invalid measurement value.'; end if;
 -- A one-day UTC allowance accommodates users whose local date is ahead of UTC.
 if p_measured_on is null or p_measured_on<'1900-01-01'::date or p_measured_on>(now() at time zone 'UTC')::date+1 then raise exception 'Invalid measurement date.'; end if;
 insert into public.health_readings(id,user_id,kind,value,unit,source,external_id,observed_at)
 values(p_id,owner_id,p_kind,p_value,case when p_kind='body_fat' then '%' else 'kg' end,'Manual entry',p_id::text,p_measured_on::timestamp at time zone 'UTC')
 on conflict(id) do update set value=excluded.value,observed_at=excluded.observed_at
 where public.health_readings.user_id=owner_id and public.health_readings.source='Manual entry' and public.health_readings.kind=p_kind
 returning * into result;
 if result.id is null then raise exception 'This measurement cannot be edited.' using errcode='42501'; end if;
 return result;
end $$;
create or replace function public.remove_body_measurement(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to remove a measurement.' using errcode='42501'; end if;
 delete from public.health_readings where id=p_id and user_id=auth.uid() and source='Manual entry' and kind in ('weight','body_fat','lean_mass');
 if not found then raise exception 'This measurement cannot be removed.' using errcode='42501'; end if;
end $$;
revoke all on function public.save_body_measurement(uuid,text,numeric,date),public.remove_body_measurement(uuid) from public,anon;
grant execute on function public.save_body_measurement(uuid,text,numeric,date),public.remove_body_measurement(uuid) to authenticated;

-- Free and Pro plans.
-- Pro is a Stripe subscription (EUR 5/month). Live WHOOP sync is Pro-only and limited to a fixed number of seats
-- (WHOOP_SEAT_CAP, passed in by the server) while Xeyo's WHOOP app is in WHOOP's Sandbox tier.
-- Free members see their last 30 days of wearable readings; everything stays stored and returns on upgrade.

-- Subscriptions mirror Stripe. One row per Stripe subscription; user_id is filled from the checkout's
-- client_reference_id, or later from the verified account email that paid.
create table public.subscriptions (
 stripe_subscription_id text primary key check (length(stripe_subscription_id) between 3 and 100),
 user_id uuid references auth.users(id) on delete set null,
 stripe_customer_id text check (length(stripe_customer_id) <= 100),
 customer_email text check (length(customer_email) <= 320),
 status text not null check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
 price_id text check (length(price_id) <= 100),
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index subscriptions_user on public.subscriptions(user_id);
create index subscriptions_email on public.subscriptions(lower(customer_email)) where user_id is null;
alter table public.subscriptions enable row level security;
create policy subscriptions_read on public.subscriptions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.subscriptions from anon,authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- Pro while a subscription is active, trialing or in Stripe's payment retry window, with a 3-day grace after the
-- paid period. A signed-in member can only ask about themselves; the server (no auth.uid()) can ask about anyone.
create function public.is_pro(owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select owner is not null and (auth.uid() is null or auth.uid()=owner) and exists(
  select 1 from public.subscriptions s where s.user_id=owner and s.status in ('active','trialing','past_due')
   and (s.current_period_end is null or s.current_period_end > now()-interval '3 days'))
$$;
revoke all on function public.is_pro(uuid) from public,anon;
grant execute on function public.is_pro(uuid) to authenticated,service_role;

-- Live WHOOP seats. A seat is 'pending' for 15 minutes while the member authorizes WHOOP, then 'active'.
create table public.whoop_seats (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','active')),
 claimed_at timestamptz not null default now(),
 expires_at timestamptz,
 check (status='active' or expires_at is not null)
);
alter table public.whoop_seats enable row level security;
revoke all on public.whoop_seats from anon,authenticated;
grant all on public.whoop_seats to service_role;

-- Takes (or keeps) a seat atomically. A transaction-level advisory lock serializes every claim, so two members can
-- never both take the last seat: the second one counts after the first one's insert has committed.
create function public.claim_whoop_seat(owner uuid, cap integer, activate boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare mine public.whoop_seats; taken integer;
begin
 if owner is null then raise exception 'Sign in first.'; end if;
 if cap is null or cap < 0 or cap > 100000 then raise exception 'Invalid WHOOP seat cap.'; end if;
 perform pg_advisory_xact_lock(hashtext('xeyo.whoop_seats'));
 delete from public.whoop_seats where status='pending' and expires_at < now();
 if not public.is_pro(owner) then
  select count(*) into taken from public.whoop_seats;
  return jsonb_build_object('ok',false,'reason','pro_required','taken',taken,'cap',cap);
 end if;
 select * into mine from public.whoop_seats where user_id=owner;
 if mine.user_id is not null then
  if activate then update public.whoop_seats set status='active',expires_at=null where user_id=owner;
  elsif mine.status='pending' then update public.whoop_seats set expires_at=now()+interval '15 minutes' where user_id=owner; end if;
  select count(*) into taken from public.whoop_seats;
  return jsonb_build_object('ok',true,'status',case when activate then 'active' else mine.status end,'taken',taken,'cap',cap);
 end if;
 select count(*) into taken from public.whoop_seats;
 if taken >= cap then return jsonb_build_object('ok',false,'reason','full','taken',taken,'cap',cap); end if;
 insert into public.whoop_seats(user_id,status,expires_at) values(owner,case when activate then 'active' else 'pending' end,case when activate then null else now()+interval '15 minutes' end);
 return jsonb_build_object('ok',true,'status',case when activate then 'active' else 'pending' end,'taken',taken+1,'cap',cap);
end $$;
create function public.release_whoop_seat(owner uuid) returns boolean language sql security invoker set search_path='' as $$
 with gone as (delete from public.whoop_seats where user_id=owner returning 1) select exists(select 1 from gone)
$$;
create function public.whoop_seat_summary(owner uuid, cap integer) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('cap',cap,
  'taken',(select count(*) from public.whoop_seats where status='active' or expires_at>=now()),
  'left',greatest(0,cap-(select count(*) from public.whoop_seats where status='active' or expires_at>=now())),
  'mine',(select status from public.whoop_seats where user_id=owner and (status='active' or expires_at>=now())))
$$;
-- Members whose seat outlived their Pro subscription. The server disconnects them and frees the seat.
create function public.lapsed_whoop_seats() returns setof uuid language sql stable security invoker set search_path='' as $$
 select s.user_id from public.whoop_seats s where not public.is_pro(s.user_id)
$$;
revoke all on function public.claim_whoop_seat(uuid,integer,boolean),public.release_whoop_seat(uuid),public.whoop_seat_summary(uuid,integer),public.lapsed_whoop_seats() from public,anon,authenticated;
grant execute on function public.claim_whoop_seat(uuid,integer,boolean),public.release_whoop_seat(uuid),public.whoop_seat_summary(uuid,integer),public.lapsed_whoop_seats() to service_role;

-- When every seat is taken, members can wait for one. First come, first served.
create table public.whoop_waitlist (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text check (length(email) <= 320),
 joined_at timestamptz not null default now(),
 notified_at timestamptz
);
create index whoop_waitlist_order on public.whoop_waitlist(joined_at);
alter table public.whoop_waitlist enable row level security;
create policy waitlist_read on public.whoop_waitlist for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.whoop_waitlist from anon,authenticated;
grant select on public.whoop_waitlist to authenticated;
grant all on public.whoop_waitlist to service_role;

-- One-time notices (for example: "live WHOOP sync is now a Pro feature"). Shown until the member dismisses them.
create table public.account_notices (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind ~ '^[a-z][a-z_]{2,40}$'),
 created_at timestamptz not null default now(),
 seen_at timestamptz,
 primary key(user_id,kind)
);
alter table public.account_notices enable row level security;
create policy notices_read on public.account_notices for select to authenticated using ((select auth.uid())=user_id);
create policy notices_dismiss on public.account_notices for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.account_notices from anon,authenticated;
grant select on public.account_notices to authenticated;
grant update(seen_at) on public.account_notices to authenticated;
grant all on public.account_notices to service_role;

-- Product analytics: the onboarding funnel and paywall views. Members can write their own events, never read them.
create table public.analytics_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 event text not null check (event ~ '^[a-z][a-z0-9_.]{2,60}$'),
 step text check (length(step) <= 60),
 props jsonb not null default '{}'::jsonb check (jsonb_typeof(props)='object' and pg_column_size(props) <= 2000),
 session_id uuid,
 created_at timestamptz not null default now()
);
create index analytics_events_event_time on public.analytics_events(event,created_at desc);
alter table public.analytics_events enable row level security;
create policy analytics_insert on public.analytics_events for insert to authenticated with check ((select auth.uid())=user_id);
revoke all on public.analytics_events from anon,authenticated;
grant insert(user_id,event,step,props,session_id) on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;
-- The onboarding funnel, step by step: how many people saw, finished and left each step.
create view public.onboarding_funnel with (security_invoker=true) as
 select step,
  count(distinct user_id) filter (where event='onboarding_step_viewed') as viewed,
  count(distinct user_id) filter (where event='onboarding_step_completed') as completed,
  count(distinct user_id) filter (where event='onboarding_step_dropped') as dropped,
  min(created_at) as first_seen, max(created_at) as last_seen
 from public.analytics_events where event like 'onboarding_step_%' group by step;
revoke all on public.onboarding_funnel from public,anon,authenticated;
grant select on public.onboarding_funnel to service_role;

-- Free allowances that reset each month (Ask Xeyo questions). One atomic statement takes a use or refuses.
create table public.feature_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 feature text not null check (feature ~ '^[a-z_]{2,40}$'),
 period text not null check (period ~ '^\d{4}-\d{2}$'),
 used integer not null default 0 check (used >= 0),
 primary key(user_id,feature,period)
);
alter table public.feature_usage enable row level security;
create policy usage_read on public.feature_usage for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.feature_usage from anon,authenticated;
grant select on public.feature_usage to authenticated;
grant all on public.feature_usage to service_role;
create function public.take_feature_use(owner uuid, p_feature text, p_period text, quota integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.feature_usage(user_id,feature,period,used) values(owner,p_feature,p_period,1)
 on conflict(user_id,feature,period) do update set used=public.feature_usage.used+1 where public.feature_usage.used < quota
 returning used into n;
 if n is null or n > quota then
  select used into n from public.feature_usage where user_id=owner and feature=p_feature and period=p_period;
  return jsonb_build_object('ok',false,'used',coalesce(n,0),'quota',quota);
 end if;
 return jsonb_build_object('ok',true,'used',n,'quota',quota);
end $$;
create function public.refund_feature_use(owner uuid, p_feature text, p_period text) returns void language sql security invoker set search_path='' as $$
 update public.feature_usage set used=greatest(0,used-1) where user_id=owner and feature=p_feature and period=p_period
$$;
revoke all on function public.take_feature_use(uuid,text,text,integer),public.refund_feature_use(uuid,text,text) from public,anon,authenticated;
grant execute on function public.take_feature_use(uuid,text,text,integer),public.refund_feature_use(uuid,text,text) to service_role;

-- File imports: when each member last imported, for the "re-upload after 7 days" reminder.
create table public.wearable_imports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('apple','fitbit','whoop')),
 imported_at timestamptz not null default now(),
 row_count integer not null default 0 check (row_count >= 0),
 first_day date,
 last_day date,
 files text[] not null default '{}' check (cardinality(files) <= 20)
);
create index wearable_imports_user on public.wearable_imports(user_id,provider,imported_at desc);
alter table public.wearable_imports enable row level security;
create policy imports_read on public.wearable_imports for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.wearable_imports from anon,authenticated;
grant select on public.wearable_imports to authenticated;
grant all on public.wearable_imports to service_role;

-- Yes/no behaviours from WHOOP's journal export (for example "Had any alcoholic drinks?"), used by correlations.
create table public.wearable_behaviors (
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check (length(source) <= 100),
 external_id text not null check (length(external_id) <= 200),
 day date not null,
 question text not null check (length(question) between 1 and 200),
 answered_yes boolean not null,
 notes text not null default '' check (length(notes) <= 1000),
 primary key(user_id,source,external_id)
);
alter table public.wearable_behaviors enable row level security;
create policy behaviors_read on public.wearable_behaviors for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.wearable_behaviors from anon,authenticated;
grant select on public.wearable_behaviors to authenticated;
grant all on public.wearable_behaviors to service_role;

-- AI Weekly Health Reports (Pro), one per member per week.
create table public.weekly_reports (
 user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null,
 content jsonb not null,
 model text,
 created_at timestamptz not null default now(),
 emailed_at timestamptz,
 primary key(user_id,week_start)
);
alter table public.weekly_reports enable row level security;
create policy reports_read on public.weekly_reports for select to authenticated using ((select auth.uid())=user_id and (select public.is_pro((select auth.uid()))));
revoke all on public.weekly_reports from anon,authenticated;
grant select on public.weekly_reports to authenticated;
grant all on public.weekly_reports to service_role;
create table public.report_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email_weekly boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.report_settings enable row level security;
create policy report_settings_read on public.report_settings for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.report_settings from anon,authenticated;
grant select on public.report_settings to authenticated;
grant all on public.report_settings to service_role;

-- Wearable connections: when a connection was made (new connections only; older rows stay null), and the
-- provider's own user id so pushed data (Garmin) can be matched to a member.
alter table public.wearable_secrets add column connected_at timestamptz;
alter table public.wearable_secrets alter column connected_at set default now();
alter table public.wearable_secrets add column external_user_id text check (length(external_user_id) <= 200);
create unique index wearable_secrets_external on public.wearable_secrets(provider,external_user_id) where external_user_id is not null;

-- Free members see 30 days of wearable readings; their own typed measurements always; Pro sees everything.
drop policy readings_read on public.health_readings;
create policy readings_read on public.health_readings for select to authenticated using (
 (select auth.uid())=user_id and (source='Manual entry' or observed_at >= now()-interval '30 days' or (select public.is_pro((select auth.uid())))));

-- The WHOOP connections the Pro change affects, for the disconnect script (server only).
create function public.whoop_connections_report() returns table(user_id uuid,email text,connected_at timestamptz,updated_at timestamptz,last_synced_at timestamptz,first_reading timestamptz,readings bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 return query select w.user_id,u.email::text,w.connected_at,w.updated_at,w.last_synced_at,
  (select min(h.observed_at) from public.health_readings h where h.user_id=w.user_id and h.source='WHOOP'),
  (select count(*) from public.health_readings h where h.user_id=w.user_id and h.source='WHOOP')
 from public.wearable_secrets w join auth.users u on u.id=w.user_id where w.provider='whoop' order by w.updated_at;
end $$;
revoke all on function public.whoop_connections_report() from public,anon,authenticated;
grant execute on function public.whoop_connections_report() to service_role;
-- Links a subscription paid from the website (no account id) to the member with that verified email.
create function public.user_id_by_email(p_email text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare found_id uuid;
begin
 execute 'select id from auth.users where lower(email)=lower($1) and email_confirmed_at is not null limit 1' into found_id using p_email;
 return found_id;
end $$;
revoke all on function public.user_id_by_email(text) from public,anon,authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
