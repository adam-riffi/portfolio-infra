import { z } from "zod";
import { categorySchema } from "../../../actions/pr-meme/src/manifest.ts";
import type { Category } from "../../../actions/pr-meme/src/select.ts";
import type { DriveFile } from "./diff.ts";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const entrySchema = z.object({
  id: idSchema,
  name: z.string(),
  mimeType: z.string(),
  md5Checksum: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
});
export interface DriveImage extends DriveFile {
  mimeType: string;
  size: number;
  modifiedTime: string;
}

async function get(
  path: string,
  token: string,
  request: typeof fetch,
): Promise<Response> {
  const response = await request(
    `https://www.googleapis.com/drive/v3/${path}`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(`Drive request failed (HTTP ${response.status})`);
  return response;
}

/** Bound every Drive body while reading, independent of Content-Length. */
export async function boundedBytes(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error("Drive response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10_000_000) {
        await reader.cancel();
        throw new Error("Drive response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/** Walk complete paginated listings; descendants inherit their root subfolder category. */
export async function listImages(
  folderId: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<DriveImage[]> {
  idSchema.parse(folderId);
  const queue: { id: string; category: Category }[] = [
    { id: folderId, category: "general" },
  ];
  const visited = new Set<string>();
  const images: DriveImage[] = [];
  for (const folder of queue) {
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    let pageToken = "";
    const tokens = new Set<string>();
    do {
      if (tokens.has(pageToken)) throw new Error("Repeated Drive page token");
      tokens.add(pageToken);
      const params = new URLSearchParams({
        q: `'${folder.id}' in parents and trashed = false`,
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,parents,md5Checksum,modifiedTime,size)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await get(`files?${params}`, token, request);
      const page = z
        .object({
          files: z.array(entrySchema),
          nextPageToken: z.string().optional(),
          incompleteSearch: z.boolean().optional(),
        })
        .parse(JSON.parse((await boundedBytes(response)).toString("utf8")));
      if (page.incompleteSearch) throw new Error("Drive listing is incomplete");
      for (const entry of page.files) {
        if (entry.mimeType === "application/vnd.google-apps.folder") {
          const category =
            folder.id === folderId
              ? categorySchema.safeParse(entry.name.toLowerCase())
              : { success: true as const, data: folder.category };
          queue.push({
            id: entry.id,
            category: category.success ? category.data : "general",
          });
        } else if (entry.mimeType.startsWith("image/")) {
          images.push({
            id: entry.id,
            name: entry.name,
            category: folder.category,
            mimeType: entry.mimeType,
            md5Checksum: z
              .string()
              .regex(/^[a-f0-9]{32}$/)
              .parse(entry.md5Checksum),
            modifiedTime: z.iso.datetime().parse(entry.modifiedTime),
            size: z.coerce.number().int().positive().parse(entry.size),
          });
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return images;
}

/** Download a safe Drive ID; never trust a source filename as a filesystem path. */
export async function downloadImage(
  id: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<Buffer> {
  idSchema.parse(id);
  return boundedBytes(await get(`files/${id}?alt=media`, token, request));
}
