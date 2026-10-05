import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, test } from "vitest";
import { processImage } from "../src/process.ts";

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
