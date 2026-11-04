-- Daily safety net for Pro (disconnect WHOOP for anyone whose Pro ran out without a webhook) and the Monday weekly-report run.
-- Needs the admin secret in Vault as xeyo_admin_task_secret (same value as the API's ADMIN_TASK_SECRET); see docs/PRO-TIER-DEPLOY.md.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('xeyo-pro-daily','15 3 * * *',$job$select net.http_post(
 url:='https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api',
 headers:=jsonb_build_object('Content-Type','application/json','x-xeyo-admin',(select decrypted_secret from vault.decrypted_secrets where name='xeyo_admin_task_secret')),
 body:='{"action":"pro-maintenance"}'::jsonb)$job$);
select cron.schedule('xeyo-weekly-report','0 7 * * 1',$job$select net.http_post(
 url:='https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api',
 headers:=jsonb_build_object('Content-Type','application/json','x-xeyo-admin',(select decrypted_secret from vault.decrypted_secrets where name='xeyo_admin_task_secret')),
 body:='{"action":"pro-maintenance","weekly":true}'::jsonb)$job$);
