import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { runAction } from "../src/run.ts";
import { manifest } from "./fixtures.ts";

const url = "https://example.test/manifest.json";
const commentsUrl =
  "https://api.github.com/repos/adam-riffi/portfolio-infra/issues/42/comments";
const config = {
  eventName: "pull_request",
  token: "test-token",
  manifestUrl: url,
  skipLabels: ["no-meme"],
  skipAuthors: ["dependabot[bot]"],
  width: 360,
};
const event = {
  repository: {
    full_name: "adam-riffi/portfolio-infra",
    owner: { login: "adam-riffi" },
  },
  pull_request: {
    number: 42,
    title: "fix: retry",
    user: { login: "human" },
    labels: [],
    head: { repo: { full_name: "adam-riffi/portfolio-infra" } },
  },
};
const server = setupServer(http.get(url, () => HttpResponse.json(manifest)));
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("posts once and skips a rerun with an existing marker", async () => {
  const comments: { body: string }[] = [];
  server.use(
    http.get(commentsUrl, ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer test-token");
      expect(new URL(request.url).searchParams.get("per_page")).toBe("100");
      return HttpResponse.json(comments);
    }),
    http.post(commentsUrl, async ({ request }) => {
      const payload = await request.json();
      expect(payload).toMatchObject({
        body: expect.stringContaining("<!-- pr-meme:v1 id=drive_id -->"),
      });
      comments.push({ body: "<!-- pr-meme:v1 id=drive_id -->" });
      return HttpResponse.json({ id: 123 }, { status: 201 });
    }),
  );
  expect(await runAction(config, event)).toEqual({ imageId: "drive_id" });
  expect(await runAction(config, event)).toEqual({
    skippedReason: "already-commented",
  });
  expect(comments).toHaveLength(1);
});
test("recognizes the marker on a second page", async () => {
  server.use(
    http.get(commentsUrl, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("page") === "1"
          ? Array.from({ length: 100 }, () => ({ body: "normal" }))
          : [{ body: "<!-- pr-meme:v1 id=old -->" }],
      ),
    ),
  );
  expect(await runAction(config, event)).toEqual({
    skippedReason: "already-commented",
  });
});
test("skips unsupported events, no-meme, authors and forks before making requests", async () => {
  expect(await runAction({ ...config, eventName: "push" }, null)).toEqual({
    skippedReason: "event",
  });
  expect(
    await runAction(config, {
      ...event,
      pull_request: { ...event.pull_request, labels: [{ name: "no-meme" }] },
    }),
  ).toEqual({ skippedReason: "label:no-meme" });
  expect(
    await runAction(config, {
      ...event,
      pull_request: {
        ...event.pull_request,
        user: { login: "dependabot[bot]" },
      },
    }),
  ).toEqual({ skippedReason: "author:dependabot[bot]" });
  expect(
    await runAction(config, {
      ...event,
      pull_request: { ...event.pull_request, head: { repo: null } },
    }),
  ).toEqual({ skippedReason: "fork" });
});
test("fails open on malformed event and invalid configuration", async () => {
  expect(await runAction(config, {})).toEqual({
    skippedReason: "error",
    warning: true,
  });
  expect(await runAction({ ...config, width: 0 }, event)).toEqual({
    skippedReason: "error",
    warning: true,
  });
  expect(await runAction({ ...config, token: "" }, event)).toEqual({
    skippedReason: "error",
    warning: true,
  });
});
test("warns and skips on empty or unreachable manifests", async () => {
  server.use(
    http.get(url, () => HttpResponse.json({ ...manifest, images: [] })),
  );
  expect(await runAction(config, event)).toEqual({
    skippedReason: "manifest-empty",
    warning: true,
  });
  server.use(http.get(url, () => HttpResponse.error()));
  expect(await runAction(config, event)).toEqual({
    skippedReason: "error",
    warning: true,
  });
});
test.each([403, 500])(
  "never posts if the GitHub read returns HTTP %i",
  async (status) => {
    server.use(http.get(commentsUrl, () => new HttpResponse(null, { status })));
    expect(await runAction(config, event)).toEqual({
      skippedReason: "error",
      warning: true,
    });
  },
);
test("fails open on invalid GitHub response and post errors", async () => {
  server.use(
    http.get(commentsUrl, () => HttpResponse.json({ unexpected: true })),
  );
  expect(await runAction(config, event)).toEqual({
    skippedReason: "error",
    warning: true,
  });
  server.use(
    http.get(commentsUrl, () => HttpResponse.json([])),
    http.post(commentsUrl, () => new HttpResponse(null, { status: 500 })),
  );
  expect(await runAction(config, event)).toEqual({
    skippedReason: "error",
    warning: true,
  });
});
