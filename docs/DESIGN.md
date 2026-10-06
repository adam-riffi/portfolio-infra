# portfolio-infra — PR meme pipeline, shared database and uptime

> Status: draft v1 · Owner: Georges · Updated: 2026-10-06 · Language: TypeScript (Node) · Hosting: GitHub Actions only (no Vercel project) · Build first: every other repository depends on it.

## 1. Summary

A small public repository holding the automation shared by all portfolio projects:

1. **PR meme pipeline (headline).** A pool of images is committed under `memes/` in this repository; a GitHub Action posts one meme comment on every pull request in every portfolio repository, picking an image that matches the PR type (`feat`, `fix`, …).
2. **Shared database bootstrap.** One SQL script that creates the per-app schemas and roles in the shared Supabase project `portfolio` (Paris), plus ownership of that project's sign-in settings.
3. **Uptime and keep-alive.** A scheduled check of every live demo, which also keeps the Free-plan Supabase project from pausing.
4. **Templates.** The canonical `ENGINEERING.md`, PR template and Dependabot configuration copied into each repository.

## 2. Goals and non-goals

**Goals**
- Zero per-repository secrets: project repositories add one 15-line caller workflow and nothing else.
- Cloning and forking stay seamless: nothing to configure, and nothing runs in forks or on PRs from forks.
- No GitHub App: only the built-in `GITHUB_TOKEN` of each repository.
- Idempotent and deterministic: one meme per PR, the same choice on every re-run.
- Fail open: the action never blocks CI and never fails a workflow because of the image source.

**Non-goals**
- Pinterest or Google Drive integration: images are committed to this repository ([ADR 0005](adr/0005-remove-drive-sync.md)).
- Generating memes with AI, or captions.
- Hosting images anywhere other than this public repository.

## 3. Users and demo story

The user is Georges and his coding agents (Claude Code, Codex, Copilot), which open PRs from his machine under his GitHub identity. The visible behavior: within a minute of an agent opening a PR, a comment with a meme appears. A `fix:` PR gets a "fix" meme when that category exists. Committing a new image and its manifest entry to `main` makes it eligible on the next PR.

## 4. Scope

**v1 (must)**
- Committed meme pool with `manifest.json` (initially imported from Google Drive; the sync was removed in [ADR 0005](adr/0005-remove-drive-sync.md)).
- JavaScript action `actions/pr-meme` with category matching, deterministic choice, idempotent comment, skip rules.
- Caller template for project repositories.
- `supabase/bootstrap.sql` for all database-backed apps.
- Uptime workflow with issue-based alerts.
- Dogfooding: this repository's own PRs get memes.

**v1.1 (should)**
- Avoid repeating the same image within the last N PRs of a repository (read recent bot comments).
- Standards sync: when `templates/ENGINEERING.md` changes, open PRs in each project repository with the new copy (fine-grained personal access token, `contents` and `pull-requests` write on the listed repositories).

**Later**
- Weekly digest issue listing PR activity across repositories.

## 5. Architecture

```mermaid
flowchart LR
  P[Project repo PR opened] --> C[pr-meme caller workflow]
  C --> A[actions/pr-meme@v1]
  A -- fetch manifest.json<br/>raw.githubusercontent.com --> R[(portfolio-infra<br/>memes/)]
  A -- create comment with marker<br/>GITHUB_TOKEN --> P
  U[uptime workflow, every 6 h] -- GET health endpoints --> V[Vercel demos]
  V -- select 1 --> DB[(Supabase project portfolio)]
  U -- open/close alert issues --> I[portfolio-infra issues]
```

**Repository layout**
```
portfolio-infra/
├── actions/pr-meme/          # JavaScript action
│   ├── action.yml
│   ├── src/                  # main.ts, select.ts, comment.ts, manifest.ts
│   ├── test/
│   └── dist/index.js         # bundled with esbuild, committed
├── memes/                    # committed: images/<category>/<file>, manifest.json
├── supabase/                 # bootstrap.sql, PROJECT.md (settings log)
├── uptime/                   # targets.json, checker, alert lifecycle and runner
├── templates/                # ENGINEERING.md, pull_request_template.md, dependabot.yml, pr-meme caller
├── .github/workflows/        # ci.yml, uptime.yml, pr-meme.yml (dogfood), release.yml
└── docs/                     # DESIGN.md, ENGINEERING.md, AGENT_LOG.md, adr/
```

## 6. Core design decisions

**Image hosting.** Images are committed under `memes/images/<category>/` and referenced through `https://raw.githubusercontent.com/adam-riffi/portfolio-infra/main/memes/images/...`. GitHub proxies images in comments, so they render in public and private repositories alike. Consequence: every committed image is public. Keep only images you are happy to publish.

**Categories.** Folders under `memes/images/` named after Conventional Commit types (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`, `revert`) are categories, and `memes/images/general/` holds the rest; the manifest accepts no other folder.

**Selection algorithm** (pure function in `select.ts`):
1. Parse the PR title's Conventional Commit type (case-insensitive, optional scope and `!`).
2. Pool = images in that category; if empty, `general`; if empty, all images.
3. Index = FNV-1a 32-bit hash of `"<repo full name>#<PR number>"` modulo pool size, after sorting the pool by image ID so the choice is stable across manifest edits that do not change the pool.

**Comment format.**
```
<!-- pr-meme:v1 id=<image id> -->
<img src="<raw url>" alt="PR meme" width="360">
```
Idempotency: list the PR's comments (paginated); if any comment contains `<!-- pr-meme:v1` the action exits.

**Skip rules** (any one skips, logged with the reason): label `no-meme`; author in `skip-authors` (default `dependabot[bot],renovate[bot]`); manifest unreachable or empty (warning annotation, exit 0); event is not `pull_request`.

**Action runtime.** `runs.using` set to the newest Node runtime GitHub Actions supports at M1 (check the documentation); the bundle is `dist/index.js`, and CI fails if it is stale.

## 7. Interfaces

**Action inputs** (`actions/pr-meme/action.yml`)

| Input | Default | Meaning |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used to read and create comments |
| `manifest-url` | raw URL of `memes/manifest.json` on `main` | Source of images |
| `skip-labels` | `no-meme` | Comma-separated labels that skip the PR |
| `skip-authors` | `dependabot[bot],renovate[bot]` | Comma-separated logins that skip the PR |
| `width` | `360` | Rendered image width in pixels |

Outputs: `image-id`, `skipped-reason`.

**Manifest schema** (`memes/manifest.json`, version 1)
```json
{
  "version": 1,
  "generatedAt": "2026-10-05T03:00:00Z",
  "images": [
    { "id": "<image id>", "category": "fix", "path": "memes/images/fix/<id>.webp",
      "sha256": "…", "width": 800, "height": 600, "bytes": 81234 }
  ]
}
```

**Caller workflow:** exactly the snippet in ENGINEERING.md §14, also stored as `templates/pr-meme.yml`.

To add an image, commit a WebP or GIF (longest side at most 800 px) at its `path` and add its entry; `sha256`, `width`, `height` and `bytes` describe the committed file. IDs match `[A-Za-z0-9_-]+`. `test/memes.test.ts` checks every entry against its file and fails on files missing from the manifest.

**Uptime targets** (`uptime/targets.json`): `[{ "name": "dashboard-builder", "url": "https://…/api/health", "expect": { "status": 200, "bodyIncludes": "ok" } }]`. Targets use HTTPS and exclude credentials, query strings and fragments. Optional `headersFromEnv` maps `apikey`, `authorization` or `x-*` header names to uppercase repository-variable names; values are resolved only at runtime and never appear in target JSON, URLs, issue bodies or job summaries. See [ADR 0004](adr/0004-initial-uptime-targets.md).

## 8. Data model and storage

No database of its own, but this repository owns the configuration of the shared Supabase project used by every database-backed app:

| Setting | Value |
| --- | --- |
| Project | `portfolio`, reference `fztysvgkmauozxfyscaj`, URL `https://fztysvgkmauozxfyscaj.supabase.co` |
| Region | Paris (`eu-west-3`); apps pin their Vercel Functions to `cdg1` |
| Plan | Free (two active projects per account, paused after a week without activity; the uptime job prevents pausing) |
| Auth: anonymous sign-ins | On (dashboard builder); turn on CAPTCHA protection if abused |
| Auth: GitHub provider | On (agent trace viewer) |
| Auth: redirect allowlist | Production and preview domains of the dashboard builder and the agent trace viewer |
| Extensions | `pg_cron`, `pg_net`, `vector` |
| Storage buckets | `trace-payloads` (private, agent trace viewer) |

Changes to these settings are recorded in `supabase/PROJECT.md` (date, setting, reason), because the dashboard keeps no history.

`supabase/bootstrap.sql` (idempotent, run once by Georges in the Supabase SQL editor) creates for each database-backed app:

| App | Schemas | Role | Extensions |
| --- | --- | --- | --- |
| dashboard-builder | `dash`, `dash_demo` | `dash_app` (read-write on `dash`), `dash_reader` (read-only on `dash_demo`) | `pg_cron` |
| durable-workflow-engine | `wf` | `wf_app` | `pg_cron`, `pg_net` |
| agent-trace-viewer | `traces` | `traces_app` | — |
| rag-inspector | `rag` | `rag_app` | `vector` |
| oauth-oidc-server | `oauth` | `oauth_app` | — |

Each role gets `USAGE` and `CREATE` on its schema only, default privileges on future tables in it, and no access to other app schemas. Passwords are set afterwards with `ALTER ROLE … PASSWORD` typed in the SQL editor, never committed.

## 9. Development plan

| Milestone | Stack of PRs | Acceptance criteria |
| --- | --- | --- |
| M0 Scaffold | repo tooling (pnpm, Biome, Vitest, esbuild), `ci.yml`, templates folder | CI green on an empty action; templates match ENGINEERING.md |
| M1 Selection core | type parser; pool fallback; FNV-1a choice | Unit and property tests pass (§10) |
| M2 Action | manifest fetch; comment idempotency; skip rules; bundle + stale-dist check | Action posts once on a dogfood PR, skips on re-run, skips with `no-meme` |
| M3 Drive sync (removed, [ADR 0005](adr/0005-remove-drive-sync.md)) | Drive listing and diff; image processing; commit step | 90 images imported and committed once; the sync tooling was then removed |
| M4 Release | `v1.0.0` tag, moving `v1` tag in `release.yml`; caller added to two project repos | Memes appear on PRs in two other repositories within one minute |
| M5 Database bootstrap | `bootstrap.sql` with sections per app; a check script that lists privileges; `PROJECT.md` with the current Auth and extension settings | Each app role can create tables in its schema and cannot read another app's schema |
| M6 Uptime | `targets.json`, checker, issue open/close logic, schedule every six hours | A failing target opens one issue; recovery closes it |

## 10. Testing strategy

- **Unit:** title parsing (types, scopes, `!`, malformed titles → `general`), pool fallback order, deterministic index, manifest validation (zod), skip rules, marker detection.
- **Property (fast-check):** the same input always yields the same image; every chosen image belongs to the computed pool; the pool is never empty when the manifest is not.
- **Integration:** the action's `main()` against a recorded `pull_request` event payload with the GitHub API mocked by `msw` (create, already-commented, paginated comments, API error).
- **Uptime:** target parsing and header preflight, bounded probes, issue lifecycle reconciliation, and the six-hour workflow configuration.
- **Workflow checks:** `actionlint`; dist freshness (`pnpm build && git diff --exit-code actions/pr-meme/dist`).
- **End-to-end:** dogfood (this repository's PRs) and a manual check on a sandbox repository after each release.
- Coverage: `select.ts`, `comment.ts` and `manifest.ts` at least 95%.

## 11. CI/CD

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | PRs, pushes to `main` | `lint`, `typecheck`, `test`, `build` (includes dist freshness), `actionlint` |
| `uptime.yml` | Every six hours, `workflow_dispatch` | `check` with `issues: write` |
| `pr-meme.yml` | PRs opened or reopened | Uses `./actions/pr-meme` from the PR branch (dogfood) |
| `release.yml` | Tags `v1.*.*` | Moves the `v1` tag to the release commit, creates a GitHub Release |

Required checks: `lint`, `typecheck`, `test`, `build`, `actionlint`.

## 12. Deployment and configuration

No Vercel project. Configuration lives in this repository's settings:

| Name | Kind | Value |
| --- | --- | --- |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | Public key used only for the health RPC target |

**One-time setup (Georges)**
1. After M4, tag `v1.0.0`; add the caller workflow to each project repository.
2. Run `supabase/bootstrap.sql` in the `portfolio` project (created 2026-10-04 in Paris) and set each role's password; apply the Auth settings in §8 and record them in `supabase/PROJECT.md`.
3. Set `SUPABASE_PUBLISHABLE_KEY` to the project's public key before running the uptime workflow.

**Smoke checks:** a new PR in any project repository gets a meme comment within one minute.

## 13. Performance, security and observability

- Action runtime under 10 s; the manifest is cached by GitHub's CDN.
- The action requests only `pull-requests: write`; it never reads repository contents.
- The action accepts only manifest paths of the form `memes/images/<category>/<id>.<webp|gif>`, so a manifest cannot point outside the pool.
- Each run writes a job summary (image chosen, or skip reason).

## 14. Risks and open questions

- Raw GitHub URLs can be rate-limited for very high traffic; irrelevant at this volume. Fallback: GitHub Pages for `memes/`.
- Images become public (see §6). Open question: is a separate "private only" category needed? Default: no.
- Repository size grows with images; the 800 px cap keeps a few hundred images well under 100 MB.

## 15. Definition of done

- [ ] Memes appear on PRs in at least two project repositories; none on fork PRs.
- [ ] A newly committed image is selectable on the next PR.
- [ ] Bootstrap script applied; each app role verified isolated.
- [ ] Uptime workflow green, alert issue tested once.
- [ ] README with a screenshot of a meme comment and the setup steps.
