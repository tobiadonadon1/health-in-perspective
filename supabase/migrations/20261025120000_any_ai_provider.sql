-- Chat, journal reflections and nutrition can use any supported provider. Endpoints stay fixed in the API.
begin;
alter table public.chat_connections drop constraint if exists chat_connections_provider_check;
alter table public.chat_connections add constraint chat_connections_provider_check check(provider in ('openai','anthropic','gemini','openrouter','mistral','groq','xai','deepseek'));
alter table public.journal_reflections drop constraint if exists journal_reflections_provider_check;
alter table public.journal_reflections add constraint journal_reflections_provider_check check(provider in ('openai','anthropic','gemini','openrouter','mistral','groq','xai','deepseek'));
commit;
