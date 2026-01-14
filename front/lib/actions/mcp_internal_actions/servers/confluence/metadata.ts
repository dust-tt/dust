import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

export const CONFLUENCE_TOOL_NAME = "confluence" as const;

export const getCurrentUserSchema = {};

export const getSpacesSchema = {};

export const getPagesSchema = {
  cql: z
    .string()
    .describe(
      "CQL query string. Must include 'type=page' to filter for pages only."
    ),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from previous response for next page"),
  limit: z
    .number()
    .optional()
    .describe("Number of results per page (default 25)"),
};

export const getPageSchema = {
  pageId: z.string().describe("The ID of the page to retrieve"),
  includeBody: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to include the page body content (default: false). When true, returns body in storage format."
    ),
};

export const createPageSchema = {
  spaceId: z
    .string()
    .describe("The ID of the space where the page will be created"),
  title: z.string().describe("The title of the new page"),
  status: z
    .enum(["current", "draft"])
    .optional()
    .default("current")
    .describe("Page status (default: current)"),
  parentId: z
    .string()
    .optional()
    .describe("Parent page ID to create this page as a child"),
  body: z
    .object({
      representation: z
        .enum(["storage", "atlas_doc_format"])
        .describe(
          "Content format: 'storage' for Confluence storage format, 'atlas_doc_format' for ADF"
        ),
      value: z.string().describe("Page content in the specified format"),
    })
    .optional()
    .describe("Page body content"),
};

export const updatePageSchema = {
  id: z.string().describe("The page ID to update"),
  version: z
    .object({
      number: z
        .number()
        .describe("Version number (must be current version + 1)"),
      message: z
        .string()
        .optional()
        .describe("Optional version comment explaining the changes"),
    })
    .describe(
      "Version information - increment the number from current version"
    ),
  title: z.string().optional().describe("New page title"),
  body: z
    .object({
      representation: z
        .enum(["storage", "atlas_doc_format"])
        .describe(
          "Content format: 'storage' for Confluence storage format, 'atlas_doc_format' for ADF"
        ),
      value: z.string().describe("Page content in the specified format"),
    })
    .optional()
    .describe("Page body content to update"),
  status: z
    .enum(["current", "trashed", "draft", "archived"])
    .optional()
    .describe("New page status"),
  spaceId: z.string().optional().describe("New space ID to move the page to"),
  parentId: z
    .string()
    .optional()
    .describe("New parent page ID to move the page under"),
};

export const CONFLUENCE_TOOLS: MCPToolType[] = [
  {
    name: "get_current_user",
    description:
      "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    inputSchema: zodToJsonSchema(z.object(getCurrentUserSchema)) as JSONSchema7,
  },
  {
    name: "get_spaces",
    description:
      "Get a list of Confluence spaces. Returns a list of spaces with their IDs, keys, names, types, and statuses.",
    inputSchema: zodToJsonSchema(z.object(getSpacesSchema)) as JSONSchema7,
  },
  {
    name: "get_pages",
    description:
      "Search for Confluence pages using CQL (Confluence Query Language). Only returns page objects. Supports flexible text matching: use '~' for contains (title~\"meeting\"), '!~' for not contains, or '=' for exact match. Examples: 'type=page AND space=DEV', 'type=page AND title~\"meeting notes\"', 'type=page AND text~\"quarterly\"', 'type=page AND creator=currentUser()'",
    inputSchema: zodToJsonSchema(z.object(getPagesSchema)) as JSONSchema7,
  },
  {
    name: "get_page",
    description:
      "Get a single Confluence page by its ID. Returns the page metadata and optionally the page body content.",
    inputSchema: zodToJsonSchema(z.object(getPageSchema)) as JSONSchema7,
  },
  {
    name: "create_page",
    description:
      "Create a new Confluence page in a specified space with optional content and parent page.",
    inputSchema: zodToJsonSchema(z.object(createPageSchema)) as JSONSchema7,
  },
  {
    name: "update_page",
    description:
      "Update an existing Confluence page. You can update the title, content, status, space, or parent. The version number must be incremented from the current version.",
    inputSchema: zodToJsonSchema(z.object(updatePageSchema)) as JSONSchema7,
  },
];

export const CONFLUENCE_SERVER_INFO = {
  name: "confluence" as const,
  version: "1.0.0",
  description: "Retrieve page information.",
  authorization: {
    provider: "confluence_tools" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "ConfluenceLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/confluence-tool",
  instructions: null,
};

export const CONFLUENCE_TOOL_STAKES = {
  // Read operations - never ask
  get_current_user: "never_ask",
  get_page: "never_ask",
  get_pages: "never_ask",
  get_spaces: "never_ask",
  // Write operations - ask
  create_page: "low",
  update_page: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
