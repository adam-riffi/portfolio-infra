import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/test/**/*.test.ts"],
    // Integration tests need Postgres: `pnpm test:integration` (vitest.integration.config.ts).
    exclude: [...configDefaults.exclude, "test/integration/**"],
    coverage: {
      provider: "v8",
      include: ["actions/*/src/**/*.ts", "uptime/**/*.ts", "standards/**/*.ts"],
      // The runner entry point is platform glue; run.ts and all core are measured.
      exclude: ["actions/pr-meme/src/main.ts", "standards/main.ts"],
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
      },
    },
  },
});
