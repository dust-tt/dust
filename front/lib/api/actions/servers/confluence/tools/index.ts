import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  createPage,
  getCurrentUser,
  getPage,
  listPages,
  listSpaces,
  updatePage,
  withAuth,
} from "@app/lib/api/actions/servers/confluence/helpers";
import { CONFLUENCE_TOOLS_METADATA } from "@app/lib/api/actions/servers/confluence/metadata";
import {
  renderConfluencePage,
  renderConfluencePageList,
  renderConfluenceSpacesList,
} from "@app/lib/api/actions/servers/confluence/rendering";
import { Ok } from "@app/types/shared/result";

export function createConfluenceTools(): ToolDefinition[] {
  const handlers: ToolHandlers<typeof CONFLUENCE_TOOLS_METADATA> = {
    get_current_user: async (_params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await getCurrentUser(baseUrl, accessToken);
          if (result.isErr()) {
            throw new MCPError(`Error getting current user: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      return new Ok([
        {
          type: "text" as const,
          text: "Current user information retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(authResult.result, null, 2),
        },
      ]);
    },

    get_spaces: async (_params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await listSpaces(baseUrl, accessToken);
          if (result.isErr()) {
            throw new MCPError(`Error listing spaces: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      const formattedResults = renderConfluenceSpacesList(
        authResult.result.results,
        {
          hasMore: Boolean(authResult.result._links?.next),
        }
      );
      return new Ok([
        {
          type: "text" as const,
          text: formattedResults,
        },
      ]);
    },

    get_pages: async (params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await listPages(baseUrl, accessToken, params);
          if (result.isErr()) {
            throw new MCPError(`Error listing pages: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      const formattedResults = renderConfluencePageList(
        authResult.result.results,
        {
          hasMore: Boolean(authResult.result._links?.next),
        }
      );
      return new Ok([
        {
          type: "text" as const,
          text: formattedResults,
        },
      ]);
    },

    get_page: async (params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await getPage(
            baseUrl,
            accessToken,
            params.pageId,
            params.includeBody
          );
          if (result.isErr()) {
            throw new MCPError(`Error getting page: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      if (authResult.result === null) {
        return new Ok([
          {
            type: "text" as const,
            text: `Page with ID ${params.pageId} not found`,
          },
        ]);
      }

      const formattedPage = renderConfluencePage(authResult.result, {
        includeBody: params.includeBody ?? false,
      });
      return new Ok([
        {
          type: "text" as const,
          text: formattedPage,
        },
      ]);
    },

    create_page: async (params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await createPage(baseUrl, accessToken, params);
          if (result.isErr()) {
            throw new MCPError(`Error creating page: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      return new Ok([
        { type: "text" as const, text: "Page created successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(authResult.result, null, 2),
        },
      ]);
    },

    update_page: async (params, { authInfo }: ToolHandlerExtra) => {
      const authResult = await withAuth(
        authInfo?.token,
        async (baseUrl, accessToken) => {
          const result = await updatePage(baseUrl, accessToken, params);
          if (result.isErr()) {
            throw new MCPError(`Error updating page: ${result.error}`);
          }
          return result.value;
        }
      );

      if (!authResult.success) {
        return new Ok(authResult.error);
      }

      return new Ok([
        { type: "text" as const, text: "Page updated successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(authResult.result, null, 2),
        },
      ]);
    },
  };

  return buildTools(CONFLUENCE_TOOLS_METADATA, handlers);
}
