# Handoff — 2026-10-07

This file records the state after completing portfolio-infra through M8 (v1.1) and removing the Google Drive sync. It contains no credentials; repository variables and secrets remain in GitHub settings.

## Completed

- **M3 Drive assets:** imported 90 images from the configured Google Drive folder into the manifest through the production sync path. A second production sync was a no-op. The sync was later removed ([ADR 0005](docs/adr/0005-remove-drive-sync.md)); the 90 committed images are the fixed pool, and `GDRIVE_FOLDER_ID` was deleted from the repository variables.
- **M4 release and callers:** released `v1.0.0`, moved the supported `v1` action tag, and verified real meme comments from `@adam-riffi/portfolio-infra/pr-meme@v1` in [gacha-hub PR #80](https://github.com/adam-riffi/gacha-hub/pull/80) and [dashboard-builder PR #25](https://github.com/adam-riffi/dashboard-builder/pull/25).
- **M5 health bridge:** merged [PR #19](https://github.com/adam-riffi/portfolio-infra/pull/19) and applied its reviewed migration to Supabase project `fztysvgkmauozxfyscaj`. It creates the invoker-safe `public.portfolio_health()` RPC and configures the private `trace-payloads` bucket.
- **M7 recent images (v1.1):** [PR #28](https://github.com/adam-riffi/portfolio-infra/pull/28) skips images from a repository's last 10 meme PRs ([ADR 0006](docs/adr/0006-avoid-recent-memes.md)). Released as `v1.1.0`; the `v1` tag now points at it.
- **M8 standards sync (v1.1):** [PR #29](https://github.com/adam-riffi/portfolio-infra/pull/29) adds `standards-sync.yml`, which copies `templates/ENGINEERING.md` to the repositories in `standards/repos.json` through `standards-sync` PRs, using the `STANDARDS_SYNC_TOKEN` secret. Its first runs read both repositories but could not create the branch: `POST …/git/refs failed (HTTP 403; needs contents=write)`, because the token has Contents read-only ([#30](https://github.com/adam-riffi/portfolio-infra/pull/30) made the error name the permission).
- **Callers and fixes:** the meme caller was added to [kanri #21](https://github.com/adam-riffi/kanri/pull/21) and [wuxing #6](https://github.com/adam-riffi/wuxing/pull/6); [dashboard-builder #30](https://github.com/adam-riffi/dashboard-builder/pull/30) pinned an empty `search_path` on `dash_demo.tick()`; the README shows a real meme comment ([#27](https://github.com/adam-riffi/portfolio-infra/pull/27)).
- **M6 uptime:** merged the checker ([PR #17](https://github.com/adam-riffi/portfolio-infra/pull/17)), issue reconciliation ([PR #21](https://github.com/adam-riffi/portfolio-infra/pull/21)), and six-hour runner ([PR #22](https://github.com/adam-riffi/portfolio-infra/pull/22)). The repository Actions variable required by the Supabase target is configured.

## Verified

- The M5 migration was checked in the live project: `portfolio_health()` is invoker-safe, `STABLE`, has an empty `search_path`, is executable only by `anon` and `authenticated`, and returns `ok` as `anon`. `trace-payloads` exists and is private.
- The final exact-head CI runs were green, including the disposable Supabase Postgres integration: [#19 CI](https://github.com/adam-riffi/portfolio-infra/actions/runs/37511402035) and [#22 CI](https://github.com/adam-riffi/portfolio-infra/actions/runs/37512770937). Each had an independent non-approving review before merge.
- The first manual run of the production uptime workflow passed: [run 37513081666](https://github.com/adam-riffi/portfolio-infra/actions/runs/37513081666). It reported `0 opened, 0 closed`.
- A controlled lifecycle test passed end to end: [run 37513871140](https://github.com/adam-riffi/portfolio-infra/actions/runs/37513871140) used a temporary invalid public key and opened exactly one managed issue ([#24](https://github.com/adam-riffi/portfolio-infra/issues/24)); after the configured key was restored, [run 37514011635](https://github.com/adam-riffi/portfolio-infra/actions/runs/37514011635) closed that same issue. No managed outage issue remains open.
- The M6 scheduler branch passed `pnpm check`: 156 tests, lint, typecheck, build freshness, and actionlint. The checker and alerts slices also passed their full CI before merge.
- The post-migration Supabase advisor output contains only pre-existing findings in `dash`, `dash_demo`, `cron`, and Auth; it reports no finding for the new health RPC or storage bucket.
- 2026-10-07: the recent-image read works with a caller's `pull-requests: write` token (#28's dogfood run logged `avoided 7 recent`). After the dashboard-builder deploy, `dash_demo.tick` has `search_path=""`, the tick job still succeeds every minute, and the advisor no longer reports `function_search_path_mutable`.

## Next goals

1. Give `STANDARDS_SYNC_TOKEN` **Contents: Read and write** and **Pull requests: Read and write** (editing the token keeps its value, so the secret stays), then run `standards-sync` from the Actions tab. It should open one PR each in gacha-hub and dashboard-builder; merge them.
2. Turn on the Supabase GitHub provider when agent-trace-viewer exists: create its GitHub OAuth app, enter the client ID and secret in the dashboard, add its exact production and preview redirect domains, and record them in `supabase/PROJECT.md`. Email sign-in and the `*.vercel.app` wildcard were removed on 2026-10-06.
3. Add category folders under `memes/images/` (for example `fix/`, `feat/`) once there are enough images for each; every PR draws from `general` today.

The remaining advisor warnings are accepted: the `cron` anonymous-access policies are pg_cron's own, and leaked-password protection is moot while no password sign-in is enabled.

## Remaining test work
- Re-run the Supabase security advisor after the GitHub provider is configured. The 2026-10-07 run showed only the accepted warnings above.

## Operational notes

- The uptime workflow runs every six hours and on manual dispatch, only for `adam-riffi/portfolio-infra` on `main`. It uses a repository variable for the Supabase publishable key and never stores that value in `uptime/targets.json` or issues. GitHub Actions can display repository-variable values in step environment logs, so the key is public configuration rather than an authorization secret.
- The live endpoints currently monitored are the Gacha Hub homepage and `public.portfolio_health()` through Supabase REST.
- To add a repository to the standards sync, list it in `standards/repos.json` and give the token access to it; the merge triggers a sync.
- To add a meme, commit a WebP or GIF under `memes/images/<category>/` and its manifest entry by hand (DESIGN.md §7).
- Keep PR work stacked on the current `main`; all completed M5/M6 PRs were squash-merged.
