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
