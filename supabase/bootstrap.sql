-- Schemas, roles and extensions for every database-backed app in the shared `portfolio`
-- Supabase project (DESIGN.md §8, ENGINEERING.md §11).
--
-- Run as `postgres` in the Supabase SQL editor. Idempotent: safe to re-run, also after an app's
-- migrations have created tables. Then:
--   1. set each login role's password, typed in the editor and never committed:
--        alter role dash_reader password '...';
--   2. run supabase/check.sql to verify the privileges.
--
-- Roles are created without a password, so they cannot sign in until step 1. Migrations run as
-- `postgres` (DATABASE_URL_MIGRATIONS); app roles only ever reach their own schema, and no app
-- schema is exposed to the Data API roles (`anon`, `authenticated`).

-- One app schema for one role. Writers get USAGE and CREATE plus read-write on tables and
-- sequences; readers get USAGE plus read-only. Covers existing tables and, through default
-- privileges, every table `postgres` creates later.
create or replace function pg_temp.app_schema(schema_name text, role_name text, writable boolean)
returns void
language plpgsql
as $$
begin
  if not exists (select from pg_roles where rolname = role_name) then
    execute format('create role %I login', role_name);
  end if;
  execute format('create schema if not exists %I', schema_name);
  execute format('revoke all on schema %I from public', schema_name);

  if writable then
    execute format('grant usage, create on schema %I to %I', schema_name, role_name);
    execute format(
      'grant select, insert, update, delete on all tables in schema %I to %I', schema_name, role_name);
    execute format('grant usage, select on all sequences in schema %I to %I', schema_name, role_name);
    execute format(
      'alter default privileges for role postgres in schema %I '
      'grant select, insert, update, delete on tables to %I', schema_name, role_name);
    execute format(
      'alter default privileges for role postgres in schema %I grant usage, select on sequences to %I',
      schema_name, role_name);
  else
    execute format('grant usage on schema %I to %I', schema_name, role_name);
    execute format('grant select on all tables in schema %I to %I', schema_name, role_name);
    execute format(
      'alter default privileges for role postgres in schema %I grant select on tables to %I',
      schema_name, role_name);
  end if;
end
$$;

-- dashboard-builder: app data, and demo source data read through RLS.
select pg_temp.app_schema('dash', 'dash_app', true);
select pg_temp.app_schema('dash_demo', 'dash_reader', false);

-- durable-workflow-engine
select pg_temp.app_schema('wf', 'wf_app', true);

-- agent-trace-viewer
select pg_temp.app_schema('traces', 'traces_app', true);

-- rag-inspector
select pg_temp.app_schema('rag', 'rag_app', true);

-- oauth-oidc-server
select pg_temp.app_schema('oauth', 'oauth_app', true);

-- Extensions: pg_cron (dashboard-builder, durable-workflow-engine), pg_net (durable-workflow-
-- engine), vector (rag-inspector). Supabase keeps relocatable extensions in `extensions`.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists vector with schema extensions;
