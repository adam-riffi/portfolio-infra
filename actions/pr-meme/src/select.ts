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

/** Selection uses only these fields; callers keep their full image metadata. */
export interface SelectionImage {
  readonly id: string;
  readonly category: string;
}

/** Return category, general, or all images, sorted by ID without mutating input. */
export function selectPool<T extends SelectionImage>(
  images: readonly T[],
  category: Category,
): T[] {
  let pool = images.filter((image) => image.category === category);
  if (pool.length === 0) {
    pool = images.filter((image) => image.category === "general");
  }
  if (pool.length === 0) pool = [...images];

  // Code-unit order is stable across hosts; localeCompare depends on the locale.
  return pool.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

/** Hash UTF-8 bytes with FNV-1a, returning an unsigned 32-bit integer. */
export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Choose by repository#PR number, skipping `recent` image IDs unless that empties the
 * pool; an empty manifest has no choice.
 */
export function selectImage<T extends SelectionImage>(
  images: readonly T[],
  title: string,
  repository: string,
  number: number,
  recent: ReadonlySet<string> = new Set(),
): T | undefined {
  const pool = selectPool(images, parseCategory(title));
  const fresh = pool.filter((image) => !recent.has(image.id));
  const choices = fresh.length > 0 ? fresh : pool;
  if (choices.length === 0) return undefined;
  return choices[fnv1a(`${repository}#${number}`) % choices.length];
}
