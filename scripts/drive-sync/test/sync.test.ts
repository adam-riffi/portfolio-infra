import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, expect, test, vi } from "vitest";
import type { DriveImage } from "../src/drive.ts";
import { syncDrive } from "../src/sync.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "portfolio-sync-test-"));
  roots.push(root);
  await mkdir(join(root, "memes"));
  await writeFile(
    join(root, "memes/manifest.json"),
    `${JSON.stringify({ version: 1, generatedAt: "2026-10-05T00:00:00Z", images: [] }, null, 2)}\n`,
  );
  const bytes = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const file: DriveImage = {
    id: "id",
    name: "evil../name.png",
    category: "fix",
    md5Checksum: createHash("md5").update(bytes).digest("hex"),
    mimeType: "image/png",
    size: bytes.length,
    modifiedTime: "2026-10-05T00:00:00Z",
  };
  const client = {
    list: vi.fn().mockResolvedValue([file]),
    download: vi.fn().mockResolvedValue(bytes),
  };
  return { root, bytes, file, client };
}
test("imports images and a second unchanged run produces no byte or timestamp changes", async () => {
  const { root, client } = await fixture();
  expect(await syncDrive(root, client, "2026-10-05T01:00:00Z")).toMatchObject({
    changed: true,
    downloads: 1,
    removed: 0,
    warnings: [],
  });
  const original = await readFile(join(root, "memes/manifest.json"), "utf8");
  const output = await readFile(join(root, "memes/images/fix/id.webp"));
  expect(await syncDrive(root, client, "2026-10-05T02:00:00Z")).toMatchObject({
    changed: false,
    downloads: 0,
  });
  expect(await readFile(join(root, "memes/manifest.json"), "utf8")).toBe(
    original,
  );
  expect(await readFile(join(root, "memes/images/fix/id.webp"))).toEqual(
    output,
  );
  expect(client.download).toHaveBeenCalledOnce();
});
test("moves category paths and removes deleted images", async () => {
  const { root, client, file } = await fixture();
  await syncDrive(root, client, "2026-10-05T01:00:00Z");
  client.list.mockResolvedValue([{ ...file, category: "docs" }]);
  expect(await syncDrive(root, client, "2026-10-05T02:00:00Z")).toMatchObject({
    changed: true,
    removed: 1,
  });
  await expect(
    readFile(join(root, "memes/images/fix/id.webp")),
  ).rejects.toThrow();
  expect(
    await readFile(join(root, "memes/images/docs/id.webp")),
  ).toBeInstanceOf(Buffer);
  client.list.mockResolvedValue([]);
  expect(await syncDrive(root, client, "2026-10-05T03:00:00Z")).toMatchObject({
    changed: true,
    removed: 1,
  });
  expect(
    JSON.parse(await readFile(join(root, "memes/manifest.json"), "utf8"))
      .images,
  ).toEqual([]);
});
test("dry-run lists changes without downloading or writing", async () => {
  const { root, client } = await fixture();
  const before = await readFile(join(root, "memes/manifest.json"), "utf8");
  expect(
    await syncDrive(root, client, "2026-10-05T01:00:00Z", true),
  ).toMatchObject({ changed: true, downloads: 1 });
  expect(client.download).not.toHaveBeenCalled();
  expect(await readFile(join(root, "memes/manifest.json"), "utf8")).toBe(
    before,
  );
});
test("preserves last known images on corrupt updates, skips invalid new images and source races", async () => {
  const { root, client, file } = await fixture();
  await syncDrive(root, client, "2026-10-05T01:00:00Z");
  const original = await readFile(join(root, "memes/manifest.json"), "utf8");
  const corrupt = Buffer.from("corrupt");
  const changed = {
    ...file,
    md5Checksum: createHash("md5").update(corrupt).digest("hex"),
  };
  client.list.mockResolvedValue([changed, { ...changed, id: "new" }]);
  client.download.mockResolvedValue(corrupt);
  expect(await syncDrive(root, client, "2026-10-05T02:00:00Z")).toMatchObject({
    changed: false,
    warnings: ["skipped:id", "skipped:new"],
  });
  expect(await readFile(join(root, "memes/manifest.json"), "utf8")).toBe(
    original,
  );
  client.list.mockResolvedValue([
    { ...file, md5Checksum: "a".repeat(32), size: 10_000_001 },
  ]);
  expect(
    (await syncDrive(root, client, "2026-10-05T03:00:00Z")).warnings,
  ).toEqual(["skipped:id"]);
  client.list.mockResolvedValue([{ ...file, md5Checksum: "a".repeat(32) }]);
  expect(
    (await syncDrive(root, client, "2026-10-05T03:00:00Z")).warnings,
  ).toEqual(["skipped:id"]);
});
test("a listing failure never publishes partial changes or deletions", async () => {
  const { root, client } = await fixture();
  await syncDrive(root, client, "2026-10-05T01:00:00Z");
  const original = await readFile(join(root, "memes/manifest.json"), "utf8");
  client.list.mockRejectedValue(new Error("incomplete listing"));
  await expect(syncDrive(root, client, "2026-10-05T02:00:00Z")).rejects.toThrow(
    "incomplete",
  );
  expect(await readFile(join(root, "memes/manifest.json"), "utf8")).toBe(
    original,
  );
});
