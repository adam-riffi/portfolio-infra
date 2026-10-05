# Supabase project `portfolio`

The shared database for every database-backed portfolio app (ENGINEERING.md §11). This file records the project's settings and how to bring a new app's role online. Update it whenever a setting changes.

| | |
| --- | --- |
| Reference | `fztysvgkmauozxfyscaj` |
| Region | Paris (`eu-west-3`) |
| API URL | `https://fztysvgkmauozxfyscaj.supabase.co` |
| Created | 2026-10-04 |

## Auth (checked 2026-10-05)

Auth settings apply to every app in the project, so apps authorize through their own tables, never on "the user is signed in" (DESIGN.md §8).

| Setting | Value | Used by |
| --- | --- | --- |
| Anonymous sign-ins | On | dashboard-builder |
| Email sign-in | On (default); confirmation required | — |
| GitHub provider | Off; turn on with agent-trace-viewer | agent-trace-viewer |
| JWT signing | Asymmetric ES256, published at `/auth/v1/.well-known/jwks.json` | every app verifies tokens through the JWKS |
| Redirect URLs | `https://*.vercel.app` (added 2026-10-05 for dashboard-builder previews); narrow it to each app's production and preview domains | dashboard-builder |

## Extensions

| Extension | Schema | Installed by |
| --- | --- | --- |
| `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` | Supabase defaults | Supabase |
| `pg_cron` 1.6.4 | `pg_catalog` (`cron` jobs) | `bootstrap.sql`: dashboard-builder, durable-workflow-engine |
| `pg_net` 0.20.4 | `extensions` | `bootstrap.sql`: durable-workflow-engine |
| `vector` 0.8.2 | `extensions` | `bootstrap.sql`: rag-inspector |

## Bringing roles online

Everything happens in the Supabase dashboard; it works from a phone browser too.

1. **Run the bootstrap.** SQL Editor → New query → paste [`bootstrap.sql`](bootstrap.sql) → Run. It is idempotent: re-run it after adding an app or if in doubt.
2. **Set the passwords** of the roles an app needs, one query each. Generate the passwords in a password manager, and never commit them or paste them anywhere else:
   ```sql
   alter role dash_reader password 'generated-password';
   ```
3. **Check the privileges.** Paste [`check.sql`](check.sql) and Run.
   - Each `<app>_app` row on its own schema is all `true`.
   - `dash_reader` on `dash_demo` is `true` for `usage`, `tables_read` and `future_read`.
   - Every other row is `false`.
   - `tables_*` stays empty until the app's migrations create tables.
4. **Build the connection strings.** In Connect → Connection string, copy the pooler host shown there (`aws-…-eu-west-3.pooler.supabase.com`), then:
   - **App roles:** transaction pooler, port `6543`, user `<role>.fztysvgkmauozxfyscaj`: `postgres://<role>.fztysvgkmauozxfyscaj:<password>@<pooler host>:6543/postgres`. Prepared statements must be off in the driver.
   - **Migrations:** the `postgres` role over the session pooler, port `5432`, with the project's database password.

| App | Variable | Where | Role | Pooler |
| --- | --- | --- | --- | --- |
| dashboard-builder | `DASH_SOURCE_URL` | Vercel (Production, Preview) | `dash_reader` | transaction |
| dashboard-builder | `DASH_APP_DATABASE_URL` | Vercel (Production, Preview) | `dash_app` | transaction |
| dashboard-builder | `DATABASE_URL_MIGRATIONS` | GitHub Actions secret | `postgres` | session |

Add a row per app as each one comes online.
