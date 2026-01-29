import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const MENTION_USERS_SERVER_NAME = "mention_users" as const;
export const SEARCH_AVAILABLE_USERS_TOOL_NAME = "search_available_users";
export const GET_MENTION_MARKDOWN_TOOL_NAME = "get_mention_markdown";

export const MENTION_USERS_TOOLS_METADATA = createToolsRecord({
  [SEARCH_AVAILABLE_USERS_TOOL_NAME]: {
    description: "Search for users that are available to the conversation.",
    schema: {
      searchTerm: z
        .string()
        .describe(
          "A single search term to find users. Returns all the users that contain the search term in their name or description. Use an empty string to return all items."
        ),
    },
    stake: "never_ask",
  },
  [GET_MENTION_MARKDOWN_TOOL_NAME]: {
    description:
      "Get the markdown directive to use to mention a user in a message.",
    schema: {
      mention: z
        .object({
          id: z.string(),
          label: z.string(),
        })
        .describe("A mention to get the markdown directive for."),
    },
    stake: "never_ask",
  },
});

export const MENTION_USERS_SERVER = {
  serverInfo: {
    name: MENTION_USERS_SERVER_NAME,
    version: "1.0.0",
    description: "Tools for mentioning users in conversations.",
    icon: "ActionUserIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(MENTION_USERS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MENTION_USERS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
