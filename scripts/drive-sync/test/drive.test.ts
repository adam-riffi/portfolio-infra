import { expect, test, vi } from "vitest";
import { downloadImage, listImages } from "../src/drive.ts";

const folder = (id: string, name: string) => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.folder",
});
const image = (id: string) => ({
  id,
  name: "untrusted name.png",
  mimeType: "image/png",
  md5Checksum: "a".repeat(32),
  modifiedTime: "2026-10-05T00:00:00Z",
  size: "10",
  parents: ["root"],
});
test("walks folders and pages, inheriting top-level categories and ignoring non-images", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const parsed = new URL(String(url));
    const parent = parsed.searchParams.get("q");
    if (parent?.includes("'root'")) {
      if (parsed.searchParams.has("pageToken"))
        return Response.json({
          files: [
            image("root-image"),
            { id: "text", name: "text", mimeType: "text/plain" },
          ],
        });
      return Response.json({
        files: [folder("fix-folder", "fix"), folder("other-folder", "other")],
        nextPageToken: "next",
      });
    }
    if (parent?.includes("'fix-folder'"))
      return Response.json({
        files: [folder("nested", "deep"), image("fix-image")],
      });
    if (parent?.includes("'nested'"))
      return Response.json({ files: [image("nested-image")] });
    return Response.json({ files: [image("general-image")] });
  });
  const files = await listImages("root", "fake-token", request);
  expect(files.map(({ id, category }) => ({ id, category }))).toEqual([
    { id: "root-image", category: "general" },
    { id: "fix-image", category: "fix" },
    { id: "general-image", category: "general" },
    { id: "nested-image", category: "fix" },
  ]);
  expect(
    request.mock.calls.every(
      ([, options]) =>
        new Headers(options?.headers).get("authorization") ===
        "Bearer fake-token",
    ),
  ).toBe(true);
});
test("rejects malformed listings and incomplete searches without treating them as deletions", async () => {
  for (const value of [
    { files: [{ ...image("bad"), id: "../escape" }] },
    { incompleteSearch: true, files: [] },
    { files: [{ ...image("bad"), md5Checksum: undefined }] },
  ]) {
    await expect(
      listImages(
        "root",
        "token",
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)),
      ),
    ).rejects.toThrow();
  }
});
test("rejects failed HTTP and unsafe folder IDs", async () => {
  await expect(
    listImages(
      "root",
      "token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 })),
    ),
  ).rejects.toThrow("HTTP 403");
  await expect(listImages("bad'query", "token")).rejects.toThrow();
});
test("downloads with alt=media, bounds the byte stream, and refuses unsafe IDs", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  expect(await downloadImage("safe-id", "token", request)).toEqual(
    Buffer.from([1, 2, 3]),
  );
  expect(String(request.mock.calls[0]?.[0])).toContain("/safe-id?alt=media");
  request.mockResolvedValue(new Response(new Uint8Array(10_000_001)));
  await expect(downloadImage("safe-id", "token", request)).rejects.toThrow(
    "too large",
  );
  await expect(downloadImage("../escape", "token", request)).rejects.toThrow();
  request.mockResolvedValue(new Response(null));
  await expect(downloadImage("safe-id", "token", request)).rejects.toThrow();
});
