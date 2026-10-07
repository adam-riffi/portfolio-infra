# 0006 — Avoid images from recent PRs

- Status: Accepted
- Date: 2026-10-07
- Proposed by: claude; decided by: Georges

## Context

DESIGN.md §4 lists the v1.1 item "avoid repeating the same image within the last N PRs
of a repository". The pool is 90 images, all `general`, so with plain hashing two PRs
in a row can share a meme.

## Decision

Before choosing, the action reads one page of the repository's newest 100 issue and PR
comments and collects the image IDs of the last 10 distinct meme markers. Those IDs are
removed from the pool, unless that would leave it empty. If the read fails, nothing is
removed. N is a constant (10), not an action input.

## Alternatives considered

Paging through every PR's comments costs a request per PR. An action input for N is
configuration nobody has asked to change.

## Consequences

One extra GitHub request per run, inside the existing 6-second deadline. The choice is
still deterministic for a given repository history. The log line reports how many recent
images were avoided. Callers on `@v1` get it after the `v1.1.0` release.
