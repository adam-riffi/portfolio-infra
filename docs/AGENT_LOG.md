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

## 2026-10-05 · codex · stack/m3/02-drive-images · pending
- Done: Planned recursive paginated Drive listing and bounded real image processing.
- Tests: Will use a fake Drive HTTP client and real sharp fixtures for resize/GIF/size limits.
- Scope/decisions: M3; sharp is the specified image adapter.
- Next: Transactional sync and WIF workflow follow.

## 2026-10-05 · codex · stack/m3/01-diff · #10
- Done: Implemented ID/checksum/category diffing and canonical manifests with no-op timestamps.
- Tests: Red ab30487 precedes implementation; added/changed/removed/renamed/moved tests and a 500-case seeded partition property.
- Scope/decisions: M3; proposed ADR0001 adds optional upstream driveMd5 without changing manifest version.
- Next: Drive listing and real image processing follow.

## 2026-10-05 · codex · stack/m3/01-diff · pending
- Done: Planned Drive ID/checksum diffing and stable manifest serialization.
- Tests: Test-first added/changed/removed/category move/rename/no-op cases and seeded diff invariants.
- Scope/decisions: M3; propose optional upstream Drive checksum metadata because the design only stores processed SHA-256.
- Next: Implement, review, then Drive listing and image processing.

## 2026-10-05 · codex · stack/m2/03-runtime · #9
- Done: Implemented the Node 24 action, validated HTTP orchestration, fail-open outputs/summaries and guarded serialized dogfooding.
- Tests: Red f81ad44 precedes implementation; MSW exercises posting/re-run, pages, skips and API failures. Bundle smoke verifies unsupported-event exit without dependencies.
- Scope/decisions: M2; TypeScript DOM types are required by MSW 3. No design changes.
- Next: Merge the reviewed M2 stack, exercise dogfood once an image exists, then Drive sync.

## 2026-10-05 · codex · stack/m2/03-runtime · pending
- Done: Planned the Node 24 action entry point, HTTP adapter and guarded dogfood workflow.
- Tests: Will test real main orchestration with MSW for create, re-run, pagination, no-meme, fork and API errors.
- Scope/decisions: M2; toolkit is platform glue, core remains hand-written.
- Next: Review and merge M2, then Drive sync.

## 2026-10-05 · codex · stack/m2/02-comments · #8
- Done: Implemented paginated marker detection, safe comment formatting and fork/label/author skips.
- Tests: Red 63a970d precedes implementation; full checks pass.
- Scope/decisions: M2 only; no new dependencies.
- Next: Review, then GitHub adapter and dogfood workflow.

## 2026-10-05 · codex · stack/m2/02-comments · pending
- Done: Planned idempotent comment creation and explicit fork, label and author skip rules.
- Tests: Will commit failing unit tests before implementation and run the full suite.
- Scope/decisions: M2 pure comment and skip core; no added dependencies.
- Next: GitHub HTTP adapter and entry point follow in the third PR.

## 2026-10-05 · codex · stack/m2/01-manifest · pending
- Done: Implemented strict manifest validation, safe image paths and bounded-time HTTPS fetching.
- Tests: Test-first commit 60bf387; 81 tests and 100% core coverage.
- Scope/decisions: M2; zod is specified boundary validation; @actions/core is platform glue, msw is test tooling.
- Next: Review and merge, then implement comment idempotency and skip rules.

## 2026-10-05 · codex · stack/m1/02-image-selection · #5, #6
- Done: Completed M1 title parsing, category → general → all fallback, stable ID sorting and unsigned FNV-1a choice. Both PRs received independent reviews with no findings; #5 is merged and #6 is restacked onto main with an identical implementation tree.
- Tests: Red commit `0895bb9` (restacked as `de01129`) has 19 expected missing-function failures. `pnpm check` passes 60 tests, including three seeded 500-case properties, with 100% selection-core coverage. Original PR heads passed all five CI checks; the restacked head is rechecked before merge.
- Scope/decisions: M1 only; no dependencies or design changes. Checked [GitHub runtime metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax): Node 24 is the newest documented action runtime, matching the bundle target; M2 will set `runs.using: node24`.
- Next: M2 supplies manifest validation/fetching, GitHub integration and dogfooding. Dependency PRs #3 and #4 are separate maintenance work; #4 proposes Node 26 types while the runtime is pinned to Node 24.

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
