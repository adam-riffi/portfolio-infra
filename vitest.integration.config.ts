import { defineConfig } from "vitest/config";

// Runs against a disposable Postgres (CI service container); see the integration job in ci.yml.
export default defineConfig({
  test: { include: ["test/integration/**/*.test.ts"] },
});
