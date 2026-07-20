import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const USER_MENTIONS_SERVER_NAME = "user_mentions" as const;
export const SEARCH_AVAILABLE_USERS_TOOL_NAME = "search_available_users";
export const GET_MENTION_MARKDOWN_TOOL_NAME = "get_mention_markdown";

export const USER_MENTIONS_TOOLS_METADATA = [
  {
    name: SEARCH_AVAILABLE_USERS_TOOL_NAME,
    description: "Search for users that are available to the conversation.",
    schema: {
      searchTerm: z
        .string()
        .describe(
          "A single search term to find users. Returns all the users that contain the search term in their name or description. Use an empty string to return all items."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching users",
      done: "Search users",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_MENTION_MARKDOWN_TOOL_NAME,
    description:
      "Get the markdown directive to use to mention a list of users in a message.",
    schema: {
      mentions: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
          })
        )
        .describe("A list of mentions to get the markdown directive for."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting mention markdown",
      done: "Get mention markdown",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const USER_MENTIONS_SERVER = {
  serverInfo: {
    name: USER_MENTIONS_SERVER_NAME,
    version: "1.0.0",
    description: "Tools for mentioning users in conversations.",
    icon: "ActionMegaphoneIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: USER_MENTIONS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
