import { z } from "zod";
import type { Comment, CommentClient } from "./comment.ts";

const commentsSchema = z.array(z.object({ body: z.string().nullable() }));
export interface GitHubClient extends CommentClient {
  /** One page of the repository's newest issue and PR comments. */
  listRecentComments(repository: string): Promise<readonly Comment[]>;
}

/** GitHub HTTP boundary; one shared deadline bounds pagination and posting. */
export function githubClient(
  token: string,
  request: typeof fetch = fetch,
): GitHubClient {
  const signal = AbortSignal.timeout(6000);
  async function call(path: string, body?: string): Promise<Response> {
    const response = await request(`https://api.github.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body }),
      signal,
    });
    if (!response.ok)
      throw new Error(`GitHub request failed (HTTP ${response.status})`);
    return response;
  }
  return {
    async listComments(repository, number, page) {
      const response = await call(
        `/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`,
      );
      return commentsSchema.parse(await response.json());
    },
    async listRecentComments(repository) {
      const response = await call(
        `/repos/${repository}/issues/comments?sort=created&direction=desc&per_page=100`,
      );
      return commentsSchema.parse(await response.json());
    },
    async createComment(repository, number, body) {
      await call(
        `/repos/${repository}/issues/${number}/comments`,
        JSON.stringify({ body }),
      );
    },
  };
}
