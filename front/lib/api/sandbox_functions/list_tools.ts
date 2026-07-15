import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  listMCPServerToolsAndServerInstructions,
  makeServerSideMCPConnectionParams,
} from "@app/lib/actions/mcp_actions";
import type { MCPServerViewType, MCPToolType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

// Internal MCP servers are in-memory, but workspaces can expose many views at once.
const SANDBOX_FUNCTION_TOOL_LISTING_CONCURRENCY = 8;

export function makeSandboxFunctionMCPServerConfiguration(
  view: MCPServerViewResource
): ServerSideMCPServerConfigurationType {
  const viewJSON = view.toJSON();

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: viewJSON.name ?? viewJSON.server.name,
    description: viewJSON.description ?? viewJSON.server.description,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: view.sId,
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId: view.internalMCPServerId,
  };
}

/**
 * Returns the tools a sandbox function can call from a server view.
 *
 * This uses the same MCP listing path as the agent loop. Passing no agent-loop context makes
 * internal servers omit context-dependent tools and makes remote servers use cached view tools.
 */
export async function listSandboxFunctionToolsForMCPServerView(
  auth: Authenticator,
  view: MCPServerViewResource
): Promise<Result<MCPToolType[], Error>> {
  const viewJSON = view.toJSON();
  const config = makeSandboxFunctionMCPServerConfiguration(view);
  const toolsResult = await listMCPServerToolsAndServerInstructions(
    auth,
    config,
    null,
    makeServerSideMCPConnectionParams(view),
    {
      cachedTools:
        view.serverType === "remote" ? viewJSON.server.tools : undefined,
    }
  );
  if (toolsResult.isErr()) {
    return toolsResult;
  }

  const availableToolNames = new Set(
    toolsResult.value.tools.map((tool) => tool.originalName)
  );
  return new Ok(
    viewJSON.server.tools.filter((tool) => availableToolNames.has(tool.name))
  );
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
