import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SLAB_TOOL_NAME = "slab" as const;

const MAX_CONTENT_SIZE = 32000;

export const SLAB_TOOLS_METADATA = createToolsRecord({
  search_posts: {
    description:
      "Search for posts across the Slab workspace. Returns posts matching the query.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Searching Slab posts",
      done: "Search Slab posts",
    },
  },
  get_post_contents: {
    description:
      "Retrieve specific posts by their IDs or URLs with full content and metadata. Supports pagination for large posts.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Slab post contents",
      done: "Get Slab post contents",
    },
  },
  get_topics: {
    description:
      "Retrieve all topics for navigation and organization understanding.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Slab topics",
      done: "Get Slab topics",
    },
  },
  get_post_metadata: {
    description:
      "Get metadata about a post without retrieving full content (faster for large posts).",
    schema: {
      postId: z.string().describe("The Slab post ID or URL"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Slab post metadata",
      done: "Get Slab post metadata",
    },
  },
});

export const SLAB_SERVER = {
  serverInfo: {
    name: "slab",
    version: "1.0.0",
    description: "Search and read from your Slab knowledge base",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SLAB_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SLAB_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
