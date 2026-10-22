-- Run only against the dedicated staging project. Everything is rolled back.
begin;
select set_config('neka.test_a', gen_random_uuid()::text, true);
select set_config('neka.test_b', gen_random_uuid()::text, true);
insert into auth.users(id, email) values
 (current_setting('neka.test_a')::uuid, 'neka-rls-test-a@invalid.example'),
 (current_setting('neka.test_b')::uuid, 'neka-rls-test-b@invalid.example');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('neka.test_a'),true);
insert into public.meals(user_id,name,calories,protein,carbs,fat,meal_type,source)
 values(current_setting('neka.test_a')::uuid,'Synthetic isolation test',100,10,10,2,'Snack','QA');
insert into storage.objects(bucket_id,name)
 values('health-records',current_setting('neka.test_a')||'/qa.pdf');
insert into public.lab_results(user_id,marker,value,unit,collected_on) values(current_setting('neka.test_a')::uuid,'Synthetic ferritin',42,'ng/mL','2026-01-01');
do $$ begin
 if (select count(*) from public.lab_results) <> 1 then raise exception 'Own lab result not visible'; end if;
 begin update public.lab_results set user_id=current_setting('neka.test_b')::uuid;raise exception 'Lab ownership change allowed'; exception when insufficient_privilege then null;end;
 if (select count(*) from public.meals) <> 1 then raise exception 'Own meal not visible'; end if;
 begin
  update public.meals set user_id=current_setting('neka.test_b')::uuid;
  raise exception 'Ownership reassignment unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at)
   values(current_setting('neka.test_a')::uuid,'hrv',999,'ms','WHOOP','qa-forged',now());
  raise exception 'Client-forged wearable measurement allowed';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.wearable_secrets;raise exception 'Token table exposed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('neka.test_b'),true);
do $$ begin
 if exists(select from public.lab_results) then raise exception 'Cross-account lab result exposed';end if;
 if exists(select from public.meals) then raise exception 'Cross-account meal exposed'; end if;
 if exists(select from storage.objects where bucket_id='health-records') then raise exception 'Cross-account file exposed'; end if;
 begin
  insert into public.meals(user_id,name,calories,protein,carbs,fat,meal_type,source)
   values(current_setting('neka.test_a')::uuid,'Forged ownership',100,10,10,2,'Snack','QA');
  raise exception 'Cross-account meal insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('health-records',current_setting('neka.test_a')||'/forged.pdf');
  raise exception 'Cross-account file insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.meals;raise exception 'Anonymous meals access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: real staging roles isolate synthetic users, blood results, files, and wearable tokens' as result;
rollback;
