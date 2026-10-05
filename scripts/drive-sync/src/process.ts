import { createHash } from "node:crypto";
import sharp from "sharp";

export interface ProcessedImage {
  data: Buffer;
  extension: "webp" | "gif";
  width: number;
  height: number;
  sha256: string;
}

/** Decode bounded image data, preserve small animated GIFs and cap other media at 800px. */
export async function processImage(
  data: Buffer,
  mimeType: string,
): Promise<ProcessedImage> {
  if (!mimeType.startsWith("image/")) throw new Error("Non-image MIME type");
  if (data.length > 10_000_000) throw new Error("Image is too large");
  const options = { limitInputPixels: 40_000_000 };
  const metadata = await sharp(data, options).metadata();
  let output: Buffer;
  let extension: "webp" | "gif";
  let width: number;
  let height: number;
  if (metadata.format === "gif" && Number(metadata.pages) > 1) {
    if (data.length >= 5_000_000) throw new Error("Animated GIF is too large");
    output = data;
    extension = "gif";
    width = metadata.width;
    height = metadata.pageHeight ?? metadata.height;
  } else {
    const result = await sharp(data, options)
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer({ resolveWithObject: true });
    output = result.data;
    extension = "webp";
    width = result.info.width;
    height = result.info.height;
  }
  return {
    data: output,
    extension,
    width,
    height,
    sha256: createHash("sha256").update(output).digest("hex"),
  };
}
