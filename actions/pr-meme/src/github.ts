import { z } from "zod";
import type { CommentClient } from "./comment.ts";

/** GitHub HTTP boundary; one shared deadline bounds pagination and posting. */
export function githubClient(
  token: string,
  request: typeof fetch = fetch,
): CommentClient {
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
      return z
        .array(z.object({ body: z.string().nullable() }))
        .parse(await response.json());
    },
    async createComment(repository, number, body) {
      await call(
        `/repos/${repository}/issues/${number}/comments`,
        JSON.stringify({ body }),
      );
    },
  };
}
