import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const CONFLUENCE_TOOL_NAME = "confluence" as const;

export const CONFLUENCE_TOOLS_METADATA = createToolsRecord({
  get_current_user: {
    description:
      "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting current Confluence user",
      done: "Get current Confluence user",
    },
  },
  get_spaces: {
    description:
      "Get a list of Confluence spaces. Returns a list of spaces with their IDs, keys, names, types, and statuses.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Confluence spaces",
      done: "List Confluence spaces",
    },
  },
  get_pages: {
    description:
      "Search for Confluence pages using CQL (Confluence Query Language). Only returns page objects. " +
      "Text matching operators: '~' contains, '!~' not contains, '=' exact match. " +
      "Common fields: title, text, space (use space key, not name), creator, label. " +
      "Examples: 'type=page AND space=DEV', 'type=page AND title~\"meeting\"', 'type=page AND label=important'",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Confluence pages",
      done: "Search Confluence pages",
    },
  },
  get_page: {
    description:
      "Get a single Confluence page by its ID. Returns the page metadata and optionally the page body content.",
    schema: {
      pageId: z.string().describe("The ID of the page to retrieve"),
      includeBody: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Whether to include the page body content (default: false). When true, returns body in storage format."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Confluence page",
      done: "Retrieve Confluence page",
    },
  },
  create_page: {
    description:
      "Create a new Confluence page in a specified space with optional content and parent page.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Creating Confluence page",
      done: "Create Confluence page",
    },
  },
  update_page: {
    description:
      "Update an existing Confluence page. You can update the title, content, status, space, or parent. The version number must be incremented from the current version.",
    schema: {
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
      spaceId: z
        .string()
        .optional()
        .describe("New space ID to move the page to"),
      parentId: z
        .string()
        .optional()
        .describe("New parent page ID to move the page under"),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Confluence page",
      done: "Update Confluence page",
    },
  },
});

export const CONFLUENCE_SERVER = {
  serverInfo: {
    name: "confluence",
    version: "1.0.0",
    description: "Retrieve page information.",
    authorization: {
      provider: "confluence_tools",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ConfluenceLogo",
    documentationUrl: "https://docs.dust.tt/docs/confluence-tool",
    instructions: null,
  },
  tools: Object.values(CONFLUENCE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(CONFLUENCE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
