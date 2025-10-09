import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  createPage,
  getCurrentUser,
  listPages,
  updatePage,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Err, normalizeError, Ok } from "@app/types";

const createServer = (auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("confluence");

  server.tool(
    "get_current_user",
    "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    {},
    withToolLogging(
      auth,
      { toolName: "get_current_user" },
      async (_, { authInfo }) => {
        try {
          const result = await withAuth({
            action: async (baseUrl, accessToken) => {
              const result = await getCurrentUser(baseUrl, accessToken);
              if (result.isErr()) {
                throw new Error(`Error getting current user: ${result.error}`);
              }
              return makeMCPToolJSONSuccess({
                message: "Current user information retrieved successfully",
                result: result.value,
              });
            },
            authInfo,
          });
          return new Ok(result.content);
        } catch (error) {
          return new Err(
            new MCPError(`Error: ${normalizeError(error).message}`)
          );
        }
      }
    )
    )
  );

  server.tool(
    "get_pages",
    "Search for Confluence pages using CQL (Confluence Query Language). Only returns page objects. Supports flexible text matching: use '~' for contains (title~\"meeting\"), '!~' for not contains, or '=' for exact match. Examples: 'type=page AND space=DEV', 'type=page AND title~\"meeting notes\"', 'type=page AND text~\"quarterly\"', 'type=page AND creator=currentUser()'",
    {
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
    withToolLogging(
      auth,
      { toolName: "get_pages" },
      async (params, { authInfo }) => {
        try {
          const result = await withAuth({
            action: async (baseUrl, accessToken) => {
              const result = await listPages(baseUrl, accessToken, params);
              if (result.isErr()) {
                throw new Error(`Error listing pages: ${result.error}`);
              }
              return makeMCPToolJSONSuccess({
                message:
                  result.value.results.length === 0
                    ? "No pages found"
                    : `Found ${result.value.results.length} page(s)`,
                result: result.value,
              });
            },
            authInfo,
          });
          return new Ok(result.content);
        } catch (error) {
          return new Err(
            new MCPError(`Error: ${normalizeError(error).message}`)
          );
        }
      }
    )
    )
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
    withToolLogging(
      auth,
      { toolName: "create_page" },
      async (params, { authInfo }) => {
        try {
          const result = await withAuth({
            action: async (baseUrl, accessToken) => {
              const result = await createPage(baseUrl, accessToken, params);
              if (result.isErr()) {
                throw new Error(`Error creating page: ${result.error}`);
              }
              return makeMCPToolJSONSuccess({
                message: "Page created successfully",
                result: result.value,
              });
            },
            authInfo,
          });
          return new Ok(result.content);
        } catch (error) {
          return new Err(
            new MCPError(`Error: ${normalizeError(error).message}`)
          );
        }
      }
    )
    )
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
    withToolLogging(
      auth,
      { toolName: "update_page" },
      async (params, { authInfo }) => {
        try {
          const result = await withAuth({
            action: async (baseUrl, accessToken) => {
              const result = await updatePage(baseUrl, accessToken, params);
              if (result.isErr()) {
                throw new Error(`Error updating page: ${result.error}`);
              }
              return makeMCPToolJSONSuccess({
                message: "Page updated successfully",
                result: result.value,
              });
            },
            authInfo,
          });
          return new Ok(result.content);
        } catch (error) {
          return new Err(
            new MCPError(`Error: ${normalizeError(error).message}`)
          );
        }
      }
    )
    )
  );

  return server;
};

export default createServer;
