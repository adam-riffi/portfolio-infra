# portfolio-infra

Shared GitHub Actions automation for the portfolio: PR memes, database bootstrap,
uptime checks and repository templates.

[![CI](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml/badge.svg)](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

M0 establishes the tooling and CI; M1 adds the selection core. The action entry
point remains empty until M2 integrates it with GitHub.
The [design](docs/DESIGN.md) defines subsequent milestones and architecture;
[engineering standards](docs/ENGINEERING.md) define the delivery workflow.

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
80% overall and 95% per file in the designated core; M0 has no executable core to
measure. M1 tests Conventional Commit title parsing against valid categories and
malformed input. The empty entry point and generated bundle are excluded from coverage.

- `actions/pr-meme/`: selection core, bundle, unit tests and smoke test.
- `scripts/build.ts`: esbuild configuration.
- `templates/`: shared standards, PR template, Dependabot configuration and meme caller.
- `.github/workflows/ci.yml`: required lint, typecheck, test, build and actionlint checks.

This is one private package. M1 completes selection logic; M2 supplies action metadata,
GitHub integration and dogfooding. Drive sync, database bootstrap and uptime follow
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
