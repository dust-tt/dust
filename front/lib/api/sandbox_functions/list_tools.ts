import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType, MCPToolType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

// Internal MCP servers are in-memory, but workspaces can expose many views at once.
const SANDBOX_FUNCTION_TOOL_LISTING_CONCURRENCY = 8;

/**
 * Returns the tools a sandbox function can call from a server view.
 *
 * Remote server tools stay on their cached view metadata so listing functions never fan out to
 * third-party servers. Internal servers are listed live with a conversation-free context, which
 * lets their normal registration path remove tools that require an agent loop.
 */
export async function listSandboxFunctionToolsForMCPServerView(
  auth: Authenticator,
  view: MCPServerViewResource
): Promise<Result<MCPToolType[], Error>> {
  const viewJSON = view.toJSON();

  switch (view.serverType) {
    case "remote":
      return new Ok(viewJSON.server.tools);
    case "internal": {
      const connectionResult = await connectToMCPServer(auth, {
        params: {
          type: "mcpServerId",
          mcpServerId: view.mcpServerId,
          oAuthUseCase: viewJSON.oAuthUseCase,
        },
        toolContext: {
          listToolsContext: { contextType: "sandbox_function" },
        },
      });
      if (connectionResult.isErr()) {
        return new Err(connectionResult.error);
      }

      const mcpClient: Client = connectionResult.value;
      try {
        const toolsResult = await mcpClient.listTools();
        const availableToolNames = new Set(
          toolsResult.tools.map((tool) => tool.name)
        );

        return new Ok(
          viewJSON.server.tools.filter((tool) =>
            availableToolNames.has(tool.name)
          )
        );
      } catch (error) {
        // McpServer only installs the tools/list handler once at least one tool is registered.
        // A sandbox-function context can legitimately filter every tool from an internal server.
        if (
          error instanceof McpError &&
          error.code === ErrorCode.MethodNotFound
        ) {
          return new Ok([]);
        }
        return new Err(normalizeError(error));
      } finally {
        try {
          await mcpClient.close();
        } catch (error) {
          logger.warn(
            {
              err: normalizeError(error),
              mcpServerId: view.mcpServerId,
              mcpServerViewId: view.sId,
            },
            "Failed to close sandbox function MCP listing client"
          );
        }
      }
    }
    default:
      return assertNever(view.serverType);
  }
}

export async function listSandboxFunctionMCPServerViews(
  auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<MCPServerViewType[]> {
  // Invocation tokens are read-only: do not materialize missing automatic views here.
  const views = await MCPServerViewResource.listBySpaceIds(auth, [spaceId], {
    includeGlobalSpace: true,
  });
  const owner = auth.getNonNullableWorkspace();

  const serverViews = await concurrentExecutor(
    views,
    async (view): Promise<MCPServerViewType | null> => {
      const toolsResult = await listSandboxFunctionToolsForMCPServerView(
        auth,
        view
      );
      if (toolsResult.isErr()) {
        logger.warn(
          {
            err: toolsResult.error,
            mcpServerId: view.mcpServerId,
            mcpServerViewId: view.sId,
            workspaceId: owner.sId,
          },
          "Failed to list MCP server tools for a sandbox function"
        );
        return null;
      }

      if (toolsResult.value.length === 0) {
        return null;
      }

      const serializedView = view.toJSON();
      return {
        ...serializedView,
        server: {
          ...serializedView.server,
          tools: toolsResult.value,
        },
      };
    },
    { concurrency: SANDBOX_FUNCTION_TOOL_LISTING_CONCURRENCY }
  );

  return removeNulls(serverViews);
}
