# Uptime checks

Targets have a unique slug `name`, HTTPS `url`, and an `expect` object with numeric
`status` and nonempty `bodyIncludes`. A check succeeds only when both match. URLs
cannot contain user information, query strings or fragments.

Optional `headersFromEnv` maps `apikey`, `authorization` or `x-*` headers to
uppercase environment variable names. Resolve every target's headers before
starting checks; missing values are configuration errors. Header values and
response bodies never belong in reports. See [ADR0004](../docs/adr/0004-initial-uptime-targets.md).

Each probe has a ten-second timeout, rejects redirects and stops reading after
one MiB. Failures report only a status code or a fixed diagnostic, without raw
remote errors.

`main.ts` reads the committed `targets.json`, validates every target and resolves
every required header before sending a probe. It then uses the GitHub Actions
`GITHUB_TOKEN` to reconcile the corresponding managed alert issues. The workflow
runs on `main` every six hours and can be dispatched manually. Its database key is
the public repository variable `SUPABASE_PUBLISHABLE_KEY`; values never belong in
the target file, issue bodies, or runner output.
