import { readFileSync } from "node:fs";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import {
  githubApi,
  parseRepositories,
  syncAll,
  syncRepository,
} from "../sync.ts";

const repository = "adam-riffi/demo";
const base = `https://api.github.com/repos/${repository}`;
const template = "# Engineering standards\n\nThe newest rule.\n";
// GitHub wraps base64 file content at 60 characters.
const encode = (text: string) =>
  Buffer.from(text)
    .toString("base64")
    .replace(/(.{60})/g, "$1\n");

type Write = { kind: string; body: unknown };
type State = {
  onMain: string | null;
  onBranch: string | null;
  openPr: boolean;
  writes: Write[];
};

function serve(state: State) {
  const record =
    (kind: string) =>
    async ({ request }: { request: Request }) => {
      state.writes.push({ kind, body: await request.json() });
      if (kind === "create" || kind === "reset") state.onBranch = state.onMain;
      return HttpResponse.json({ number: 8 }, { status: 201 });
    };
  server.use(
    http.get(base, ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer test-token");
      return HttpResponse.json({ default_branch: "main" });
    }),
    http.get(`${base}/contents/docs/ENGINEERING.md`, ({ request }) => {
      const ref = new URL(request.url).searchParams.get("ref");
      const text = ref === "main" ? state.onMain : state.onBranch;
      return text === null
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json({ sha: `${ref}-sha`, content: encode(text) });
    }),
    http.get(`${base}/git/ref/heads/main`, () =>
      HttpResponse.json({ object: { sha: "main-head" } }),
    ),
    http.get(`${base}/git/ref/heads/standards-sync`, () =>
      state.onBranch === null
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json({ object: { sha: "old-head" } }),
    ),
    http.post(`${base}/git/refs`, record("create")),
    http.patch(`${base}/git/refs/heads/standards-sync`, record("reset")),
    http.put(`${base}/contents/docs/ENGINEERING.md`, record("commit")),
    http.get(`${base}/pulls`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect([query.get("head"), query.get("state")]).toEqual([
        "adam-riffi:standards-sync",
        "open",
      ]);
      return HttpResponse.json(state.openPr ? [{ number: 7 }] : []);
    }),
    http.post(`${base}/pulls`, record("pr")),
  );
}

const commit = (sha?: string) => ({
  kind: "commit",
  body: {
    message: "docs(standards): sync ENGINEERING.md from portfolio-infra",
    content: Buffer.from(template).toString("base64"),
    branch: "standards-sync",
    ...(sha ? { sha } : {}),
  },
});
const pr = {
  kind: "pr",
  body: {
    title: "docs(standards): sync ENGINEERING.md from portfolio-infra",
    head: "standards-sync",
    base: "main",
    body: expect.stringContaining("templates/ENGINEERING.md"),
  },
};
const state = (patch: Partial<State>): State => ({
  onMain: "old",
  onBranch: null,
  openPr: false,
  writes: [],
  ...patch,
});
const api = () => githubApi("test-token");

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("leaves a repository whose copy matches alone", async () => {
  const s = state({ onMain: template });
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("in-sync");
  expect(s.writes).toEqual([]);
});

test("opens a PR from a new branch when the copy is stale", async () => {
  const s = state({});
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("opened");
  expect(s.writes).toEqual([
    {
      kind: "create",
      body: { ref: "refs/heads/standards-sync", sha: "main-head" },
    },
    commit("main-sha"),
    pr,
  ]);
});

test("resets a stale sync branch and keeps its open PR", async () => {
  const s = state({ onBranch: "older", openPr: true });
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("updated");
  expect(s.writes).toEqual([
    { kind: "reset", body: { sha: "main-head", force: true } },
    commit("main-sha"),
  ]);
});

test("writes nothing while the open PR already carries the template", async () => {
  const s = state({ onBranch: template, openPr: true });
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("pending");
  expect(s.writes).toEqual([]);
});

test("opens a new PR when the current branch's PR was closed", async () => {
  const s = state({ onBranch: template });
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("opened");
  expect(s.writes).toEqual([pr]);
});

test("creates the copy when the repository has none", async () => {
  const s = state({ onMain: null });
  serve(s);
  expect(await syncRepository(api(), repository, template)).toBe("opened");
  expect(s.writes).toEqual([
    {
      kind: "create",
      body: { ref: "refs/heads/standards-sync", sha: "main-head" },
    },
    commit(),
    pr,
  ]);
});

test("reports a failing repository without its response or the token, then continues", async () => {
  serve(state({ onMain: template }));
  server.use(
    http.get("https://api.github.com/repos/adam-riffi/broken", () =>
      HttpResponse.json(
        { message: "secret detail" },
        {
          status: 403,
          headers: { "x-accepted-github-permissions": "contents=read" },
        },
      ),
    ),
  );
  const results = await syncAll(
    api(),
    ["adam-riffi/broken", repository],
    template,
  );
  expect(results).toEqual([
    {
      repository: "adam-riffi/broken",
      error:
        "GitHub GET /repos/adam-riffi/broken failed (HTTP 403; needs contents=read)",
    },
    { repository, outcome: "in-sync" },
  ]);
  expect(JSON.stringify(results)).not.toMatch(/secret|test-token/);
});

test("validates the repository list, including the committed one", () => {
  expect(
    parseRepositories(JSON.parse(readFileSync("standards/repos.json", "utf8"))),
  ).toContain("adam-riffi/gacha-hub");
  expect(() => parseRepositories(["adam-riffi/portfolio-infra"])).toThrow();
  expect(() => parseRepositories(["someone/else"])).toThrow();
  expect(() => parseRepositories(["adam-riffi/a", "adam-riffi/a"])).toThrow();
  expect(() => parseRepositories([])).toThrow();
});

test("requires a token", () => {
  expect(() => githubApi("")).toThrow("STANDARDS_SYNC_TOKEN");
});
