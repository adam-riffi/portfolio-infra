import fc from "fast-check";
import { expect, test } from "vitest";
import { image, manifest } from "../../../actions/pr-meme/test/fixtures.ts";
import { diffFiles, stableManifest } from "../src/diff.ts";

const file = {
  id: "drive_id",
  name: "original.jpg",
  category: "fix" as const,
  md5Checksum: "b".repeat(32),
};
const previous = [{ ...image, driveMd5: file.md5Checksum }];
test("identifies additions, content changes and removals by Drive ID", () => {
  expect(diffFiles([], [file])).toEqual({
    download: [file],
    keep: [],
    remove: [],
  });
  expect(diffFiles(previous, [])).toEqual({
    download: [],
    keep: [],
    remove: previous,
  });
  const changed = { ...file, md5Checksum: "c".repeat(32) };
  expect(diffFiles(previous, [changed])).toEqual({
    download: [changed],
    keep: [],
    remove: [],
  });
});
test("keeps renamed files without redownloading and downloads category moves", () => {
  expect(diffFiles(previous, [{ ...file, name: "renamed.png" }])).toEqual({
    download: [],
    keep: previous,
    remove: [],
  });
  const moved = { ...file, category: "docs" as const };
  expect(diffFiles(previous, [moved]).download).toEqual([moved]);
});
test("imports existing version-one entries without upstream checksum once", () => {
  expect(diffFiles([image], [file]).download).toEqual([file]);
});
test("refuses ambiguous duplicate Drive IDs", () => {
  expect(() => diffFiles(previous, [file, file])).toThrow("duplicate");
});
test("preserves timestamps and bytes on no-op and sorts changed entries", () => {
  expect(
    stableManifest(
      { ...manifest, images: previous },
      previous,
      "2027-01-01T00:00:00Z",
    ),
  ).toBe(`${JSON.stringify({ ...manifest, images: previous }, null, 2)}\n`);
  const unchanged = stableManifest(manifest, [image], "2027-01-01T00:00:00Z");
  expect(unchanged).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  const another = {
    ...image,
    id: "another",
    path: "memes/images/fix/another.webp",
  };
  const result = JSON.parse(
    stableManifest(manifest, [image, another], "2027-01-01T00:00:00Z"),
  );
  expect(result.generatedAt).toBe("2027-01-01T00:00:00Z");
  expect(result.images.map((value: { id: string }) => value.id)).toEqual([
    "another",
    "drive_id",
  ]);
  expect(
    stableManifest(manifest, [another, image], "2027-01-01T00:00:00Z"),
  ).toBe(stableManifest(manifest, [image, another], "2027-01-01T00:00:00Z"));
});
test("diff partitions every unique input and never removes a present ID", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(
        fc.record({
          id: fc.string({ minLength: 1 }),
          name: fc.string(),
          category: fc.constant("fix" as const),
          md5Checksum: fc.constant(file.md5Checksum),
        }),
        { selector: (value) => value.id },
      ),
      (files) => {
        const result = diffFiles(previous, files);
        expect(result.download.length + result.keep.length).toBe(files.length);
        expect(
          result.remove.every((removed) =>
            files.every((current) => current.id !== removed.id),
          ),
        ).toBe(true);
      },
    ),
    { seed: 20261005, numRuns: 500 },
  );
});
