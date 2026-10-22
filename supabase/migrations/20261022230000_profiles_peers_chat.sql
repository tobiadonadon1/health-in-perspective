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
