# 0005 — Remove the Google Drive sync

- Status: Accepted
- Date: 2026-10-06
- Proposed by: Georges; decided by: Georges

## Context

M3 imported 90 images from `My Drive/PR` into `memes/` once. Keeping the sync
running needs a Google Cloud project, a workload identity provider, a service
account and a shared Drive folder, none of which exist. The PR meme action only
reads the committed `memes/manifest.json`; it never talks to Drive.

## Decision

Remove the Drive sync: `scripts/drive-sync/`, `drive-sync.yml`, the `pnpm sync`
script, the `sharp` dependency, the Drive repository variables and the optional
`driveMd5` manifest field. The committed pool is the source of truth.

## Alternatives considered

Finishing the federation setup keeps automatic imports but adds a cloud project to
maintain for a folder that rarely changes. A long-lived service-account key was
already rejected as a default.

## Consequences

No cloud credentials or scheduled sync job remain. New images are added by
committing a file under `memes/images/<category>/<id>.webp|gif` and its manifest
entry by hand. Supersedes [0001](0001-upstream-drive-checksum.md). The schema still
accepts released v1 manifests, since unknown fields are ignored.
