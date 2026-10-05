import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, test, vi } from "vitest";
import { processImage } from "../src/process.ts";

const animatedGif = Buffer.from(
  "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7",
  "base64",
);
test("preserves small animated GIF bytes and first-frame dimensions", async () => {
  const result = await processImage(animatedGif, "image/gif");
  expect(result).toMatchObject({ extension: "gif", width: 2, height: 2 });
  expect(result.data).toEqual(animatedGif);
  await expect(
    processImage(
      Buffer.concat([animatedGif, Buffer.alloc(5_000_000)]),
      "image/gif",
    ),
  ).rejects.toThrow("too large");
});

test("rejects corrupt later GIF frames before preserving the original bytes", async () => {
  const corrupt = Buffer.from(animatedGif);
  corrupt[105] = 255;
  await expect(processImage(corrupt, "image/gif")).rejects.toThrow();
});
test("re-encodes static GIFs", async () => {
  const source = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .gif()
    .toBuffer();
  expect((await processImage(source, "image/gif")).extension).toBe("webp");
});

test("uses declared height when the image adapter omits optional pageHeight", async () => {
  const metadata = await sharp(animatedGif).metadata();
  const { pageHeight: _pageHeight, ...withoutPageHeight } = metadata;
  const adapter = vi
    .spyOn(sharp.prototype, "metadata")
    .mockResolvedValue(withoutPageHeight);
  try {
    expect((await processImage(animatedGif, "image/gif")).height).toBe(
      metadata.height,
    );
  } finally {
    adapter.mockRestore();
  }
});

test("re-encodes large images to WebP within 800px and records actual output metadata", async () => {
  const source = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const result = await processImage(source, "image/png");
  expect(result.width).toBe(800);
  expect(result.height).toBe(450);
  expect(result.extension).toBe("webp");
  expect(result.sha256).toBe(
    createHash("sha256").update(result.data).digest("hex"),
  );
  expect((await sharp(result.data).metadata()).format).toBe("webp");
});
test("never enlarges a small source", async () => {
  const source = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  expect(await processImage(source, "image/png")).toMatchObject({
    width: 20,
    height: 10,
  });
});
test("rejects oversized, non-image and corrupt inputs before publication", async () => {
  await expect(
    processImage(Buffer.alloc(10_000_001), "image/png"),
  ).rejects.toThrow("too large");
  await expect(processImage(Buffer.from("text"), "text/plain")).rejects.toThrow(
    "MIME",
  );
  await expect(
    processImage(Buffer.from("not an image"), "image/png"),
  ).rejects.toThrow();
});
