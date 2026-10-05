import { type Image, imageSchema } from "./manifest.ts";

export interface Comment {
  readonly body: string | null;
}
export interface CommentClient {
  listComments(
    repository: string,
    number: number,
    page: number,
  ): Promise<readonly Comment[]>;
  createComment(
    repository: string,
    number: number,
    body: string,
  ): Promise<void>;
}

/** Identify our versioned marker even if a user has edited the surrounding text. */
export function hasMeme(comments: readonly Comment[]): boolean {
  return comments.some((comment) => comment.body?.includes("<!-- pr-meme:v1"));
}

/** Render validated metadata as the exact version-one comment format. */
export function commentBody(image: Image, width: number): string {
  if (!Number.isInteger(width) || width < 1 || width > 10000)
    throw new Error("Invalid image width");
  imageSchema.parse(image);
  return `<!-- pr-meme:v1 id=${image.id} -->\n<img src="https://raw.githubusercontent.com/adam-riffi/portfolio-infra/main/${image.path}" alt="PR meme" width="${width}">`;
}

/** Scan pages of 100 comments before creating one; never post after a read error. */
export async function ensureComment(
  client: CommentClient,
  repository: string,
  number: number,
  body: string,
): Promise<boolean> {
  for (let page = 1; ; page++) {
    const comments = await client.listComments(repository, number, page);
    if (hasMeme(comments)) return false;
    if (comments.length < 100) break;
  }
  await client.createComment(repository, number, body);
  return true;
}
