import { z } from "zod";

export const categorySchema = z.enum([
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
  "general",
]);
export const imageSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    category: categorySchema,
    path: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.int().positive(),
    height: z.int().positive(),
    bytes: z.int().positive(),
  })
  .refine(
    (image) =>
      ["webp", "gif"].some(
        (extension) =>
          image.path ===
          `memes/images/${image.category}/${image.id}.${extension}`,
      ),
    { message: "Image path must match its category and Drive ID" },
  );

const manifestSchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.iso.datetime(),
    images: z.array(imageSchema),
  })
  .refine(
    (manifest) =>
      new Set(manifest.images.map((image) => image.id)).size ===
      manifest.images.length,
    { message: "Image IDs must be unique" },
  );
export type Image = z.infer<typeof imageSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

/** Validate external image metadata before using it in paths or comments. */
export function parseManifest(value: unknown): Manifest {
  return manifestSchema.parse(value);
}

/** Fetch a public HTTPS manifest with a three-second deadline and size ceiling. */
export async function fetchManifest(
  url: string,
  request: typeof fetch = fetch,
): Promise<Manifest> {
  if (new URL(url).protocol !== "https:")
    throw new Error("Manifest URL must use HTTPS");
  const response = await request(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok)
    throw new Error(`Manifest request failed (HTTP ${response.status})`);
  if (!response.body) throw new Error("Manifest response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        throw new Error("Manifest is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
