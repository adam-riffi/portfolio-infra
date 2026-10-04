import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("lint rejects explicit any even in otherwise valid TypeScript", () => {
  const directory = mkdtempSync(join(process.cwd(), ".lint-probe-"));
  const file = join(directory, "probe.ts");
  try {
    writeFileSync(file, "export const value: any = 1;\n");
    const lint = spawnSync(
      process.execPath,
      ["node_modules/@biomejs/biome/bin/biome", "lint", file],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(lint.error).toBeUndefined();
    expect(lint.status).toBe(1);
    expect(lint.stderr).toContain("noExplicitAny");
  } finally {
    rmSync(file, { force: true });
    rmdirSync(directory);
  }
});
