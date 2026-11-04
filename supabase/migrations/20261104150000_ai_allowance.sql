-- Monthly AI allowance, measured in what the included AI actually costs (micro-dollars), instead of a question count.
-- Free: Claude Haiku up to $1 a month. Pro: Claude Sonnet, then Haiku, up to $3 a month. Stored in feature_usage as
-- feature 'ai_spend' (one row per member per month); the edge function adds each answer's cost after it arrives.
create function public.add_feature_use(owner uuid, p_feature text, p_period text, amount integer) returns integer
language sql security invoker set search_path='' as $$
 insert into public.feature_usage(user_id,feature,period,used) values(owner,p_feature,p_period,greatest(0,amount))
 on conflict(user_id,feature,period) do update set used=public.feature_usage.used+greatest(0,excluded.used)
 returning used
$$;
revoke all on function public.add_feature_use(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.add_feature_use(uuid,text,text,integer) to service_role;
