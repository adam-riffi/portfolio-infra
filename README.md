# portfolio-infra

Shared GitHub Actions automation for the portfolio: PR memes, database bootstrap,
uptime checks and repository templates.

[![CI](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml/badge.svg)](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

M0–M2 are implemented: tooling, deterministic selection and the fail-open Node 24
action. Drive sync, release, database bootstrap and uptime follow.
Drive synchronization now runs daily or on demand; configure it using
[the setup guide](scripts/drive-sync/README.md). Missing cloud configuration is
reported as a workflow failure, and dry runs make no writes.
The [design](docs/DESIGN.md) defines subsequent milestones and architecture;
[engineering standards](docs/ENGINEERING.md) define the delivery workflow.

## Meme selection

The pure core in `actions/pr-meme/src/select.ts` parses Conventional Commit titles
case-insensitively, including scopes and breaking-change markers. Unknown or
malformed titles use `general`.

Selection prefers the matching category, then `general`, then all images. It sorts
the pool by image ID and uses the unsigned FNV-1a hash of `repository#PR number`
modulo the pool size. Reordering a manifest with unique Drive IDs preserves the
choice, and selection leaves the input untouched. An empty manifest returns no image.

## Running locally

Install the Node version in `.nvmrc`, pnpm at the version in `packageManager`, and
[actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) on PATH.
Then run `pnpm install --frozen-lockfile` and `pnpm check`.

`pnpm check` runs Biome, TypeScript, Vitest, an esbuild rebuild with committed-bundle
verification, and actionlint. Use `pnpm format` to apply formatting and lint fixes.
After changing action source, run `pnpm build` and commit `actions/pr-meme/dist`.
All commands are listed in [AGENTS.md](AGENTS.md).

## Testing and layout

The bundle smoke test executes the real build, then runs the output in an isolated
directory without credentials or runtime dependencies. Coverage is configured for
80% overall and 95% per file in the designated core. Unit tests cover title parsing,
fallback pools and known FNV-1a vectors. Seeded property tests run 500 cases each
for pool availability, deterministic membership and manifest reordering. The empty
entry point and generated bundle are excluded from coverage.

- `actions/pr-meme/`: selection core, bundle, unit tests and smoke test.
- `scripts/build.ts`: esbuild configuration.
- `templates/`: shared standards, PR template, Dependabot configuration and meme caller.
- `.github/workflows/ci.yml`: required lint, typecheck, test, build and actionlint checks.

This is one private package. The action validates events and public manifests,
scans paginated comments for its marker and applies label, author and fork skips.
Runs report the chosen image or skip reason in their job summary. Drive sync, database bootstrap and uptime follow
in later milestones. This repository runs on GitHub Actions only.

## Using the templates

Copy `templates/ENGINEERING.md` to `docs/ENGINEERING.md`, and copy
`templates/pull_request_template.md` and `templates/dependabot.yml` into `.github/`.
The Dependabot template groups weekly npm/pnpm and GitHub Actions updates; other
language repositories should adapt its package ecosystem to their manifests.
After M4 publishes `v1`, copy `templates/pr-meme.yml` to `.github/workflows/` in
portfolio repositories. It matches ENGINEERING.md section 14 exactly, needs no
secrets, and guards against execution in forks or for fork PRs.

Template tests enforce copy parity, the exact documented caller and weekly grouped
updates. `pnpm lint:workflows` checks both active workflows and the caller template.

## License

[MIT](LICENSE).
