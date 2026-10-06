-- Shared database keep-alive for uptime/targets.json. Run as postgres.
-- GET /rest/v1/rpc/portfolio_health with the project's publishable apikey.
-- The query exercises Postgres without reading application data.
create or replace function public.portfolio_health()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select 'ok'::text from (select 1) as probe $$;

revoke all on function public.portfolio_health()
  from public, postgres, service_role;
grant execute on function public.portfolio_health() to anon, authenticated;
notify pgrst, 'reload schema';
