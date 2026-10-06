-- Shared private bucket required by DESIGN.md §8. Run as postgres after the
-- hosted Storage service has initialized its schema. App-specific Storage RLS
-- policies belong to agent-trace-viewer's migrations; this grants no access.
insert into storage.buckets (id, name, public)
values ('trace-payloads', 'trace-payloads', false)
on conflict (id) do update set public = false;
