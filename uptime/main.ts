import { runFromEnvironment } from "./run.ts";

void runFromEnvironment()
  .then(({ opened, closed }) => {
    console.log(`Uptime alerts: ${opened} opened, ${closed} closed`);
  })
  .catch(() => {
    console.error("Uptime run failed");
    process.exitCode = 1;
  });
