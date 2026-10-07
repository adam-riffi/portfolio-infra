# Handoff — 2026-10-07 · claude

## State
- `main`: the README redesign (this PR) is the last merge, after the handoff procedure (#35). CI green on every check.
- Open PRs in portfolio-infra: none. The standards-sync PRs that #35 opens in gacha-hub and dashboard-builder are merged.
- Released: `v1.1.0`; every caller uses the moving `v1` tag.

## Done this session (2026-10-06 to 07)
- Removed the Google Drive sync; the 90 committed images are a fixed pool with a manifest guard test ([#25](https://github.com/adam-riffi/portfolio-infra/pull/25), ADR 0005).
- v1.1: no image repeats within a repository's last 10 meme PRs ([#28](https://github.com/adam-riffi/portfolio-infra/pull/28), ADR 0006, `v1.1.0`); standards sync of `ENGINEERING.md` ([#29](https://github.com/adam-riffi/portfolio-infra/pull/29), [#30](https://github.com/adam-riffi/portfolio-infra/pull/30)).
- Meme caller added to [kanri #21](https://github.com/adam-riffi/kanri/pull/21) and [wuxing #6](https://github.com/adam-riffi/wuxing/pull/6); `dash_demo.tick` search_path pinned ([dashboard-builder #30](https://github.com/adam-riffi/dashboard-builder/pull/30)).
- Supabase Auth: email sign-in and the `*.vercel.app` redirect wildcard removed; the GitHub provider was turned on, then off again with its OAuth app deleted ([#26](https://github.com/adam-riffi/portfolio-infra/pull/26), [#33](https://github.com/adam-riffi/portfolio-infra/pull/33), [#34](https://github.com/adam-riffi/portfolio-infra/pull/34)).
- Handoff procedure added to the shared standards ([#35](https://github.com/adam-riffi/portfolio-infra/pull/35)); README redesigned with examples, diagrams and stack badges.

## Verified
- The recent-image read works with a caller's `pull-requests: write` token: #28's dogfood run logged `avoided 7 recent`.
- Supabase: only anonymous sign-in is on; `dash_demo.tick` has `search_path=""` and its cron job still succeeds; the advisor shows only accepted warnings (pg_cron's own anonymous-access policies, leaked-password protection).
- Standards sync: first run opened and merged [gacha-hub #81](https://github.com/adam-riffi/gacha-hub/pull/81) and [dashboard-builder #31](https://github.com/adam-riffi/dashboard-builder/pull/31); both copies match the template byte for byte.
- Uptime: the six-hour runs are green.

## Next
1. Meme categories: add folders such as `memes/images/fix/` once there are enough images (commit each file and its manifest entry; `test/memes.test.ts` checks both).
2. When a project needs a sign-in method, set it up from that project, following `supabase/PROJECT.md`.

## Needs from Georges
- Nothing.

## Notes
- `STANDARDS_SYNC_TOKEN` is a fine-grained token with Contents and Pull requests read-write. A new repository needs both a `standards/repos.json` entry and token access.
- The PR bot posts plain pictures by design (captions are a DESIGN.md non-goal). Claude sessions add captioned 360 px memes through the local `pr-meme` skill.
- dashboard-builder has an open M3 stack (#22 to #29) from another session; left untouched.
- Claude Code's permission check may block merges in other repositories; ask Georges for an explicit go-ahead.
- The uptime job only runs on `main` here; its Supabase key is the public `SUPABASE_PUBLISHABLE_KEY` variable.
