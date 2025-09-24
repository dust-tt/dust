import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createPage,
  getCurrentUserWrapper,
  getPage,
  listPages,
  listSpaces,
  updatePage,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

const createServer = (
  _auth?: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("confluence");

  server.tool(
    "list_pages",
    "List pages from Confluence with optional filtering by space, parent, title, or status. When spaceId is provided, uses optimized space-specific endpoint for better performance. Use this tool to discover pages and their IDs.",
    {
      spaceId: z
        .string()
        .optional()
        .describe("Space ID to filter pages by (e.g., '12345')"),
      parentId: z
        .string()
        .optional()
        .describe("Parent page ID to filter child pages"),
      title: z
        .string()
        .optional()
        .describe("Page title to search for (partial match)"),
      status: z
        .enum(["current", "trashed", "draft", "archived"])
        .optional()
        .describe("Page status to filter by (default: current)"),
      sort: z
        .enum(["id", "created-date", "modified-date", "title"])
        .optional()
        .describe("Field to sort results by (default: modified-date)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from previous response for next page"),
      limit: z
        .number()
        .min(1)
        .max(250)
        .optional()
        .default(25)
        .describe("Number of results per page (max 250, default 25)"),
    },
    async (params, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return listPages(baseUrl, accessToken, params);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_current_user",
    "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return getCurrentUserWrapper.execute(baseUrl, accessToken);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_spaces",
    "List Confluence spaces with optional filtering by IDs, keys, type, status, labels, or favorites.",
    {
      ids: z
        .array(z.string())
        .optional()
        .describe("List of space IDs to filter by"),
      keys: z
        .array(z.string())
        .optional()
        .describe("List of space keys to filter by"),
      type: z
        .enum(["global", "personal"])
        .optional()
        .describe("Space type filter"),
      status: z
        .enum(["current", "archived"])
        .optional()
        .describe("Space status filter"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Filter spaces by labels"),
      favourite: z
        .boolean()
        .optional()
        .describe("Filter by favorite spaces"),
      sort: z
        .enum(["id", "key", "name", "created-date", "favourite"])
        .optional()
        .describe("Field to sort results by"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from previous response for next page"),
      limit: z
        .number()
        .min(1)
        .max(250)
        .optional()
        .default(25)
        .describe("Number of results per page (max 250, default 25)"),
    },
    async (params, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return listSpaces(baseUrl, accessToken, params);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_page",
    "Get a specific Confluence page by its ID, optionally including the page body content in various formats.",
    {
      pageId: z.string().describe("The Confluence page ID"),
      includeBody: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include page body content (default: false)"),
    },
    async ({ pageId, includeBody }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return getPage(baseUrl, accessToken, pageId, includeBody);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_page",
    "Create a new Confluence page in a specified space with optional content and parent page.",
    {
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
    async (params, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return createPage(baseUrl, accessToken, params);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_page",
    "Update an existing Confluence page. You can update the title, content, status, space, or parent. The version number must be incremented from the current version.",
    {
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
    async (params, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          return updatePage(baseUrl, accessToken, params);
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
