# Agent log

Shared memory for every agent and session in this repository. Newest entry first; at most 40 entries (older ones move to `docs/agent-log/YYYY-MM.md`). Rules: `docs/ENGINEERING.md` §5.

Entry format:

```
## YYYY-MM-DD · <agent> · <branch> · #<PR>
- Done: what changed, in one or two lines.
- Tests: what proves it.
- Scope/decisions: deviations from DESIGN.md, with ADR links.
- Next: the next concrete step, open questions, known issues.
```

---

## 2026-10-05 · codex · stack/m1/02-image-selection · #6
- Done: Added category → general → all fallback, stable ID sorting and unsigned FNV-1a selection by repository#PR number. Empty manifests return no image; input records and order stay untouched.
- Tests: Red commit `0895bb9` has 19 expected missing-function failures. `pnpm check` passes 60 tests, including three seeded 500-case properties, with 100% selection-core coverage.
- Scope/decisions: M1 only; no dependencies or design changes. Checked [GitHub runtime metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax): Node 24 is the newest documented action runtime, matching the bundle target; M2 will set `runs.using: node24`.
- Next: Independent review and CI for #6, then merge #5 and restack/merge #6. M2 supplies manifest validation/fetching, GitHub integration and dogfooding.

## 2026-10-05 · codex · stack/m1/01-title-parser · #5
- Done: Verified M0 is merged with green main CI. Added a pure title parser for all ten categories, case-insensitive types, scopes and breaking markers; malformed titles fall back to general.
- Tests: Red commit `ed5235f` fails because the parser module is absent. `pnpm check` passes 40 tests with 100% selection-core coverage using the pinned toolchain.
- Scope/decisions: M1 only, in two PRs: title parsing, then deterministic pool selection. No dependencies or design changes.
- Next: Independent review and green CI for #5; complete the selection PR, then merge bottom-up.

## 2026-10-05 · codex · stack/m0/02-templates · #1, #2
- Done: Squash-merged scaffold #1 and restacked templates #2 onto main after the user's go-ahead. The restacked tree matches the independently reviewed implementation.
- Tests: Both original PR heads passed all five CI checks with no outstanding review findings. Rechecking the restacked #2 before its squash merge; eight tests cover the scaffold and template contracts.
- Scope/decisions: M0 only; merges proceed bottom-up through GitHub with the required meme comments.
- Next: Finish #2's merge and verify main CI. M1 selection core is the next implementation milestone.

## 2026-10-05 · codex · stack/m0/02-templates · #2
- Done: Added the exact documented meme caller, weekly grouped Dependabot templates and repository configuration, drift checks and copying instructions.
- Tests: Red commit `58ee0ac` has four expected missing-template failures and two passing parity checks. `pnpm check` passes with eight tests, bundle freshness and actionlint for active workflows plus the caller template.
- Scope/decisions: M0 only; `yaml` is test-only tooling. Caller activation remains M4; no design changes.
- Next: Verify all checks, obtain independent review, then hand off #1 and #2 for Georges to merge bottom-up.

## 2026-10-05 · codex · stack/m0/01-scaffold · #1
- Done: Added the pinned TypeScript toolchain, empty action bundle, five required CI checks and local setup documentation. Independent review caught a disabled lint preset; restored recommended rules with a regression test.
- Tests: Red commit `9fe7f6b` demonstrates the missing build; `pnpm check` passes, and a deliberate stale-bundle probe is rejected. All five CI jobs passed on `d764a3f`.
- Scope/decisions: M0 only; one private root package, with development tooling dependencies. No design changes.
- Next: Independent review of #1; complete and test the shared templates in the second PR.

## 2026-10-04 · claude · (none) · (none)
- Done: Repository pack created: DESIGN.md, ENGINEERING.md, AGENTS.md, CLAUDE.md, Copilot instructions, PR template, ADR template.
- Tests: none yet.
- Scope/decisions: stack and hosting as stated in the header of `docs/DESIGN.md`.
- Next: milestone M0 (scaffold) from `docs/DESIGN.md` §9, after the one-time setup in `docs/ENGINEERING.md` §16.
