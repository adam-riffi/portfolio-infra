import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseManifest } from "../actions/pr-meme/src/manifest.ts";

// The manifest is edited by hand now, and callers fail open on a bad one.
const manifest = parseManifest(
  JSON.parse(readFileSync("memes/manifest.json", "utf8")),
);

test("every manifest entry matches its committed image", () => {
  for (const image of manifest.images) {
    const bytes = readFileSync(image.path);
    expect(bytes.byteLength, image.path).toBe(image.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), image.path).toBe(
      image.sha256,
    );
  }
});

test("every committed image is in the manifest", () => {
  const files = readdirSync("memes/images", {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}`.replaceAll("\\", "/"));
  expect(files.sort()).toEqual(manifest.images.map((i) => i.path).sort());
});
