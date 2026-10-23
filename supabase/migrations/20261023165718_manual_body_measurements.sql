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
