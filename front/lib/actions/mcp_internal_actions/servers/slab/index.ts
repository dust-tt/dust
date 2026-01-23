import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

import { getPosts, getTopics, MAX_LIMIT, searchPosts } from "./slab_api_helper";
import {
  formatPostAsText,
  formatPostListAsText,
  formatPostSummary,
  formatTopicsAsText,
} from "./slab_response_helpers";
import {
  ERROR_MESSAGES,
  extractPostId,
  filterByArchived,
  filterByPublished,
} from "./slab_utils";

const MAX_CONTENT_SIZE = 32000; // Max characters to return for post content

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("slab");

  server.tool(
    "search_posts",
    "Search for posts across the Slab workspace. Returns posts matching the query.",
    {
      query: z
        .string()
        .describe(
          "Search query string. Searches across post titles and content."
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe(
          "Maximum number of results to return (default: 20, max: 100)"
        ),
      topicId: z
        .string()
        .optional()
        .describe(
          "Optional: Filter results to posts within a specific topic ID"
        ),
      includeArchived: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include archived posts (default: false)"),
      publishedOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Only return published posts, exclude drafts (default: true)"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "slab_search_posts",
        agentLoopContext,
      },
      async (
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
      }
    )
  );

  server.tool(
    "get_post_contents",
    "Retrieve specific posts by their IDs or URLs with full content and metadata. Supports pagination for large posts.",
    {
      postIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe(
          "Array of Slab post IDs or full URLs (e.g., ['abc123'] or ['https://team.slab.com/posts/abc123'])"
        ),
      offset: z
        .number()
        .default(0)
        .describe(
          "Character offset to start reading from (for pagination). Defaults to 0."
        ),
      limit: z
        .number()
        .default(MAX_CONTENT_SIZE)
        .describe(
          `Maximum number of characters to return per post. Defaults to ${MAX_CONTENT_SIZE}.`
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "slab_get_post_contents",
        agentLoopContext,
      },
      async ({ postIds, offset, limit }, { authInfo }) => {
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
      }
    )
  );

  server.tool(
    "get_topics",
    "Retrieve all topics for navigation and organization understanding.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "slab_get_topics",
        agentLoopContext,
      },
      async (_args, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
        }

        const topics = await getTopics(accessToken);

        const result = formatTopicsAsText(topics);

        return new Ok([{ type: "text" as const, text: result }]);
      }
    )
  );

  server.tool(
    "get_post_metadata",
    "Get metadata about a post without retrieving full content (faster for large posts).",
    {
      postId: z.string().describe("The Slab post ID or URL"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "slab_get_post_metadata",
        agentLoopContext,
      },
      async ({ postId }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
        }

        const id = extractPostId(postId).trim();
        if (!id) {
          return new Err(
            new MCPError(
              `${ERROR_MESSAGES.INVALID_POST_ID}: Provided: ${postId}`
            )
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
      }
    )
  );

  return server;
}

export default createServer;
