-- Schemas, roles and extensions for every database-backed app in the shared `portfolio`
-- Supabase project (DESIGN.md §8, ENGINEERING.md §11).
--
-- Run as `postgres` in the Supabase SQL editor. Idempotent: safe to re-run, also after an app's
-- migrations have created tables. Then set each login role's password and run check.sql, as
-- described in supabase/PROJECT.md. Roles are created without a password, so they cannot sign
-- in until then.
--
-- Migrations run as `postgres` (DATABASE_URL_MIGRATIONS). Every table they create in an app
-- schema is read-write for the app's role through default privileges, so an app revokes its role's
-- access to anything it must not touch (its migration history table) in a migration. Re-running
-- this script never re-grants on existing tables, so those revokes stay. App roles only ever
-- reach their own schema, and no app schema is exposed to the Data API roles.

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Run bootstrap.sql as postgres, not %', current_user;
  end if;
end
$$;

-- One app schema for one role: writers get USAGE and CREATE and read-write on the tables and
-- sequences `postgres` creates there; readers get USAGE and read-only.
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
      'alter default privileges for role postgres in schema %I '
      'grant select, insert, update, delete on tables to %I', schema_name, role_name);
    execute format(
      'alter default privileges for role postgres in schema %I grant usage, select on sequences to %I',
      schema_name, role_name);
  else
    execute format('grant usage on schema %I to %I', schema_name, role_name);
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

-- Extensions. pg_cron: dashboard-builder and durable-workflow-engine (jobs scheduled by their
-- migrations as postgres). pg_net: durable-workflow-engine; its functions live in schema `net`.
-- vector: rag-inspector, installed in `rag` so only rag_app can use it (as `rag.vector`).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
grant usage on schema net to wf_app;
grant execute on all functions in schema net to wf_app;
create extension if not exists vector with schema rag;
