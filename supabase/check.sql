-- Privilege report for the shared `portfolio` project: run after bootstrap.sql (and after an
-- app's migrations) in the Supabase SQL editor. One row per app or Data API role and app schema.
--
-- Expected: 54 rows (9 roles x 6 schemas); fewer means a role or schema is missing, so the
-- bootstrap has not run. A writer (`<app>_app`) has every column true on its own schema;
-- `dash_reader` has usage, tables_read and future_read on `dash_demo`; every other row is all
-- false. tables_* is false where an app revoked access on purpose (its migration history).
--   usage, create   schema privileges
--   tables_*        over the schema's existing tables (null while it has none)
--   future_*        default privileges for tables `postgres` (migrations) creates later
with roles (role) as (
  values ('dash_app'), ('dash_reader'), ('wf_app'), ('traces_app'), ('rag_app'), ('oauth_app'),
    ('anon'), ('authenticated'), ('service_role')
),
schemas (schema) as (
  values ('dash'), ('dash_demo'), ('wf'), ('traces'), ('rag'), ('oauth')
),
defaults as (
  select n.nspname as schema, acl.grantee, acl.privilege_type
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) as acl
  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r'
)
select
  r.role,
  s.schema,
  has_schema_privilege(r.role, s.schema, 'usage') as usage,
  has_schema_privilege(r.role, s.schema, 'create') as create,
  bool_and(has_table_privilege(r.role, c.oid, 'select')) as tables_read,
  bool_and(
    has_table_privilege(r.role, c.oid, 'insert')
    and has_table_privilege(r.role, c.oid, 'update')
    and has_table_privilege(r.role, c.oid, 'delete')) as tables_write,
  exists (
    select from defaults d
    where d.schema = s.schema and d.grantee = r.role::regrole and d.privilege_type = 'SELECT'
  ) as future_read,
  (
    select count(distinct d.privilege_type) = 3 from defaults d
    where d.schema = s.schema and d.grantee = r.role::regrole
      and d.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) as future_write
from roles r
join pg_roles pr on pr.rolname = r.role
cross join schemas s
join pg_namespace n on n.nspname = s.schema
left join pg_class c on c.relnamespace = n.oid and c.relkind in ('r', 'p')
group by r.role, s.schema
order by r.role, s.schema;
