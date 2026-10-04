# portfolio-infra

Shared GitHub Actions automation for the portfolio: PR memes, database bootstrap,
uptime checks and repository templates.

[![CI](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml/badge.svg)](https://github.com/adam-riffi/portfolio-infra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

M0 establishes the tooling and CI. The action entry point is intentionally empty.
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
measure. The empty entry point and generated bundle are excluded from coverage.

- `actions/pr-meme/`: empty source, bundle and smoke test.
- `scripts/build.ts`: esbuild configuration.
- `templates/`: shared repository standards and PR template.
- `.github/workflows/ci.yml`: required lint, typecheck, test, build and actionlint checks.

This is one private package. M1 adds selection logic; M2 supplies action metadata,
GitHub integration and dogfooding. Drive sync, database bootstrap and uptime follow
in later milestones. This repository runs on GitHub Actions only.

## License

[MIT](LICENSE).
