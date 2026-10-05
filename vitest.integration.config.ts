import { defineConfig } from "vitest/config";

// Runs against a disposable Postgres (CI service container); see the integration job in ci.yml.
// Files share one database, so they run one at a time.
export default defineConfig({
  test: { include: ["test/integration/**/*.test.ts"], fileParallelism: false },
});
