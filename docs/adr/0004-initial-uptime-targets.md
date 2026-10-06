# 0004 — Initial uptime targets and database keepalive

- Status: Accepted
- Date: 2026-10-06
- Proposed by: Codex; decided by: Georges

## Context

M6 needs live HTTP checks and database activity before the planned database-backed
apps have deployed health routes. The existing gacha-hub homepage responds, but
its `/api/health` route does not exist. An Auth-service health response alone does
not prove a database query ran.

## Decision

Start with the existing gacha-hub homepage and the shared project's
`GET /rest/v1/rpc/portfolio_health` endpoint. The latter invokes a stable,
security-invoker SQL function returning `ok` without reading application data.
Its SQL, explicit grants and privilege tests live alongside the bootstrap.

Extend targets with optional `headersFromEnv`, mapping lower-case `apikey`,
`authorization` or `x-*` header names to environment variable names. The database
target uses `apikey: SUPABASE_PUBLISHABLE_KEY`; its value is a GitHub repository
variable, never embedded in target JSON, URLs, issues or summaries. Redirects are
rejected so authorization cannot be forwarded to another origin. Missing header
configuration stops the run before checks and does not manufacture outage alerts.

## Alternatives considered

Waiting for undeployed apps leaves M6 untestable. An admin database connection in
the workflow gives a health checker excessive privileges and needs a password.
An Auth health route does not establish database activity.

## Consequences

The first checks cover an existing homepage and actual SQL execution. Add each
app's real health endpoint when deployed; do not interpret homepage success as a
test of every app feature. The public RPC exposes only a constant. Six-hour SQL
activity is a keepalive attempt, not a guarantee against provider-side suspension.
