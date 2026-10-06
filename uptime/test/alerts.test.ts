import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { githubIssues, reconcileAlerts } from "../alerts.ts";

const endpoint =
  "https://api.github.com/repos/adam-riffi/portfolio-infra/issues";
const target = {
  name: "demo",
  url: "https://example.test/health",
  expect: { status: 200, bodyIncludes: "ok" },
};
const failed = { name: "demo", ok: false, reason: "HTTP 503" };
const bot = { login: "github-actions[bot]", type: "Bot" };
const marker = "<!-- uptime:v1 name=demo -->";
const issue = (number: number) => ({
  number,
  body: `${marker}\nDetails`,
  user: bot,
});
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("opens once across failures, then closes on recovery through GitHub HTTP", async () => {
  const opened: ReturnType<typeof issue>[] = [];
  let creates = 0;
  server.use(
    http.get(endpoint, ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer secret");
      expect(new URL(request.url).searchParams.get("state")).toBe("open");
      return HttpResponse.json(opened);
    }),
    http.post(endpoint, async ({ request }) => {
      expect(await request.json()).toEqual({
        title: "[uptime] demo unavailable",
        body: `${marker}\n\nTarget: https://example.test/health\n\nCheck failed: HTTP 503\n\nThis issue closes automatically after recovery.`,
      });
      creates++;
      opened.push(issue(42));
      return HttpResponse.json({ number: 42 }, { status: 201 });
    }),
    http.patch(`${endpoint}/42`, async ({ request }) => {
      expect(await request.json()).toEqual({
        state: "closed",
        state_reason: "completed",
      });
      opened.splice(0);
      return HttpResponse.json({ number: 42 });
    }),
  );
  const client = githubIssues("secret");
  expect(await reconcileAlerts([target], [failed], client)).toEqual({
    opened: 1,
    closed: 0,
  });
  expect(await reconcileAlerts([target], [failed], client)).toEqual({
    opened: 0,
    closed: 0,
  });
  expect(creates).toBe(1);
  expect(
    await reconcileAlerts([target], [{ name: "demo", ok: true }], client),
  ).toEqual({ opened: 0, closed: 1 });
  expect(
    await reconcileAlerts([target], [{ name: "demo", ok: true }], client),
  ).toEqual({ opened: 0, closed: 0 });
});

test("paginates before creating and ignores PRs, human issues and partial markers", async () => {
  const unrelated = [
    { ...issue(1), pull_request: {} },
    { ...issue(2), user: { login: "human", type: "User" } },
    { ...issue(3), body: `${marker}suffix` },
    { ...issue(4), body: null },
    { ...issue(5), user: null },
    { ...issue(6), user: { login: "other-bot", type: "Bot" } },
  ];
  const create = vi.fn();
  const close = vi.fn();
  const list = vi
    .fn()
    .mockResolvedValueOnce([
      ...unrelated,
      ...Array.from({ length: 94 }, (_, i) => ({
        ...issue(i + 7),
        body: "other",
      })),
    ])
    .mockResolvedValueOnce([issue(101), issue(102)]);
  expect(
    await reconcileAlerts([target], [failed], { list, create, close }),
  ).toEqual({ opened: 0, closed: 1 });
  expect(list.mock.calls).toEqual([[1], [2]]);
  expect(create).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(102);
});

test("closes all matching duplicates on recovery without touching other targets", async () => {
  const close = vi.fn();
  const list = vi
    .fn()
    .mockResolvedValue([
      issue(1),
      issue(2),
      { ...issue(3), body: "<!-- uptime:v1 name=other -->\n" },
    ]);
  expect(
    await reconcileAlerts([target], [{ name: "demo", ok: true }], {
      list,
      create: vi.fn(),
      close,
    }),
  ).toEqual({ opened: 0, closed: 2 });
  expect(close.mock.calls).toEqual([[1], [2]]);
});

test("never mutates when configuration or a complete issue listing is unavailable", async () => {
  const create = vi.fn();
  const close = vi.fn();
  for (const list of [
    vi.fn().mockRejectedValue(new Error("read failed")),
    vi
      .fn()
      .mockResolvedValue(Array.from({ length: 100 }, (_, i) => issue(i + 1))),
  ]) {
    await expect(
      reconcileAlerts([target], [failed], { list, create, close }),
    ).rejects.toThrow();
  }
  for (const results of [
    [],
    [failed, failed],
    [{ ...failed, name: "unknown" }],
  ]) {
    await expect(
      reconcileAlerts([target], results, { list: vi.fn(), create, close }),
    ).rejects.toThrow("Results must match targets");
  }
  expect(create).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("GitHub API rejects malformed responses, errors and unsafe redirects", async () => {
  for (const response of [
    Response.json({ error: "secret" }, { status: 403 }),
    Response.json([{ number: "bad" }]),
    new Response("bad json"),
  ]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(githubIssues("secret", request).list(1)).rejects.toThrow();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining(endpoint),
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  }
  expect(() => githubIssues("")).toThrow("GitHub token required");
});
