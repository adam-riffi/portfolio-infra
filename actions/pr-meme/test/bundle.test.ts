import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

test("the empty action builds and runs without credentials or runtime dependencies", () => {
  const build = spawnSync(process.execPath, ["scripts/build.ts"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(build.error).toBeUndefined();
  expect(build.status, build.stderr).toBe(0);

  const directory = mkdtempSync(join(tmpdir(), "portfolio-infra-bundle-"));
  const bundle = join(directory, "index.mjs");
  try {
    copyFileSync("actions/pr-meme/dist/index.js", bundle);
    const run = spawnSync(process.execPath, [bundle], {
      cwd: directory,
      env: {},
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toBe("");
  } finally {
    rmSync(bundle, { force: true });
    rmdirSync(directory);
  }
});
