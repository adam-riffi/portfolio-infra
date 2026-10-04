# portfolio-infra — PR meme pipeline, shared database and uptime

> Status: draft v1 · Owner: Georges · Updated: 2026-10-04 · Language: TypeScript (Node) · Hosting: GitHub Actions only (no Vercel project) · Build first: every other repository depends on it.

## 1. Summary

A small public repository holding the automation shared by all portfolio projects:

1. **PR meme pipeline (headline).** Images from the Google Drive folder `My Drive/PR` are synced into this repository; a GitHub Action posts one meme comment on every pull request in every portfolio repository, picking an image that matches the PR type (`feat`, `fix`, …).
2. **Shared database bootstrap.** One SQL script that creates the per-app schemas and roles in the shared Supabase project `portfolio` (Paris), plus ownership of that project's sign-in settings.
3. **Uptime and keep-alive.** A scheduled check of every live demo, which also keeps the Free-plan Supabase project from pausing.
4. **Templates.** The canonical `ENGINEERING.md`, PR template and Dependabot configuration copied into each repository.

## 2. Goals and non-goals

**Goals**
- Zero per-repository secrets: project repositories add one 15-line caller workflow and nothing else.
- Cloning and forking stay seamless: nothing to configure, and nothing runs in forks or on PRs from forks.
- No GitHub App: only the built-in `GITHUB_TOKEN` of each repository, plus keyless Google authentication in this repository.
- Idempotent and deterministic: one meme per PR, the same choice on every re-run.
- Fail open: the action never blocks CI and never fails a workflow because of the image source.

**Non-goals**
- Pinterest integration (replaced by the Drive folder).
- Generating memes with AI, or captions.
- Hosting images anywhere other than this public repository.

## 3. Users and demo story

The user is Georges and his coding agents (Claude Code, Codex, Copilot), which open PRs from his machine under his GitHub identity. The visible behavior: within a minute of an agent opening a PR, a comment with a meme appears. A `fix:` PR gets a "fix" meme when that category exists. Dropping a new image into `My Drive/PR` makes it eligible within 24 hours, or immediately after a manual sync run.

## 4. Scope

**v1 (must)**
- Drive → repository sync with manifest, on a schedule and on demand.
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
  D[Google Drive<br/>My Drive/PR] -- daily sync, keyless auth --> S[drive-sync workflow]
  S -- commit images + manifest.json --> R[(portfolio-infra<br/>memes/)]
  P[Project repo PR opened] --> C[pr-meme caller workflow]
  C --> A[actions/pr-meme@v1]
  A -- fetch manifest.json<br/>raw.githubusercontent.com --> R
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
├── scripts/drive-sync/       # src/, test/ (Node script run by the workflow)
├── memes/                    # generated: images/<category>/<file>, manifest.json
├── supabase/                 # bootstrap.sql, PROJECT.md (settings log)
├── uptime/                   # targets.json, check.ts
├── templates/                # ENGINEERING.md, pull_request_template.md, dependabot.yml, pr-meme caller
├── .github/workflows/        # ci.yml, drive-sync.yml, uptime.yml, pr-meme.yml (dogfood), release.yml
└── docs/                     # DESIGN.md, ENGINEERING.md, AGENT_LOG.md, adr/
```

## 6. Core design decisions

**Image hosting.** Images are committed under `memes/images/<category>/` and referenced through `https://raw.githubusercontent.com/adam-riffi/portfolio-infra/main/memes/images/...`. GitHub proxies images in comments, so they render in public and private repositories alike. Consequence: every image in `My Drive/PR` becomes public. Keep only images you are happy to publish.

**Drive authentication.** Keyless: Google Workload Identity Federation from GitHub Actions (`google-github-actions/auth`) impersonating a service account restricted to this repository. The `PR` folder is shared with the service account's email as Viewer. Fallback if federation is not set up yet: a service-account JSON key in the secret `GDRIVE_SA_KEY` (documented, not default).

**Categories.** Subfolders of `My Drive/PR` named after Conventional Commit types (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`, `revert`) become categories; images directly in `PR` are `general`.

**Selection algorithm** (pure function in `select.ts`):
1. Parse the PR title's Conventional Commit type (case-insensitive, optional scope and `!`).
2. Pool = images in that category; if empty, `general`; if empty, all images.
3. Index = FNV-1a 32-bit hash of `"<repo full name>#<PR number>"` modulo pool size, after sorting the pool by image ID so the choice is stable across manifest regenerations that do not change the pool.

**Comment format.**
```
<!-- pr-meme:v1 id=<image id> -->
<img src="<raw url>" alt="PR meme" width="360">
```
Idempotency: list the PR's comments (paginated); if any comment contains `<!-- pr-meme:v1` the action exits.

**Skip rules** (any one skips, logged with the reason): label `no-meme`; author in `skip-authors` (default `dependabot[bot],renovate[bot]`); manifest unreachable or empty (warning annotation, exit 0); event is not `pull_request`.

**Action runtime.** `runs.using` set to the newest Node runtime GitHub Actions supports at M1 (check the documentation); the bundle is `dist/index.js`, and CI fails if it is stale.

**Sync algorithm** (`scripts/drive-sync`):
1. List files recursively under `GDRIVE_FOLDER_ID` (not trashed, MIME type `image/*`), with `id`, `name`, `parents`, `md5Checksum`, `modifiedTime`, `size`.
2. Diff against `memes/manifest.json` by Drive file ID and checksum.
3. Download new or changed files; re-encode with `sharp` so the longest side is at most 800 px (animated GIFs kept as is when under 5 MB, otherwise skipped with a warning); compute SHA-256, width, height.
4. Delete images removed from Drive.
5. Write `manifest.json` (sorted keys and entries, so unchanged content yields an unchanged file).
6. Commit as `github-actions[bot]` with `chore(memes): sync from Drive [skip ci]` only when something changed.

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
    { "id": "<drive file id>", "category": "fix", "path": "memes/images/fix/<id>.webp",
      "sha256": "…", "width": 800, "height": 600, "bytes": 81234 }
  ]
}
```

**Caller workflow:** exactly the snippet in ENGINEERING.md §14, also stored as `templates/pr-meme.yml`.

**Uptime targets** (`uptime/targets.json`): `[{ "name": "dashboard-builder", "url": "https://…/api/health", "expect": { "status": 200, "bodyIncludes": "ok" } }]`.

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
| M3 Drive sync | Drive listing and diff; image processing; commit step; workflow with federation | Manual run imports the folder; a second run produces no commit |
| M4 Release | `v1.0.0` tag, moving `v1` tag in `release.yml`; caller added to two project repos | Memes appear on PRs in two other repositories within one minute |
| M5 Database bootstrap | `bootstrap.sql` with sections per app; a check script that lists privileges; `PROJECT.md` with the current Auth and extension settings | Each app role can create tables in its schema and cannot read another app's schema |
| M6 Uptime | `targets.json`, checker, issue open/close logic, schedule every six hours | A failing target opens one issue; recovery closes it |

## 10. Testing strategy

- **Unit:** title parsing (types, scopes, `!`, malformed titles → `general`), pool fallback order, deterministic index, manifest validation (zod), skip rules, marker detection, sync diffing (added, changed, removed, renamed).
- **Property (fast-check):** the same input always yields the same image; every chosen image belongs to the computed pool; the pool is never empty when the manifest is not.
- **Integration:** the action's `main()` against a recorded `pull_request` event payload with the GitHub API mocked by `msw` (create, already-commented, paginated comments, API error); the sync script against a fake Drive client returning fixture listings and image bytes.
- **Workflow checks:** `actionlint`; dist freshness (`pnpm build && git diff --exit-code actions/pr-meme/dist`).
- **End-to-end:** dogfood (this repository's PRs) and a manual check on a sandbox repository after each release.
- Coverage: `select.ts`, `comment.ts`, `manifest.ts` and sync diffing at least 95%.

## 11. CI/CD

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | PRs, pushes to `main` | `lint`, `typecheck`, `test`, `build` (includes dist freshness), `actionlint` |
| `drive-sync.yml` | Daily 03:00 UTC, `workflow_dispatch` | `sync` with `contents: write` and `id-token: write` |
| `uptime.yml` | Every six hours, `workflow_dispatch` | `check` with `issues: write` |
| `pr-meme.yml` | PRs opened or reopened | Uses `./actions/pr-meme` from the PR branch (dogfood) |
| `release.yml` | Tags `v1.*.*` | Moves the `v1` tag to the release commit, creates a GitHub Release |

Required checks: `lint`, `typecheck`, `test`, `build`, `actionlint`.

## 12. Deployment and configuration

No Vercel project. Configuration lives in this repository's settings:

| Name | Kind | Value |
| --- | --- | --- |
| `GDRIVE_FOLDER_ID` | Variable | ID from the `My Drive/PR` folder URL |
| `GCP_WIF_PROVIDER` | Variable | Full resource name of the workload identity provider |
| `GCP_SERVICE_ACCOUNT` | Variable | Service account email |
| `GDRIVE_SA_KEY` | Secret (fallback only) | Service account JSON key |

**One-time setup (Georges)**
1. Google Cloud: create a project, enable the Drive API, create a service account with no project roles.
2. Create a workload identity pool and GitHub provider whose attribute condition restricts `assertion.repository` to `adam-riffi/portfolio-infra`; grant the pool principal `roles/iam.workloadIdentityUser` on the service account.
3. In Drive, share `My Drive/PR` with the service account email as Viewer.
4. Set the repository variables above; run `drive-sync` manually once.
5. After M4, tag `v1.0.0`; add the caller workflow to each project repository.
6. Run `supabase/bootstrap.sql` in the `portfolio` project (created 2026-10-04 in Paris) and set each role's password; apply the Auth settings in §8 and record them in `supabase/PROJECT.md`.

**Smoke checks:** a new PR in any project repository gets a meme comment within one minute; `drive-sync` run log shows "no changes" on an unchanged folder.

## 13. Performance, security and observability

- Action runtime under 10 s; the manifest is cached by GitHub's CDN.
- The action requests only `pull-requests: write`; it never reads repository contents.
- Federation is restricted to this repository; the service account can read only what is shared with it.
- Sync rejects files over 10 MB and non-image MIME types; filenames in the repository are Drive IDs, never user-supplied names.
- Each run writes a job summary (image chosen, or skip reason).

## 14. Risks and open questions

- Raw GitHub URLs can be rate-limited for very high traffic; irrelevant at this volume. Fallback: GitHub Pages for `memes/`.
- Images become public (see §6). Open question: is a separate "private only" category needed? Default: no.
- Repository size grows with images; the 800 px cap keeps a few hundred images well under 100 MB.

## 15. Definition of done

- [ ] Memes appear on PRs in at least two project repositories; none on fork PRs.
- [ ] A new Drive image is live after one manual sync.
- [ ] Bootstrap script applied; each app role verified isolated.
- [ ] Uptime workflow green, alert issue tested once.
- [ ] README with a screenshot of a meme comment and the setup steps.
