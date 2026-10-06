import { expect, test, vi } from "vitest";
import { checkTarget, parseTargets, requestHeaders } from "../check.ts";

const target = {
  name: "portfolio-db",
  url: "https://example.test/health",
  expect: { status: 200, bodyIncludes: "ok" },
};

test("validates targets and resolves credentials separately", () => {
  expect(parseTargets([target])).toEqual([target]);
  const secured = { ...target, headersFromEnv: { apikey: "PUBLIC_KEY" } };
  expect(requestHeaders(parseTargets([secured])[0]!, { PUBLIC_KEY: "key" })).toEqual({ apikey: "key" });
  expect(requestHeaders(target, {})).toEqual({});
  for (const env of [{}, { PUBLIC_KEY: "" }, { PUBLIC_KEY: "a\nb" }]) {
    expect(() => requestHeaders(secured, env)).toThrow("Invalid uptime header configuration");
  }
});

test.each([
  [], [target, target], [{ ...target, name: "bad name" }],
  [{ ...target, url: "http://example.test" }],
  [{ ...target, url: "https://user:secret@example.test" }],
  [{ ...target, url: "https://example.test?token=secret" }],
  [{ ...target, expect: { status: 0, bodyIncludes: "ok" } }],
  [{ ...target, expect: { status: 200, bodyIncludes: "" } }],
  [{ ...target, headersFromEnv: { apikey: "literal-key" } }],
  [{ ...target, headersFromEnv: { Host: "HOST" } }],
  [{ ...target, headersFromEnv: { "bad\nheader": "KEY" } }],
  [{ ...target, unknown: true }],
])("rejects malformed or unsafe target configuration %j", (value) => {
  expect(() => parseTargets(value)).toThrow();
});

test("matches status and streamed body with a deadline and no redirects", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("looks ok"));
  expect(await checkTarget(target, { apikey: "secret" }, request)).toEqual({ name: target.name, ok: true });
  expect(request).toHaveBeenCalledWith(target.url, {
    headers: { apikey: "secret" }, redirect: "error", signal: expect.any(AbortSignal),
  });
});

test("matches across chunk boundaries and supports non-200 expectations", async () => {
  const stream = new ReadableStream({ start(controller) {
    for (const text of ["healthy: o", "k"]) controller.enqueue(new TextEncoder().encode(text));
    controller.close();
  } });
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 503 }));
  expect(await checkTarget({ ...target, expect: { ...target.expect, status: 503 } }, {}, request)).toEqual({ name: target.name, ok: true });
});

test("returns sanitized reasons for status, missing body, network and stream failures", async () => {
  for (const [response, reason] of [
    [new Response("secret", { status: 500 }), "HTTP 500"],
    [new Response("secret"), "Expected text missing"],
    [new Response(null), "Expected text missing"],
    [new Response(new ReadableStream({ start(controller) { controller.error(new Error("secret")); } })), "Request failed or timed out"],
  ] as const) {
    expect(await checkTarget(target, {}, vi.fn<typeof fetch>().mockResolvedValue(response))).toEqual({ name: target.name, ok: false, reason });
  }
  expect(await checkTarget(target, {}, vi.fn<typeof fetch>().mockRejectedValue(new Error("secret")))).toEqual({ name: target.name, ok: false, reason: "Request failed or timed out" });
});

test("cancels mismatching status and oversized bodies", async () => {
  for (const status of [200, 500]) {
    const cancel = vi.fn();
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(524_288)); }, cancel });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status }));
    expect((await checkTarget(target, {}, request)).reason).toBe(status === 500 ? "HTTP 500" : "Response too large");
    expect(cancel).toHaveBeenCalledOnce();
  }
});

test("aborts a stalled request at the supplied deadline", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("private request detail")));
  }));
  expect(await checkTarget(target, {}, request, 5)).toEqual({ name: target.name, ok: false, reason: "Request failed or timed out" });
});
