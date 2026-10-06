import { readFile } from "node:fs/promises";
import {
  type AlertReconciliation,
  type GitHubIssues,
  githubIssues,
  reconcileAlerts,
} from "./alerts.ts";
import {
  type CheckResult,
  checkTarget,
  parseTargets,
  requestHeaders,
  type Target,
} from "./check.ts";

type Probe = (
  target: Target,
  headers: Record<string, string>,
) => Promise<CheckResult>;
type MakeIssues = (token: string) => GitHubIssues;
type Reconcile = (
  targets: Target[],
  results: CheckResult[],
  issues: GitHubIssues,
) => Promise<AlertReconciliation>;

export type UptimeRunnerOptions = {
  environment: NodeJS.ProcessEnv;
  readTargets: () => Promise<unknown>;
  check?: Probe;
  makeIssues?: MakeIssues;
  reconcile?: Reconcile;
};

const readTargetFile = (): Promise<string> =>
  readFile(new URL("./targets.json", import.meta.url), "utf8");

/** Read target JSON without surfacing file contents or parser diagnostics. */
export async function readUptimeTargets(
  read: () => Promise<string> = readTargetFile,
): Promise<unknown> {
  try {
    return JSON.parse(await read());
  } catch {
    throw new Error("Invalid uptime targets");
  }
}

/** Preflight configuration, execute probes, then reconcile their managed alerts. */
export async function runUptime({
  environment,
  readTargets,
  check = checkTarget,
  makeIssues = githubIssues,
  reconcile = reconcileAlerts,
}: UptimeRunnerOptions): Promise<AlertReconciliation> {
  let targets: Target[];
  try {
    targets = parseTargets(await readTargets());
  } catch {
    throw new Error("Invalid uptime targets");
  }

  // Resolve every credential before any network operation so a bad variable
  // cannot become a false outage alert for only part of the target set.
  const configured = targets.map((target) => ({
    target,
    headers: requestHeaders(target, environment),
  }));

  const token = environment.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub token required");
  const issues = makeIssues(token);
  const results = await Promise.all(
    configured.map(({ target, headers }) => check(target, headers)),
  );
  return reconcile(targets, results, issues);
}

/** Run the committed target configuration with GitHub Actions environment data. */
export function runFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AlertReconciliation> {
  return runUptime({ environment, readTargets: readUptimeTargets });
}
