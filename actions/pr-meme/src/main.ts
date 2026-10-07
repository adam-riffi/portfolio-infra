import { readFile } from "node:fs/promises";
import * as core from "@actions/core";
import { runAction } from "./run.ts";

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
try {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const event: unknown =
    eventName === "pull_request"
      ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8"))
      : null;
  const result = await runAction(
    {
      eventName,
      token: core.getInput("github-token") || process.env.GITHUB_TOKEN || "",
      manifestUrl:
        core.getInput("manifest-url") ||
        "https://raw.githubusercontent.com/adam-riffi/portfolio-infra/main/memes/manifest.json",
      skipLabels: list(core.getInput("skip-labels") || "no-meme"),
      skipAuthors: list(
        core.getInput("skip-authors") || "dependabot[bot],renovate[bot]",
      ),
      width: Number(core.getInput("width") || "360"),
    },
    event,
  );
  const avoided = result.recentImages
    ? ` (avoided ${result.recentImages} recent)`
    : "";
  const description = result.imageId
    ? `PR meme: ${result.imageId}${avoided}`
    : `PR meme skipped: ${result.skippedReason}`;
  core.setOutput("image-id", result.imageId ?? "");
  core.setOutput("skipped-reason", result.skippedReason ?? "");
  core.info(description);
  if (result.warning) core.warning("PR meme unavailable; CI continues.");
  if (process.env.GITHUB_STEP_SUMMARY)
    await core.summary.addRaw(description).addEOL().write();
} catch {
  core.warning("PR meme unavailable; CI continues.");
  core.setOutput("skipped-reason", "error");
}
