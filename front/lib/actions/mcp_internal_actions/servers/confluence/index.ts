import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  createPage,
  getCurrentUser,
  getPage,
  listPages,
  listSpaces,
  updatePage,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
import {
  CONFLUENCE_TOOL_NAME,
  createPageSchema,
  getCurrentUserSchema,
  getPageSchema,
  getPagesSchema,
  getSpacesSchema,
  updatePageSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/metadata";
import {
  renderConfluencePage,
  renderConfluencePageList,
  renderConfluenceSpacesList,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("confluence");

  server.tool(
    "get_current_user",
    "Get information about the currently authenticated Confluence user including account ID, display name, and email.",
    getCurrentUserSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await getCurrentUser(baseUrl, accessToken);
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error getting current user: ${result.error}`)
              );
            }
            return new Ok([
              {
                type: "text" as const,
                text: "Current user information retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.value, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_spaces",
    "Get a list of Confluence spaces. Returns a list of spaces with their IDs, keys, names, types, and statuses.",
    getSpacesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await listSpaces(baseUrl, accessToken);
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error listing spaces: ${result.error}`)
              );
            }
            const formattedResults = renderConfluenceSpacesList(
              result.value.results,
              {
                hasMore: Boolean(result.value._links?.next),
              }
            );
            return new Ok([
              {
                type: "text" as const,
                text: formattedResults,
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_pages",
    "Search for Confluence pages using CQL (Confluence Query Language). Only returns page objects. Supports flexible text matching: use '~' for contains (title~\"meeting\"), '!~' for not contains, or '=' for exact match. Examples: 'type=page AND space=DEV', 'type=page AND title~\"meeting notes\"', 'type=page AND text~\"quarterly\"', 'type=page AND creator=currentUser()'",
    getPagesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await listPages(baseUrl, accessToken, params);
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error listing pages: ${result.error}`)
              );
            }
            const formattedResults = renderConfluencePageList(
              result.value.results,
              {
                hasMore: Boolean(result.value._links?.next),
              }
            );
            return new Ok([
              {
                type: "text" as const,
                text: formattedResults,
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_page",
    "Get a single Confluence page by its ID. Returns the page metadata and optionally the page body content.",
    getPageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await getPage(
              baseUrl,
              accessToken,
              params.pageId,
              params.includeBody
            );
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error getting page: ${result.error}`)
              );
            }
            if (result.value === null) {
              return new Ok([
                {
                  type: "text" as const,
                  text: `Page with ID ${params.pageId} not found`,
                },
              ]);
            }
            const formattedPage = renderConfluencePage(result.value, {
              includeBody: params.includeBody ?? false,
            });
            return new Ok([
              {
                type: "text" as const,
                text: formattedPage,
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "create_page",
    "Create a new Confluence page in a specified space with optional content and parent page.",
    createPageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await createPage(baseUrl, accessToken, params);
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error creating page: ${result.error}`)
              );
            }
            return new Ok([
              { type: "text" as const, text: "Page created successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.value, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "update_page",
    "Update an existing Confluence page. You can update the title, content, status, space, or parent. The version number must be incremented from the current version.",
    updatePageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CONFLUENCE_TOOL_NAME,
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        return withAuth({
          action: async (baseUrl, accessToken) => {
            const result = await updatePage(baseUrl, accessToken, params);
            if (result.isErr()) {
              return new Err(
                new MCPError(`Error updating page: ${result.error}`)
              );
            }
            return new Ok([
              { type: "text" as const, text: "Page updated successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.value, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  return server;
}

export default createServer;
