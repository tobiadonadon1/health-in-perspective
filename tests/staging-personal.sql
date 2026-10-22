-- Synthetic participants and measurements: this transaction always rolls back.
begin;
select set_config('xeyo.test_viewer',gen_random_uuid()::text,true);
create temporary table xeyo_test_participants(id uuid primary key,ordinal integer);
insert into xeyo_test_participants select gen_random_uuid(),n from generate_series(1,21) n;
update xeyo_test_participants set id=current_setting('xeyo.test_viewer')::uuid where ordinal=1;
insert into auth.users(id,email) select id,'xeyo-peer-qa-'||id||'@invalid.example' from xeyo_test_participants;
insert into public.profiles(user_id,representation,gender,age,peer_opt_in) select id,'stats','unspecified',28,true from xeyo_test_participants;
insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at)
 select p.id,'resting_hr',case when ordinal=1 then 60 else 50+ordinal end,'bpm','Xeyo transactional QA',n::text,now()-n*interval '1 day' from xeyo_test_participants p cross join generate_series(1,8) n;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('xeyo.test_viewer'),true);
do $$ declare r jsonb; begin
 if (select count(*) from public.profiles)<>1 then raise exception 'Cross-account profile exposed'; end if;
 r:=public.peer_percentiles();
 if (r->'metrics'->0->>'peer_count')::int<>20 then raise exception 'Wrong peer count'; end if;
 if (r->'metrics'->0->>'percentile')::numeric<>42.5 then raise exception 'Wrong percentile'; end if;
 begin perform 1 from public.chat_connections;raise exception 'Credentials exposed';exception when insufficient_privilege then null;end;
 update public.profiles set peer_opt_in=false;
 if public.peer_percentiles()->>'status'<>'opt_in_required' then raise exception 'Opt out ignored'; end if;
end $$;
reset role;
select 'PASS: live profile isolation, cohort percentile arithmetic, credential privacy and opt-out' as result;
rollback;
