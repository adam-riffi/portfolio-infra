import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";
import { parseTargets } from "../check.ts";

const read = (path: string): string =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

test("commits the two initial public uptime targets without a key value", () => {
  expect(parseTargets(JSON.parse(read("uptime/targets.json")))).toEqual([
    {
      name: "gacha-hub",
      url: "https://gacha-hub-two.vercel.app",
      expect: { status: 200, bodyIncludes: "<html" },
    },
    {
      name: "portfolio-db",
      url: "https://fztysvgkmauozxfyscaj.supabase.co/rest/v1/rpc/portfolio_health",
      expect: { status: 200, bodyIncludes: "ok" },
      headersFromEnv: { apikey: "SUPABASE_PUBLISHABLE_KEY" },
    },
  ]);
});

test("the scheduled uptime job is bounded, main-only and least-privileged", () => {
  const workflow = parse(read(".github/workflows/uptime.yml")) as {
    name?: unknown;
    on?: {
      schedule?: unknown;
      workflow_dispatch?: unknown;
    };
    permissions?: unknown;
    jobs?: {
      check?: {
        if?: unknown;
        "timeout-minutes"?: unknown;
        steps?: unknown;
      };
    };
  };

  expect(workflow.name).toBe("uptime");
  expect(workflow.on).toMatchObject({
    schedule: [{ cron: "0 */6 * * *" }],
    workflow_dispatch: null,
  });
  expect(workflow.permissions).toEqual({ contents: "read", issues: "write" });
  expect(workflow.jobs?.check).toMatchObject({
    if: "github.repository == 'adam-riffi/portfolio-infra' && github.ref == 'refs/heads/main'",
    "timeout-minutes": 15,
    steps: expect.arrayContaining([
      expect.objectContaining({
        name: "Run uptime checks",
        env: {
          GITHUB_TOKEN: "${{ github.token }}",
          SUPABASE_PUBLISHABLE_KEY: "${{ vars.SUPABASE_PUBLISHABLE_KEY }}",
        },
        run: "node uptime/main.ts",
      }),
    ]),
  });
});
