import type { SlabPost } from "./slab_types";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN:
    "No Slab access token found. Please connect your Slab account.",
  POST_NOT_FOUND: "Post not found",
  INVALID_POST_ID: "Invalid post ID format",
} as const;

export function filterByPublished(posts: SlabPost[], publishedOnly: boolean) {
  if (!publishedOnly) {
    return posts;
  }
  return posts.filter((post) => post.publishedAt !== null);
}

export function filterByArchived(posts: SlabPost[], includeArchived: boolean) {
  if (includeArchived) {
    return posts;
  }
  return posts.filter((post) => post.archivedAt === null);
}

export function extractPostId(postIdOrUrl: string) {
  const urlMatch = postIdOrUrl.match(/\/posts\/([a-zA-Z0-9-]+)/);
  return urlMatch ? urlMatch[1] : postIdOrUrl;
}
