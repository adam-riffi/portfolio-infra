import type { Image, Manifest } from "../../../actions/pr-meme/src/manifest.ts";
import type { Category } from "../../../actions/pr-meme/src/select.ts";

export interface DriveFile {
  id: string;
  name: string;
  category: Category;
  md5Checksum: string;
}

/** Compare upstream checksums and category paths, never user-supplied filenames. */
export function diffFiles<T extends DriveFile>(
  previous: readonly Image[],
  current: readonly T[],
): { download: T[]; keep: Image[]; remove: Image[] } {
  if (new Set(current.map((file) => file.id)).size !== current.length)
    throw new Error("duplicate Drive IDs");
  const byId = new Map(previous.map((image) => [image.id, image]));
  const download: T[] = [];
  const keep: Image[] = [];
  for (const file of current) {
    const image = byId.get(file.id);
    if (
      image?.driveMd5 === file.md5Checksum &&
      image.category === file.category
    )
      keep.push(image);
    else download.push(file);
    byId.delete(file.id);
  }
  return { download, keep, remove: [...byId.values()] };
}

/** Stable field and ID ordering; unchanged pools retain their original timestamp. */
export function stableManifest(
  previous: Manifest,
  images: readonly Image[],
  now: string,
): string {
  const sorted = [...images].sort(
    (left, right) => Number(left.id > right.id) - Number(left.id < right.id),
  );
  const canonical = sorted.map((image) => ({
    id: image.id,
    category: image.category,
    path: image.path,
    sha256: image.sha256,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    ...(image.driveMd5 === undefined ? {} : { driveMd5: image.driveMd5 }),
  }));
  const generatedAt =
    JSON.stringify(canonical) === JSON.stringify(previous.images)
      ? previous.generatedAt
      : now;
  return `${JSON.stringify({ version: 1, generatedAt, images: canonical }, null, 2)}\n`;
}
