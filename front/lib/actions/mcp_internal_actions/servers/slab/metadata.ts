import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const SLAB_TOOL_NAME = "slab" as const;

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for post content

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const searchPostsSchema = {
  query: z
    .string()
    .describe("Search query string. Searches across post titles and content."),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results to return (default: 20, max: 100)"),
  topicId: z
    .string()
    .optional()
    .describe("Optional: Filter results to posts within a specific topic ID"),
  includeArchived: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include archived posts (default: false)"),
  publishedOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe("Only return published posts, exclude drafts (default: true)"),
};

export const getPostContentsSchema = {
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
};

export const getTopicsSchema = {};

export const getPostMetadataSchema = {
  postId: z.string().describe("The Slab post ID or URL"),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const SLAB_TOOLS: MCPToolType[] = [
  {
    name: "search_posts",
    description:
      "Search for posts across the Slab workspace. Returns posts matching the query.",
    inputSchema: zodToJsonSchema(z.object(searchPostsSchema)) as JSONSchema,
  },
  {
    name: "get_post_contents",
    description:
      "Retrieve specific posts by their IDs or URLs with full content and metadata. Supports pagination for large posts.",
    inputSchema: zodToJsonSchema(z.object(getPostContentsSchema)) as JSONSchema,
  },
  {
    name: "get_topics",
    description:
      "Retrieve all topics for navigation and organization understanding.",
    inputSchema: zodToJsonSchema(z.object(getTopicsSchema)) as JSONSchema,
  },
  {
    name: "get_post_metadata",
    description:
      "Get metadata about a post without retrieving full content (faster for large posts).",
    inputSchema: zodToJsonSchema(z.object(getPostMetadataSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SLAB_SERVER_INFO = {
  name: "slab" as const,
  version: "1.0.0",
  description: "Search and read from your Slab knowledge base",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const SLAB_TOOL_STAKES = {
  search_posts: "never_ask",
  get_post_contents: "never_ask",
  get_topics: "never_ask",
  get_post_metadata: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
