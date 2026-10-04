import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "actions/*/src/**/*.ts",
        "scripts/*/src/**/*.ts",
        "uptime/**/*.ts",
      ],
      // M0 has only an empty entry point; there is no core to measure yet.
      exclude: ["actions/pr-meme/src/main.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        "actions/pr-meme/src/{select,comment,manifest}.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
          perFile: true,
        },
        "scripts/drive-sync/src/**": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
          perFile: true,
        },
      },
    },
  },
});
