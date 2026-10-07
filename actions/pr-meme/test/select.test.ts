import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  fnv1a,
  parseCategory,
  selectImage,
  selectPool,
} from "../src/select.ts";

const images = Object.freeze([
  Object.freeze({ id: "z", category: "fix", path: "z.webp" }),
  Object.freeze({ id: "b", category: "general", path: "b.webp" }),
  Object.freeze({ id: "A", category: "fix", path: "A.webp" }),
  Object.freeze({ id: "a", category: "feat", path: "a.webp" }),
] as const);

describe("fallback pools", () => {
  test("prefers the title category and sorts by ID without changing the input", () => {
    expect(selectPool(images, "fix")).toEqual([images[2], images[0]]);
    expect(images.map((image) => image.id)).toEqual(["z", "b", "A", "a"]);
  });

  test("falls back to general when the category has no images", () => {
    expect(selectPool(images, "docs")).toEqual([images[1]]);
    expect(selectPool(images, "general")).toEqual([images[1]]);
  });

  test("falls back to all images when category and general are empty", () => {
    const withoutGeneral = images.filter(
      (image) => image.category !== "general",
    );
    expect(selectPool(withoutGeneral, "docs").map((image) => image.id)).toEqual(
      ["A", "a", "z"],
    );
    expect(selectPool(withoutGeneral, "general")).toEqual(
      selectPool(withoutGeneral, "docs"),
    );
  });

  test("returns an empty pool for an empty manifest", () => {
    expect(selectPool([], "fix")).toEqual([]);
  });

  test("preserves every entry when the input repeats an image", () => {
    expect(selectPool([images[0], images[2], images[0]], "fix")).toEqual([
      images[2],
      images[0],
      images[0],
    ]);
  });
});

describe("32-bit FNV-1a", () => {
  test.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
    ["hello", 0x4f9f2cab],
  ])("matches the known vector %j", (input, expected) => {
    expect(fnv1a(input)).toBe(expected);
  });

  test("matches an independent integer reference including UTF-8 bytes", () => {
    for (const input of [
      "adam-riffi/portfolio-infra#123",
      "café 🐈",
      "x".repeat(500),
    ]) {
      let reference = 2166136261n;
      for (const byte of Buffer.from(input, "utf8")) {
        reference = ((reference ^ BigInt(byte)) * 16777619n) & 0xffffffffn;
      }
      expect(fnv1a(input)).toBe(Number(reference));
    }
  });
});

describe("avoiding recent images", () => {
  test("skips an image used recently while the pool has another", () => {
    // Without exclusion owner/repo#42 picks A from [A, z] (see below).
    expect(
      selectImage(images, "fix: retry", "owner/repo", 42, new Set(["A"])),
    ).toBe(images[0]);
  });

  test("repeats an image when every image in the pool was used recently", () => {
    expect(
      selectImage(images, "fix: retry", "owner/repo", 42, new Set(["A", "z"])),
    ).toBe(images[2]);
  });
});

describe("deterministic image selection", () => {
  test("hashes the exact repository#number key and indexes the sorted pool", () => {
    // FNV-1a('owner/repo#42') = 0xf5505e64, index 0 in a two-image pool.
    expect(selectImage(images, "FIX(api)!: retry", "owner/repo", 42)).toBe(
      images[2],
    );
  });

  test.each([
    ["owner/repo", 42, "6"],
    ["owner/repo", 43, "4"],
    ["another/repo", 42, "0"],
  ])(
    "uses both repository %s and PR %i in the selection key",
    (repo, number, id) => {
      const pool = ["6", "5", "4", "3", "2", "1", "0"].map((id) => ({
        id,
        category: "fix",
      }));
      expect(selectImage(pool, "fix: retry", repo, number)?.id).toBe(id);
    },
  );

  test("uses general for malformed titles and returns the full image record", () => {
    const image = selectImage(
      images,
      "not a conventional title",
      "owner/repo",
      42,
    );
    expect(image).toBe(images[1]);
    expect(image?.path).toBe("b.webp");
  });

  test("returns undefined for an empty manifest", () => {
    expect(selectImage([], "fix: retry", "owner/repo", 1)).toBeUndefined();
  });

  test("returns the only image for any repository or PR number", () => {
    expect(
      selectImage([images[0]], "docs: describe", "another/repo", 100),
    ).toBe(images[0]);
  });
});

const imageArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  category: fc.constantFrom("feat", "fix", "general", "docs"),
});
const manifestArbitrary = fc.uniqueArray(imageArbitrary, {
  selector: (image) => image.id,
  minLength: 1,
  maxLength: 50,
});
const categoryArbitrary = fc.constantFrom(
  ...(["feat", "fix", "general", "docs", "ci"] as const),
);
const propertyOptions = { seed: 20261005, numRuns: 500 };

test("every nonempty manifest produces a nonempty pool with the correct fallback", () => {
  fc.assert(
    fc.property(manifestArbitrary, categoryArbitrary, (manifest, category) => {
      const pool = selectPool(manifest, category);
      const matched = manifest.filter((image) => image.category === category);
      const general = manifest.filter((image) => image.category === "general");
      const expected = matched.length
        ? matched
        : general.length
          ? general
          : manifest;
      expect(pool.length).toBeGreaterThan(0);
      expect(new Set(pool)).toEqual(new Set(expected));
    }),
    propertyOptions,
  );
});

test("repeated choices are identical and belong to the computed pool", () => {
  fc.assert(
    fc.property(
      manifestArbitrary,
      categoryArbitrary,
      fc.string(),
      fc.integer({ min: 1, max: 1_000_000 }),
      (manifest, category, repository, number) => {
        const title = `${category}: update`;
        const chosen = selectImage(manifest, title, repository, number);
        expect(chosen).toBe(selectImage(manifest, title, repository, number));
        expect(selectPool(manifest, category)).toContain(chosen);
      },
    ),
    propertyOptions,
  );
});

test("reordering the manifest preserves the choice and leaves inputs unchanged", () => {
  const permutations = manifestArbitrary.chain((manifest) =>
    fc.tuple(
      fc.constant(manifest),
      fc.shuffledSubarray(manifest, {
        minLength: manifest.length,
        maxLength: manifest.length,
      }),
    ),
  );
  fc.assert(
    fc.property(
      permutations,
      categoryArbitrary,
      ([original, reordered], category) => {
        const before = structuredClone(reordered);
        const title = `${category}: update`;
        expect(selectImage(reordered, title, "owner/repo", 42)).toBe(
          selectImage(original, title, "owner/repo", 42),
        );
        expect(reordered).toEqual(before);
      },
    ),
    propertyOptions,
  );
});

test("never repeats a recent image while the pool has a fresh one", () => {
  fc.assert(
    fc.property(
      manifestArbitrary,
      categoryArbitrary,
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 20 }),
      fc.integer({ min: 1, max: 1_000_000 }),
      (manifest, category, recentIds, number) => {
        const title = `${category}: update`;
        const recent = new Set([
          ...recentIds,
          ...manifest.slice(0, 3).map((image) => image.id),
        ]);
        const pool = selectPool(manifest, parseCategory(title));
        const chosen = selectImage(
          manifest,
          title,
          "owner/repo",
          number,
          recent,
        );
        expect(pool).toContain(chosen);
        if (pool.some((image) => !recent.has(image.id)))
          expect(recent.has(chosen?.id ?? "")).toBe(false);
      },
    ),
    propertyOptions,
  );
});
