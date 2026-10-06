import { appendFile } from "node:fs/promises";
import { downloadImage, listImages } from "./src/drive.ts";
import { syncDrive } from "./src/sync.ts";

const folder = process.env.GDRIVE_FOLDER_ID;
const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
if (!folder || !token)
  throw new Error(
    "Set GDRIVE_FOLDER_ID and GOOGLE_OAUTH_ACCESS_TOKEN securely.",
  );
const result = await syncDrive(
  process.cwd(),
  {
    list: () => listImages(folder, token),
    download: (id) => downloadImage(id, token),
  },
  new Date().toISOString(),
  process.argv.includes("--dry-run"),
);
for (const warning of result.warnings) console.warn(warning);
const summary = `${result.changed ? "changes" : "no changes"}; downloads=${result.downloads}; removed=${result.removed}; warnings=${result.warnings.length}`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `Drive sync: ${summary}\n`);
