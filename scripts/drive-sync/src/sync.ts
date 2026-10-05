import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type Image,
  parseManifest,
} from "../../../actions/pr-meme/src/manifest.ts";
import { diffFiles, stableManifest } from "./diff.ts";
import type { DriveImage } from "./drive.ts";
import { processImage } from "./process.ts";

export interface DriveClient {
  list(): Promise<DriveImage[]>;
  download(id: string): Promise<Buffer>;
}
export interface SyncResult {
  changed: boolean;
  downloads: number;
  removed: number;
  warnings: string[];
}

/** Prepare all downloads before writes; the workflow publishes results as one commit. */
export async function syncDrive(
  root: string,
  client: DriveClient,
  now: string,
  dryRun = false,
): Promise<SyncResult> {
  const directory = resolve(root);
  const manifestPath = join(directory, "memes/manifest.json");
  const original = await readFile(manifestPath, "utf8");
  const previous = parseManifest(JSON.parse(original));
  const current = await client.list();
  const diff = diffFiles(previous.images, current);
  if (dryRun)
    return {
      changed: diff.download.length + diff.remove.length > 0,
      downloads: diff.download.length,
      removed: diff.remove.length,
      warnings: [],
    };
  const images: Image[] = [...diff.keep];
  const prepared: { image: Image; data: Buffer }[] = [];
  const warnings: string[] = [];
  for (const file of diff.download) {
    try {
      if (file.size > 10_000_000) throw new Error("Image is too large");
      const bytes = await client.download(file.id);
      if (createHash("md5").update(bytes).digest("hex") !== file.md5Checksum)
        throw new Error("Drive file changed during download");
      const output = await processImage(bytes, file.mimeType);
      const image: Image = {
        id: file.id,
        category: file.category,
        path: `memes/images/${file.category}/${file.id}.${output.extension}`,
        sha256: output.sha256,
        width: output.width,
        height: output.height,
        bytes: output.data.length,
        driveMd5: file.md5Checksum,
      };
      images.push(image);
      prepared.push({ image, data: output.data });
    } catch {
      warnings.push(`skipped:${file.id}`);
      const old = previous.images.find((image) => image.id === file.id);
      if (old) images.push(old);
    }
  }
  // Revalidate paths/IDs even for callers providing their own Drive adapter.
  const serialized = stableManifest(previous, images, now);
  const next = parseManifest(JSON.parse(serialized));
  const paths = new Set(next.images.map((image) => image.path));
  const obsolete = previous.images.filter((image) => !paths.has(image.path));
  for (const { image, data } of prepared) {
    const path = join(directory, image.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  if (serialized !== original) await writeFile(manifestPath, serialized);
  for (const image of obsolete)
    await rm(join(directory, image.path), { force: true });
  return {
    changed: serialized !== original,
    downloads: prepared.length,
    removed: obsolete.length,
    warnings,
  };
}
