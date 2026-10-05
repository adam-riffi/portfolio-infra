import { describe, expect, test } from "vitest";
import { parseCategory } from "../src/select.ts";

describe("Conventional Commit title categories", () => {
  test.each([
    "feat",
    "fix",
    "refactor",
    "perf",
    "test",
    "docs",
    "chore",
    "ci",
    "build",
    "revert",
  ])("recognizes %s with optional scope and breaking marker", (category) => {
    for (const suffix of ["", "(pr-meme)", "!", "(pr-meme)!"]) {
      expect(parseCategory(`${category}${suffix}: update behavior`)).toBe(
        category,
      );
      expect(parseCategory(`${category.toUpperCase()}${suffix}: Update`)).toBe(
        category,
      );
    }
  });

  test("preserves descriptions with punctuation and Unicode", () => {
    expect(
      parseCategory("FiX(api/client): handle café: retries (again)!"),
    ).toBe("fix");
    expect(parseCategory("docs:  document the new API")).toBe("docs");
  });

  test.each([
    "",
    "update behavior",
    "feature: update behavior",
    "general: update behavior",
    "fixup: update behavior",
    " fix: leading whitespace",
    "fix : misplaced space",
    "fix:no space",
    "fix:\ttab separator",
    "fix:",
    "fix:   ",
    "fix(): empty scope",
    "fix(api: missing parenthesis",
    "fix((api)): nested scope",
    "fix!(api): misplaced marker",
    "fix!!: repeated marker",
    "fix(api) !: misplaced space",
    "fix(api\nclient): multiline scope",
    "fix: first\nsecond",
    "fix: first\rsecond",
    "fix: description\n",
  ])("uses general for malformed or unknown title %j", (title) => {
    expect(parseCategory(title)).toBe("general");
  });
});
