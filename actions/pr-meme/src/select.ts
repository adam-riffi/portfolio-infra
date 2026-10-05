const commitTypes = [
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
] as const;

export type Category = (typeof commitTypes)[number] | "general";

/** Parse a single-line Conventional Commit title, falling back to general. */
export function parseCategory(title: string): Category {
  const match = /^([a-z]+)(?:\([^()\r\n]+\))?!?: +\S[^\r\n]*$/i.exec(title);
  // JavaScript's $ also matches before a final newline; require the whole title.
  if (match?.[0] !== title) return "general";

  const type = match[1]?.toLowerCase();
  return commitTypes.find((candidate) => candidate === type) ?? "general";
}
