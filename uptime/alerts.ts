import { z } from "zod";
import { type CheckResult, parseTargets, type Target } from "./check.ts";

const issuesEndpoint =
  "https://api.github.com/repos/adam-riffi/portfolio-infra/issues";
const pageSize = 100;
const maximumPages = 10;
const requestTimeoutMs = 10_000;

const issueSchema = z
  .object({
    number: z.number().int().positive(),
    body: z.string().nullable().optional(),
    user: z
      .object({ login: z.string().min(1), type: z.string().min(1) })
      .nullable()
      .optional(),
    pull_request: z.unknown().optional(),
  })
  .passthrough();

type Issue = z.infer<typeof issueSchema>;

export type GitHubIssues = {
  list(page: number): Promise<Issue[]>;
  create(target: Target, result: CheckResult): Promise<number>;
  close(number: number): Promise<void>;
};

export type AlertReconciliation = { opened: number; closed: number };

function marker(name: string): string {
  return `<!-- uptime:v1 name=${name} -->`;
}

function safeFailureReason(reason: string | undefined): string {
  if (
    reason === "Expected text missing" ||
    reason === "Response too large" ||
    reason === "Request failed or timed out" ||
    /^HTTP [1-5]\d\d$/.test(reason ?? "")
  ) {
    return reason as string;
  }
  return "Check failed";
}

function validToken(token: string): boolean {
  return (
    token.length > 0 &&
    token.length <= 8192 &&
    ![...token].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}

function parseIssue(value: unknown): Issue {
  const parsed = issueSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid GitHub issue response");
  return parsed.data;
}

/** Build an opaque, redirect-safe client for this repository's Issues API. */
export function githubIssues(
  token: string,
  request: typeof fetch = fetch,
): GitHubIssues {
  if (!validToken(token)) throw new Error("GitHub token required");

  const json = async (url: string, init: RequestInit): Promise<unknown> => {
    let response: Response;
    try {
      response = await request(url, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new Error("GitHub issue request failed");
    }
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // The HTTP status is enough; never expose a remote response body.
      }
      throw new Error("GitHub issue request failed");
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Invalid GitHub issue response");
    }
  };

  return {
    async list(page) {
      if (!Number.isSafeInteger(page) || page < 1)
        throw new Error("Invalid issue page");
      const url = new URL(issuesEndpoint);
      url.searchParams.set("state", "open");
      url.searchParams.set("per_page", String(pageSize));
      url.searchParams.set("page", String(page));
      const value = await json(url.toString(), { method: "GET" });
      const parsed = z.array(z.unknown()).max(pageSize).safeParse(value);
      if (!parsed.success) throw new Error("Invalid GitHub issue response");
      return parsed.data.map(parseIssue);
    },

    async create(target, result) {
      const value = await json(issuesEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `[uptime] ${target.name} unavailable`,
          body: `${marker(target.name)}\n\nTarget: ${target.url}\n\nCheck failed: ${safeFailureReason(result.reason)}\n\nThis issue closes automatically after recovery.`,
        }),
      });
      return parseIssue(value).number;
    },

    async close(number) {
      if (!Number.isSafeInteger(number) || number < 1)
        throw new Error("Invalid issue number");
      const value = await json(`${issuesEndpoint}/${number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
      parseIssue(value);
    },
  };
}

function isManagedIssue(issue: Issue): boolean {
  return (
    !Object.hasOwn(issue, "pull_request") &&
    issue.user?.login === "github-actions[bot]" &&
    issue.user.type === "Bot"
  );
}

function hasMarker(issue: Issue, name: string): boolean {
  return (
    typeof issue.body === "string" &&
    issue.body.split(/\r?\n/).includes(marker(name))
  );
}

function validateResults(
  targets: Target[],
  results: CheckResult[],
): Map<string, CheckResult> {
  if (results.length !== targets.length)
    throw new Error("Results must match targets");
  const targetNames = new Set(targets.map((target) => target.name));
  const byName = new Map<string, CheckResult>();
  for (const result of results) {
    if (
      typeof result?.name !== "string" ||
      typeof result.ok !== "boolean" ||
      !targetNames.has(result.name) ||
      byName.has(result.name)
    ) {
      throw new Error("Results must match targets");
    }
    byName.set(result.name, result);
  }
  if (byName.size !== targetNames.size)
    throw new Error("Results must match targets");
  return byName;
}

function validIssue(value: unknown): value is Issue {
  return issueSchema.safeParse(value).success;
}

async function listAllOpenIssues(client: GitHubIssues): Promise<Issue[]> {
  const byNumber = new Map<number, Issue>();
  for (let page = 1; page <= maximumPages; page++) {
    const issues = await client.list(page);
    if (
      !Array.isArray(issues) ||
      issues.length > pageSize ||
      !issues.every(validIssue)
    ) {
      throw new Error("GitHub issue listing is incomplete");
    }
    for (const issue of issues) byNumber.set(issue.number, issue);
    if (issues.length < pageSize) return [...byNumber.values()];
  }
  throw new Error("GitHub issue listing is incomplete");
}

/**
 * Reconcile only bot-authored, fully marked issues after a complete read of
 * the open issue list. That read-before-write ordering avoids alert mutations
 * when GitHub pagination is unavailable or ambiguous.
 */
export async function reconcileAlerts(
  configuredTargets: Target[],
  results: CheckResult[],
  client: GitHubIssues,
): Promise<AlertReconciliation> {
  const targets = parseTargets(configuredTargets);
  const resultsByName = validateResults(targets, results);
  const issues = await listAllOpenIssues(client);
  const matching = new Map<string, Issue[]>();
  for (const target of targets) matching.set(target.name, []);

  for (const issue of issues) {
    if (!isManagedIssue(issue)) continue;
    const names = targets
      .filter((target) => hasMarker(issue, target.name))
      .map((target) => target.name);
    if (names.length > 1) throw new Error("Ambiguous uptime issue marker");
    const name = names[0];
    if (name) matching.get(name)?.push(issue);
  }

  const toClose = new Set<number>();
  const toOpen: Array<{ target: Target; result: CheckResult }> = [];
  for (const target of targets) {
    const result = resultsByName.get(target.name);
    if (!result) throw new Error("Results must match targets");
    const matchingIssues = (matching.get(target.name) ?? []).toSorted(
      (left, right) => left.number - right.number,
    );
    if (result.ok) {
      for (const issue of matchingIssues) toClose.add(issue.number);
    } else if (matchingIssues.length === 0) {
      toOpen.push({ target, result });
    } else {
      for (const issue of matchingIssues.slice(1)) toClose.add(issue.number);
    }
  }

  for (const number of toClose) await client.close(number);
  for (const { target, result } of toOpen) await client.create(target, result);
  return { opened: toOpen.length, closed: toClose.size };
}
