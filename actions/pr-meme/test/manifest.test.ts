import { expect, test, vi } from "vitest";
import { fetchManifest, parseManifest } from "../src/manifest.ts";

import { image, manifest } from "./fixtures.ts";

test("validates a version-one manifest and allows an empty image pool", () => {
  expect(parseManifest(manifest)).toEqual(manifest);
  expect(parseManifest({ ...manifest, images: [] }).images).toEqual([]);
});

test.each([
  { version: 2 },
  { generatedAt: "yesterday" },
  { images: null },
  { images: [image, image] },
  ...[
    { id: "../escape" },
    { category: "unknown" },
    { path: "https://evil.test/image.webp" },
    { path: "memes/images/fix/../drive_id.webp" },
    { path: "memes/images/docs/drive_id.webp" },
    { path: "memes/images/fix/other.webp" },
    { sha256: "not a checksum" },
    { width: 0 },
    { height: 1.5 },
    { bytes: -1 },
  ].map((fields) => ({ images: [{ ...image, ...fields }] })),
])("rejects invalid or unsafe manifest fields %j", (fields) => {
  expect(() => parseManifest({ ...manifest, ...fields })).toThrow();
});

test("fetches with a deadline and validates the response", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(manifest));
  expect(
    await fetchManifest("https://example.test/manifest.json", request),
  ).toEqual(manifest);
  expect(request).toHaveBeenCalledWith("https://example.test/manifest.json", {
    signal: expect.any(AbortSignal),
  });
});

test.each([400, 404, 503])(
  "rejects HTTP %i without trusting the body",
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("failure", { status }));
    await expect(
      fetchManifest("https://example.test/manifest.json", request),
    ).rejects.toThrow(`HTTP ${status}`);
  },
);

test("rejects invalid JSON, invalid schema, excessive size and unsafe URLs", async () => {
  for (const response of [
    new Response("not JSON"),
    Response.json({ version: 2 }),
    new Response(" ".repeat(1_048_577)),
  ]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      fetchManifest("https://example.test/manifest.json", request),
    ).rejects.toThrow();
  }
  const request = vi.fn<typeof fetch>();
  await expect(fetchManifest("file:///secret", request)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

test("propagates connection and timeout failures to the fail-open runner", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("connection failed"));
  await expect(
    fetchManifest("https://example.test/manifest.json", request),
  ).rejects.toThrow("connection failed");
});
