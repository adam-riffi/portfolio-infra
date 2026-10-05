import { expect, test, vi } from "vitest";
import { commentBody, ensureComment, hasMeme } from "../src/comment.ts";
import { image } from "./fixtures.ts";

test("formats exactly the documented marker and raw GitHub image", () => {
  expect(commentBody(image, 360)).toBe(
    '<!-- pr-meme:v1 id=drive_id -->\n<img src="https://raw.githubusercontent.com/adam-riffi/portfolio-infra/main/memes/images/fix/drive_id.webp" alt="PR meme" width="360">',
  );
});
test.each([0, -1, 1.5, Number.NaN, 10001])(
  "rejects unsafe width %j",
  (width) => {
    expect(() => commentBody(image, width)).toThrow();
  },
);
test("recognizes the marker anywhere, including edited bodies, but not null bodies", () => {
  expect(hasMeme([{ body: null }, { body: "normal comment" }])).toBe(false);
  expect(hasMeme([{ body: "text\n<!-- pr-meme:v1 id=old --> edited" }])).toBe(
    true,
  );
});
test("posts once after checking every page", async () => {
  const client = {
    listComments: vi
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, () => ({ body: null })),
      )
      .mockResolvedValueOnce([{ body: "normal" }]),
    createComment: vi.fn().mockResolvedValue(undefined),
  };
  expect(await ensureComment(client, "owner/repo", 42, "body")).toBe(true);
  expect(client.listComments.mock.calls).toEqual([
    ["owner/repo", 42, 1],
    ["owner/repo", 42, 2],
  ]);
  expect(client.createComment).toHaveBeenCalledWith("owner/repo", 42, "body");
});
test("stops when a later page contains a meme", async () => {
  const client = {
    listComments: vi
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, () => ({ body: "normal" })),
      )
      .mockResolvedValueOnce([{ body: "<!-- pr-meme:v1 id=old -->" }]),
    createComment: vi.fn(),
  };
  expect(await ensureComment(client, "owner/repo", 42, "body")).toBe(false);
  expect(client.createComment).not.toHaveBeenCalled();
});
test("does not create a comment if listing fails and propagates posting errors", async () => {
  const client = {
    listComments: vi.fn().mockRejectedValue(new Error("list failed")),
    createComment: vi.fn(),
  };
  await expect(ensureComment(client, "owner/repo", 42, "body")).rejects.toThrow(
    "list failed",
  );
  expect(client.createComment).not.toHaveBeenCalled();
  client.listComments.mockResolvedValue([]);
  client.createComment.mockRejectedValue(new Error("post failed"));
  await expect(ensureComment(client, "owner/repo", 42, "body")).rejects.toThrow(
    "post failed",
  );
});
