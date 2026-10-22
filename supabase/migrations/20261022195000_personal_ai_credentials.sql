create table public.ai_credentials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_key text not null,
 updated_at timestamptz not null default now()
);
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from public,anon,authenticated;
grant all on public.ai_credentials to service_role;
comment on table public.ai_credentials is 'Server-only encrypted personal OpenAI keys. Never returned to a browser.';
