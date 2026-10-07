# Supabase project `portfolio`

The shared database for every database-backed portfolio app (ENGINEERING.md §11). This file records the project's settings and how to bring a new app's role online. Update it, and the changes table at the end, whenever a setting changes.

| | |
| --- | --- |
| Reference | `fztysvgkmauozxfyscaj` |
| Region | Paris (`eu-west-3`) |
| API URL | `https://fztysvgkmauozxfyscaj.supabase.co` |
| Created | 2026-10-04 |

## Auth (checked 2026-10-07)

Auth settings apply to every app in the project, so apps authorize through their own tables, never on "the user is signed in" (DESIGN.md §8).

| Setting | Value | Used by |
| --- | --- | --- |
| Anonymous sign-ins | On | dashboard-builder |
| Email sign-in | Off. No app uses it, and it was the way in for redirect abuse | — |
| Leaked-password protection | Off. Moot while no password sign-in is enabled; turn it on if email sign-in returns | — |
| GitHub provider | Off, and its OAuth app is deleted. No app offers GitHub sign-in yet. When one does, create a GitHub OAuth app with callback `https://fztysvgkmauozxfyscaj.supabase.co/auth/v1/callback`, enter its client ID and secret in the dashboard, and add that app's exact redirect domains | — |
| JWT signing | Asymmetric ES256, published at `/auth/v1/.well-known/jwks.json` | every app verifies tokens through the JWKS |
| Redirect URLs | None. Anonymous sign-in needs no redirect. Add each app's exact production and preview domains when it adds email or OAuth sign-in; never a wildcard such as `https://*.vercel.app`, which accepts anyone's Vercel deployment | — |

## Extensions

| Extension | Schema | Installed by |
| --- | --- | --- |
| `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` | Supabase defaults | Supabase |
| `pg_cron` 1.6.4 | `pg_catalog`, jobs in `cron` | `bootstrap.sql`: dashboard-builder, durable-workflow-engine (jobs scheduled by their migrations as `postgres`) |
| `pg_net` 0.20.4 | functions in `net`, which `wf_app` may use; pg_net itself also grants `anon` and `authenticated` access to `net` | `bootstrap.sql`: durable-workflow-engine |
| `vector` 0.8.2 | `rag`, so only `rag_app` can use it (as `rag.vector`) | `bootstrap.sql`: rag-inspector |

## Bringing roles online

Everything happens in the Supabase dashboard; it works from a phone browser too.

1. **Run the bootstrap.** SQL Editor → New query → paste [`bootstrap.sql`](bootstrap.sql) → Run.
   - It refuses to run as anyone but `postgres`.
   - It is idempotent: re-run it after adding an app or if in doubt. It never re-grants on existing tables, so revokes made by migrations stay.
2. **Set the passwords** of the roles an app needs, one query each:
   ```sql
   alter role dash_reader password 'generated-password';
   ```
   - Generate a long, URL-safe password (letters and digits only) in a password manager, since it goes into a connection string.
   - Never commit it or paste it anywhere else.
   - The statement is written in plain text to the project's Postgres logs (`log_statement = ddl`), which project members can read, and the SQL editor keeps the query. Delete the query afterwards.
   - From a computer, `psql`'s `\password <role>` is better: it sends only a hash.
3. **Check the privileges.** Paste [`check.sql`](check.sql) and Run. It should return 54 rows:
   - each `<app>_app` row on its own schema is all `true`;
   - `dash_reader` on `dash_demo` is `true` for `usage`, `tables_read` and `future_read`;
   - every other row is `false`;
   - `tables_*` stays empty until the app's migrations create tables.
4. **Build the connection strings.** In Connect → Connection string, copy the pooler host shown there (`aws-…-eu-west-3.pooler.supabase.com`), then:
   - **App roles:** transaction pooler, port `6543`, prepared statements off in the driver: `postgres://<role>.fztysvgkmauozxfyscaj:<password>@<pooler host>:6543/postgres`
   - **Migrations:** session pooler, port `5432`, user `postgres.fztysvgkmauozxfyscaj` with the project's database password: `postgres://postgres.fztysvgkmauozxfyscaj:<database password>@<pooler host>:5432/postgres`

| App | Variable | Where | Role | Pooler |
| --- | --- | --- | --- | --- |
| dashboard-builder | `DASH_SOURCE_URL` | Vercel (Production, Preview) | `dash_reader` | transaction |
| dashboard-builder | `DASH_APP_DATABASE_URL` | Vercel (Production, Preview) | `dash_app` | transaction |
| dashboard-builder | `DATABASE_URL_MIGRATIONS` | GitHub Actions secret | `postgres` | session |

Add a row per app as each one comes online.

## Shared operational endpoints

[`health.sql`](health.sql) defines `public.portfolio_health()`: a stable,
security-invoker function that returns only `ok` and does not read application
data. It revokes the default `PUBLIC` execute permission and grants only `anon`
and `authenticated`, so the uptime job can call
`GET /rest/v1/rpc/portfolio_health` with the publishable key without a database
password. Re-run it after restoring the project or replacing PostgREST.

[`storage.sql`](storage.sql) creates `trace-payloads` as a private bucket and
restores its privacy if it is re-run. It deliberately creates no Storage policies:
agent-trace-viewer owns those policies in its own migrations before it uploads
payloads.

## Changes

| Date | Setting | Change | Reason |
| --- | --- | --- | --- |
| 2026-10-05 | Auth: anonymous sign-ins | Turned on | dashboard-builder visitors sign in anonymously |
| 2026-10-05 | Auth: redirect URLs | Added `https://*.vercel.app` (to be removed, see Auth) | dashboard-builder previews |
| 2026-10-06 | Auth: email sign-in | Turned off | No app uses it; it was the way in for redirect abuse |
| 2026-10-06 | Auth: redirect URLs | Removed `https://*.vercel.app` | It accepted any Vercel deployment; anonymous sign-in needs no redirect |
| 2026-10-07 | Auth: GitHub provider | Turned on | For agent-trace-viewer; until its exact domains are added as redirect URLs, sign-ins return to the Site URL |
| 2026-10-07 | Auth: GitHub provider | Turned off; OAuth app deleted | agent-trace-viewer is not started; keep unused sign-in methods off until a project needs them |
