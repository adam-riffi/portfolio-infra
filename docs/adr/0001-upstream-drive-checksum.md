# 0001 — Preserve upstream Drive checksums

- Status: Superseded by 0005
- Date: 2026-10-05
- Proposed by: codex; decided by: Georges

## Context

The sync design compares Drive MD5 checksums but the manifest only stores the
SHA-256 of re-encoded image bytes. Those values cannot identify unchanged input.

## Decision

Add optional `driveMd5` to version-one image entries. Existing manifests remain
valid; the first sync downloads entries without upstream metadata once. Renames
with the same ID/checksum need no download because output filenames are IDs.
Category moves require a download to generate the new safe path.

## Alternatives considered

A separate sync-state file duplicates IDs and complicates atomic updates.
Redownloading every file breaks the no-op acceptance criterion and wastes bandwidth.

## Consequences

Selection ignores the optional field. Stable serialization keeps `generatedAt`
unchanged on no-op syncs. The processed SHA-256 continues to verify hosted bytes.
