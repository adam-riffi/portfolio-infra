import { z } from "zod";
import { commentBody, ensureComment } from "./comment.ts";
import { githubClient } from "./github.ts";
import { fetchManifest } from "./manifest.ts";
import { selectImage } from "./select.ts";
import { skipReason } from "./skip.ts";

const repositoryName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const eventSchema = z.object({
  repository: z.object({
    full_name: repositoryName,
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.int().positive(),
    title: z.string(),
    user: z.object({ login: z.string() }),
    labels: z.array(z.object({ name: z.string() })),
    head: z.object({
      repo: z.object({ full_name: repositoryName }).nullable(),
    }),
  }),
});
export interface ActionConfig {
  eventName: string;
  token: string;
  manifestUrl: string;
  skipLabels: readonly string[];
  skipAuthors: readonly string[];
  width: number;
}
export interface ActionResult {
  imageId?: string;
  skippedReason?: string;
  warning?: boolean;
}

/** Execute the complete action, returning a safe result for every external error. */
export async function runAction(
  config: ActionConfig,
  event: unknown,
  request: typeof fetch = fetch,
): Promise<ActionResult> {
  if (config.eventName !== "pull_request") return { skippedReason: "event" };
  try {
    const { repository, pull_request: pr } = eventSchema.parse(event);
    const skipped = skipReason(
      {
        repository: repository.full_name,
        owner: repository.owner.login,
        headRepository: pr.head.repo?.full_name ?? null,
        author: pr.user.login,
        labels: pr.labels.map((label) => label.name),
      },
      config.skipLabels,
      config.skipAuthors,
    );
    if (skipped) return { skippedReason: skipped };
    if (
      !config.token ||
      !Number.isInteger(config.width) ||
      config.width < 1 ||
      config.width > 10000
    )
      throw new Error("Invalid configuration");
    const manifest = await fetchManifest(config.manifestUrl, request);
    const image = selectImage(
      manifest.images,
      pr.title,
      repository.full_name,
      pr.number,
    );
    if (!image) return { skippedReason: "manifest-empty", warning: true };
    const created = await ensureComment(
      githubClient(config.token, request),
      repository.full_name,
      pr.number,
      commentBody(image, config.width),
    );
    return created
      ? { imageId: image.id }
      : { skippedReason: "already-commented" };
  } catch {
    // Do not echo remote bodies, tokens, URLs or event data into runner logs.
    return { skippedReason: "error", warning: true };
  }
}
