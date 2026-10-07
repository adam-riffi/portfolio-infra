import { readFileSync } from "node:fs";
import { githubApi, parseRepositories, syncAll } from "./sync.ts";

try {
  const results = await syncAll(
    githubApi(process.env.STANDARDS_SYNC_TOKEN ?? ""),
    parseRepositories(JSON.parse(readFileSync("standards/repos.json", "utf8"))),
    readFileSync("templates/ENGINEERING.md", "utf8"),
  );
  for (const result of results)
    console.log(
      `${result.repository}: ${"outcome" in result ? result.outcome : result.error}`,
    );
  if (results.some((result) => "error" in result)) process.exitCode = 1;
} catch (error) {
  const missing =
    error instanceof Error && error.message.startsWith("STANDARDS_SYNC_TOKEN");
  console.error(
    missing ? "Set the STANDARDS_SYNC_TOKEN secret." : "Standards sync failed",
  );
  process.exitCode = 1;
}
