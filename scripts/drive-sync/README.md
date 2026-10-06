# Drive synchronization

Images under `My Drive/PR` become public files in this repository. Share only that
folder with a service account as Viewer. Give the service account no project roles.
Enable the Drive API and IAM Service Account Credentials API in its Google Cloud
project.

## Keyless setup

Create a Workload Identity pool and GitHub OIDC provider with issuer
`https://token.actions.githubusercontent.com`. Map `google.subject` to
`assertion.sub` and `attribute.repository` to `assertion.repository`. Restrict the
provider condition to `assertion.repository == 'adam-riffi/portfolio-infra'` and
`assertion.ref == 'refs/heads/main'`. Grant that repository principal
`roles/iam.workloadIdentityUser` on the service account. The auth action generates
a short-lived Drive-readonly token; no long-lived key is required.

Set repository variables `GDRIVE_FOLDER_ID`, `GCP_WIF_PROVIDER` (full provider
resource name), and `GCP_SERVICE_ACCOUNT` (email). Run `drive-sync` manually with
`dry-run` first, then normally. A second unchanged run should report `no changes`
and make no commit. Runs execute only on this repository's main branch.

If WIF is not ready, grant the service account `roles/iam.serviceAccountTokenCreator`
on itself (not on the project), securely set `GDRIVE_SA_KEY` to its JSON key, and
leave `GCP_WIF_PROVIDER` unset. The auth action needs this binding to mint the
Drive access token from a key; see its [service-account-key setup](https://github.com/google-github-actions/auth#setup).
This is a fallback; remove the key and self-binding after WIF works. Never paste
tokens or keys into logs, shell history or committed files.

## Local operation

Set `GDRIVE_FOLDER_ID` and a short-lived `GOOGLE_OAUTH_ACCESS_TOKEN` in the process
environment. `pnpm sync --dry-run` lists changes without downloading or writing;
`pnpm sync` imports. The access token must have the Drive readonly scope.

Recognized top-level type folders become categories. Descendants inherit that
category; other folders and root images are general. User filenames never become
output paths. Renames without content changes require no download. Category and
format changes remove obsolete output paths. Corrupt/oversized updates warn and
preserve the last valid version; failed or incomplete listings abort before writes.

Downloads are checked against Drive's source checksum. Images have a 10 MB input
ceiling and a 40-million-pixel decode ceiling; animated GIFs under 5 MB keep their
original bytes after every frame is validated. Other images become WebP at 800 px
maximum. The workflow publishes prepared results as one generated-assets commit.
If branch rules prohibit bot publication, the job fails visibly rather than bypassing them.
