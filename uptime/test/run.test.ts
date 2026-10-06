import { expect, test, vi } from "vitest";
import type { GitHubIssues } from "../alerts.ts";
import type { CheckResult, Target } from "../check.ts";
import { readUptimeTargets, runUptime } from "../run.ts";

const targets: Target[] = [
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
];

test("loads target JSON without exposing parse details", async () => {
  await expect(
    readUptimeTargets(async () => JSON.stringify(targets)),
  ).resolves.toEqual(targets);
  await expect(readUptimeTargets(async () => "{")).rejects.toThrow(
    "Invalid uptime targets",
  );
});

test("preflights every header before creating clients or probing", async () => {
  const check = vi.fn();
  const makeIssues = vi.fn();
  const reconcile = vi.fn();

  await expect(
    runUptime({
      environment: { GITHUB_TOKEN: "actions-token" },
      readTargets: async () => targets,
      check,
      makeIssues,
      reconcile,
    }),
  ).rejects.toThrow("Invalid uptime header configuration");

  expect(check).not.toHaveBeenCalled();
  expect(makeIssues).not.toHaveBeenCalled();
  expect(reconcile).not.toHaveBeenCalled();
});

test("uses the action token after configuration and reconciles every result", async () => {
  const issues = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(1),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies GitHubIssues;
  const results: CheckResult[] = [
    { name: "gacha-hub", ok: true },
    { name: "portfolio-db", ok: false, reason: "HTTP 503" },
  ];
  const check = vi.fn(async (target: Target) => {
    const result = results.find(({ name }) => name === target.name);
    if (!result) throw new Error("Unexpected target");
    return result;
  });
  const makeIssues = vi.fn((_token: string) => issues);
  const reconciliation = { opened: 1, closed: 0 };
  const reconcile = vi.fn(
    async (
      _targets: Target[],
      _results: CheckResult[],
      _issues: GitHubIssues,
    ) => reconciliation,
  );

  await expect(
    runUptime({
      environment: {
        GITHUB_TOKEN: "actions-token",
        SUPABASE_PUBLISHABLE_KEY: "public-key",
      },
      readTargets: async () => targets,
      check,
      makeIssues,
      reconcile,
    }),
  ).resolves.toEqual(reconciliation);

  expect(check).toHaveBeenNthCalledWith(1, targets[0], {});
  expect(check).toHaveBeenNthCalledWith(2, targets[1], {
    apikey: "public-key",
  });
  expect(makeIssues).toHaveBeenCalledWith("actions-token");
  expect(reconcile).toHaveBeenCalledWith(targets, results, issues);
});
