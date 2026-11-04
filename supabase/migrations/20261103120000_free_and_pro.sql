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
