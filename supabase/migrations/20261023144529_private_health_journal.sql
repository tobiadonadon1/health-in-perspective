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
