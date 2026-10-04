import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

const read = (path: string): string =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

test.each([
  ["templates/ENGINEERING.md", "docs/ENGINEERING.md"],
  ["templates/pull_request_template.md", ".github/pull_request_template.md"],
  ["templates/dependabot.yml", ".github/dependabot.yml"],
])("%s matches its repository copy", (template, copy) => {
  expect(read(template)).toBe(read(copy));
});

test("the meme caller matches the exact ENGINEERING section 14 example", () => {
  const example = read("docs/ENGINEERING.md").match(
    /## 14\. PR meme pipeline[\s\S]*?```yaml\n([\s\S]*?)```/,
  );
  expect(example, "the documented caller must exist").not.toBeNull();
  expect(read("templates/pr-meme.yml")).toBe(example?.[1]);
});

test.each(["npm", "github-actions"])(
  "Dependabot groups weekly %s updates for the root package",
  (ecosystem) => {
    const configuration: unknown = parse(read("templates/dependabot.yml"));
    expect(configuration).toMatchObject({
      version: 2,
      updates: expect.arrayContaining([
        expect.objectContaining({
          "package-ecosystem": ecosystem,
          directory: "/",
          schedule: { interval: "weekly" },
          groups: { dependencies: { patterns: ["*"] } },
        }),
      ]),
    });
  },
);
