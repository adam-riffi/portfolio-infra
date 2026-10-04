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
