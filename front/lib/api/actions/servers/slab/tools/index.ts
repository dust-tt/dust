import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getPosts,
  getTopics,
  MAX_LIMIT,
  searchPosts,
} from "@app/lib/api/actions/servers/slab/client";
import {
  formatPostAsText,
  formatPostListAsText,
  formatPostSummary,
  formatTopicsAsText,
} from "@app/lib/api/actions/servers/slab/helpers";
import { SLAB_TOOLS_METADATA } from "@app/lib/api/actions/servers/slab/metadata";
import {
  ERROR_MESSAGES,
  extractPostId,
  filterByArchived,
  filterByPublished,
} from "@app/lib/api/actions/servers/slab/utils";
import { Err, Ok } from "@app/types/shared/result";

const MAX_CONTENT_SIZE = 32000;

const handlers: ToolHandlers<typeof SLAB_TOOLS_METADATA> = {
  search_posts: async (
    { query, limit, topicId, includeArchived, publishedOnly },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
    }

    const effectiveLimit = Math.min(Math.max(limit ?? 20, 1), MAX_LIMIT);

    const results = await searchPosts(
      accessToken,
      query,
      effectiveLimit,
      topicId
    );
    let posts = results.map((r) => r.post);

    posts = filterByPublished(posts, publishedOnly ?? true);
    posts = filterByArchived(posts, includeArchived ?? false);

    if (posts.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No posts found matching the query`,
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: formatPostListAsText(posts),
      },
    ]);
  },

  get_post_contents: async ({ postIds, offset, limit }, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
    }

    const ids = postIds
      .map((id) => extractPostId(id).trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) {
      return new Err(
        new MCPError(
          `${ERROR_MESSAGES.INVALID_POST_ID}: No valid post IDs found in: ${postIds.join(", ")}`
        )
      );
    }

    const posts = await getPosts(accessToken, ids);

    if (posts.length === 0) {
      return new Err(
        new MCPError(
          `${ERROR_MESSAGES.POST_NOT_FOUND}: Post IDs: ${ids.join(", ")}`
        )
      );
    }

    // Format all posts with full content
    const fullContent = posts
      .map((post) => formatPostAsText(post))
      .join("\n\n---\n\n");

    // Apply offset and limit to the combined content
    const effectiveLimit = Math.min(
      Math.max(limit ?? MAX_CONTENT_SIZE, 1),
      MAX_CONTENT_SIZE
    );
    const effectiveOffset = Math.max(offset ?? 0, 0);
    const totalLength = fullContent.length;
    const startIndex = Math.max(0, effectiveOffset);
    const endIndex = Math.min(totalLength, startIndex + effectiveLimit);
    const truncatedContent = fullContent.slice(startIndex, endIndex);
    const hasMore = endIndex < totalLength;
    const nextOffset = hasMore ? endIndex : undefined;

    let result = truncatedContent;
    if (hasMore && nextOffset !== undefined) {
      result += `\n\n---\n\n[Content truncated. Use offset ${nextOffset} to continue reading.]`;
    }

    return new Ok([{ type: "text" as const, text: result }]);
  },

  get_topics: async (_args, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
    }

    const topics = await getTopics(accessToken);

    const result = formatTopicsAsText(topics);

    return new Ok([{ type: "text" as const, text: result }]);
  },

  get_post_metadata: async ({ postId }, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
    }

    const id = extractPostId(postId).trim();
    if (!id) {
      return new Err(
        new MCPError(`${ERROR_MESSAGES.INVALID_POST_ID}: Provided: ${postId}`)
      );
    }

    const posts = await getPosts(accessToken, [id]);

    if (posts.length === 0) {
      return new Err(
        new MCPError(`${ERROR_MESSAGES.POST_NOT_FOUND}: Post ID: ${id}`)
      );
    }

    return new Ok([
      { type: "text" as const, text: formatPostSummary(posts[0]) },
    ]);
  },
};

export const TOOLS = buildTools(SLAB_TOOLS_METADATA, handlers);
