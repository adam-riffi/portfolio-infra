import { expect, test } from "vitest";
import { skipReason } from "../src/skip.ts";

const pr = {
  repository: "adam-riffi/portfolio-infra",
  owner: "adam-riffi",
  headRepository: "adam-riffi/portfolio-infra",
  author: "georges",
  labels: [] as string[],
};
test("allows an ordinary same-repository PR", () => {
  expect(skipReason(pr, ["no-meme"], ["dependabot[bot]"])).toBeUndefined();
});
test("skips fork repositories and fork PRs, including deleted head repositories", () => {
  expect(skipReason({ ...pr, owner: "other" }, [], [])).toBe(
    "repository-owner",
  );
  expect(skipReason({ ...pr, headRepository: "other/fork" }, [], [])).toBe(
    "fork",
  );
  expect(skipReason({ ...pr, headRepository: null }, [], [])).toBe("fork");
});
test("matches configured labels and authors case-insensitively", () => {
  expect(
    skipReason({ ...pr, labels: ["bug", "NO-MEME"] }, ["no-meme"], []),
  ).toBe("label:NO-MEME");
  expect(
    skipReason({ ...pr, author: "Dependabot[bot]" }, [], ["dependabot[bot]"]),
  ).toBe("author:Dependabot[bot]");
  expect(
    skipReason(
      { ...pr, labels: ["bug"], author: "human" },
      ["no-meme"],
      ["dependabot[bot]"],
    ),
  ).toBeUndefined();
});
