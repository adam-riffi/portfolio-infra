import { z } from "zod";

const branch = "standards-sync";
const path = "docs/ENGINEERING.md";
const title = "docs(standards): sync ENGINEERING.md from portfolio-infra";
const body = `Copies \`templates/ENGINEERING.md\` from [adam-riffi/portfolio-infra](https://github.com/adam-riffi/portfolio-infra/blob/main/templates/ENGINEERING.md) unchanged.

Opened by its \`standards-sync\` workflow. Change the template there, not this copy; the next sync would overwrite it.`;

export type Outcome = "in-sync" | "opened" | "updated" | "pending";
export type Result =
  | { repository: string; outcome: Outcome }
  | { repository: string; error: string };
/** A JSON request against api.github.com; resolves null on 404. */
export type Api = (
  method: string,
  route: string,
  payload?: unknown,
) => Promise<unknown>;

const repositoryList = z
  .array(z.string().regex(/^adam-riffi\/[A-Za-z0-9_.-]+$/))
  .min(1)
  .refine(
    (names) => new Set(names).size === names.length,
    "Duplicate repository",
  )
  .refine(
    (names) => !names.includes("adam-riffi/portfolio-infra"),
    "portfolio-infra holds the template",
  );
const repoSchema = z.object({ default_branch: z.string().min(1) });
const fileSchema = z.object({ sha: z.string(), content: z.string() });
const refSchema = z.object({ object: z.object({ sha: z.string() }) });

export function parseRepositories(value: unknown): string[] {
  return repositoryList.parse(value);
}

/** Authenticated api.github.com client; errors carry only the HTTP status. */
export function githubApi(token: string, request: typeof fetch = fetch): Api {
  if (!token) throw new Error("STANDARDS_SYNC_TOKEN required");
  return async (method, route, payload) => {
    const response = await request(`https://api.github.com${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      // GitHub names the permission a fine-grained token lacked; that is not secret.
      const needs = response.headers.get("x-accepted-github-permissions");
      const hint = needs && /^[\w=,; ]+$/.test(needs) ? `; needs ${needs}` : "";
      throw new Error(
        `GitHub ${method} ${route.split("?")[0]} failed (HTTP ${response.status}${hint})`,
      );
    }
    return response.json();
  };
}

const decode = (content: string) =>
  Buffer.from(content, "base64").toString("utf8");

/** Bring one repository's copy in line through a PR from the `standards-sync` branch. */
export async function syncRepository(
  api: Api,
  repository: string,
  template: string,
): Promise<Outcome> {
  const repo = `/repos/${repository}`;
  const { default_branch: base } = repoSchema.parse(await api("GET", repo));
  const read = async (ref: string) => {
    const file = await api("GET", `${repo}/contents/${path}?ref=${ref}`);
    return file === null ? null : fileSchema.parse(file);
  };
  const current = await read(base);
  if (current && decode(current.content) === template) return "in-sync";

  const owner = repository.split("/")[0];
  const open = z
    .array(z.unknown())
    .parse(
      await api("GET", `${repo}/pulls?head=${owner}:${branch}&state=open`),
    );
  const synced = await api("GET", `${repo}/git/ref/heads/${branch}`);
  const onBranch = synced === null ? null : await read(branch);
  if (onBranch && decode(onBranch.content) === template) {
    if (open.length > 0) return "pending";
  } else {
    const head = refSchema.parse(
      await api("GET", `${repo}/git/ref/heads/${base}`),
    ).object.sha;
    // The branch belongs to this job, so it restarts from the base branch every time.
    await (synced === null
      ? api("POST", `${repo}/git/refs`, {
          ref: `refs/heads/${branch}`,
          sha: head,
        })
      : api("PATCH", `${repo}/git/refs/heads/${branch}`, {
          sha: head,
          force: true,
        }));
    await api("PUT", `${repo}/contents/${path}`, {
      message: title,
      content: Buffer.from(template).toString("base64"),
      branch,
      ...(current ? { sha: current.sha } : {}),
    });
    if (open.length > 0) return "updated";
  }
  await api("POST", `${repo}/pulls`, { title, head: branch, base, body });
  return "opened";
}

/** Sync every repository, recording failures instead of stopping at the first one. */
export async function syncAll(
  api: Api,
  repositories: readonly string[],
  template: string,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const repository of repositories) {
    try {
      results.push({
        repository,
        outcome: await syncRepository(api, repository, template),
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.startsWith("GitHub ")
          ? error.message
          : "Sync failed";
      results.push({ repository, error: message });
    }
  }
  return results;
}
