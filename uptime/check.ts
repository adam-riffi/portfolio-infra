import { z } from "zod";

const targetSchema = z.strictObject({
  name: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  expect: z.strictObject({
    status: z.int().min(100).max(599),
    bodyIncludes: z.string().min(1).max(1024),
  }),
  headersFromEnv: z
    .record(
      z.string().regex(/^(?:authorization|apikey|x-[a-z0-9-]+)$/),
      z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    )
    .optional(),
});
export type Target = z.infer<typeof targetSchema>;
export type CheckResult = { name: string; ok: boolean; reason?: string };

/** Reject ambiguous names, embedded credentials and malformed targets up front. */
export function parseTargets(value: unknown): Target[] {
  return z
    .array(targetSchema)
    .min(1)
    .max(50)
    .refine(
      (targets) =>
        new Set(targets.map((target) => target.name)).size === targets.length,
    )
    .parse(value);
}

/** Resolve secret values outside persisted configuration and diagnostic output. */
export function requestHeaders(
  target: Target,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(target.headersFromEnv ?? {}).map(([name, variable]) => {
      const value = env[variable];
      if (
        !value ||
        value.length > 8192 ||
        [...value].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      ) {
        throw new Error("Invalid uptime header configuration");
      }
      return [name, value];
    }),
  );
}

/** Probe with a ten-second deadline, no redirects and a one-MiB body ceiling. */
export async function checkTarget(
  target: Target,
  headers: Record<string, string>,
  request: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<CheckResult> {
  const failure = (reason: string): CheckResult => ({
    name: target.name,
    ok: false,
    reason,
  });
  try {
    const response = await request(target.url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== target.expect.status) {
      await response.body?.cancel();
      return failure(`HTTP ${response.status}`);
    }
    if (!response.body) return failure("Expected text missing");
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
          return failure("Response too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks)
      .toString("utf8")
      .includes(target.expect.bodyIncludes)
      ? { name: target.name, ok: true }
      : failure("Expected text missing");
  } catch {
    return failure("Request failed or timed out");
  }
}
