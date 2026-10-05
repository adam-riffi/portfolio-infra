export interface PullRequest {
  readonly repository: string;
  readonly owner: string;
  readonly headRepository: string | null;
  readonly author: string;
  readonly labels: readonly string[];
}

/** Return the first configured skip reason for a validated pull-request event. */
export function skipReason(
  pr: PullRequest,
  labels: readonly string[],
  authors: readonly string[],
): string | undefined {
  if (pr.owner.toLowerCase() !== "adam-riffi") return "repository-owner";
  if (pr.headRepository !== pr.repository) return "fork";
  const label = pr.labels.find((value) =>
    labels.some((skip) => skip.toLowerCase() === value.toLowerCase()),
  );
  if (label) return `label:${label}`;
  if (authors.some((skip) => skip.toLowerCase() === pr.author.toLowerCase()))
    return `author:${pr.author}`;
  return undefined;
}
