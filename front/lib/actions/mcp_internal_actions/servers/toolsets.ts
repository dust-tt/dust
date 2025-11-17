import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { Err, getHeaderFromGroupIds, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("toolsets");

  server.tool(
    "list",
    "List the available toolsets with their names and descriptions. This is like using 'ls' in Unix.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "list_toolsets", agentLoopContext },
      async () => {
        const mcpServerViewIdsFromAgentConfiguration =
          agentLoopContext?.runContext?.agentConfiguration.actions
            .filter(isServerSideMCPServerConfiguration)
            .map((action) => action.mcpServerViewId) ?? [];

        const owner = auth.getNonNullableWorkspace();
        const requestedGroupIds = auth.groups().map((g) => g.sId);
        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const config = apiConfig.getDustAPIConfig();
        const api = new DustAPI(
          config,
          {
            ...prodCredentials,
            extraHeaders: {
              ...getHeaderFromGroupIds(requestedGroupIds),
            },
          },
          logger,
          config.nodeEnv === "development" ? "http://localhost:3000" : null
        );
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const r = await api.getMCPServerViews(globalSpace.sId, true);
        if (r.isErr()) {
          throw new Error(r.error.message);
        }

        const mcpServerViews = r.value
          .filter(
            (mcpServerView) =>
              !mcpServerViewIdsFromAgentConfiguration.includes(
                mcpServerView.sId
              )
          )
          .filter(
            (mcpServerView) =>
              getMCPServerRequirements(mcpServerView).noRequirement
          )
          .filter(
            (mcpServerView) =>
              mcpServerView.server.availability !== "auto_hidden_builder"
          );

        return new Ok(
          mcpServerViews.map((mcpServerView) => ({
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOLSET_LIST_RESULT,
              uri: "",
              id: mcpServerView.sId,
              text: getMcpServerViewDisplayName(mcpServerView),
              description: getMcpServerViewDescription(mcpServerView),
            },
          }))
        );
      }
    )
  );

  server.tool(
    "enable",
    "Enable a toolset for this conversation.",
    {
      toolsetId: z.string(),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "enable_toolset", agentLoopContext },
      async ({ toolsetId }) => {
        const conversationId = agentLoopContext?.runContext?.conversation.sId;
        if (!conversationId) {
          return new Err(
            new MCPError("No active conversation context", { tracked: false })
          );
        }

        const owner = auth.getNonNullableWorkspace();
        const user = auth.user();
        if (!user) {
          return new Err(new MCPError("User not found", { tracked: false }));
        }

        const requestedGroupIds = auth.groups().map((g) => g.sId);
        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const config = apiConfig.getDustAPIConfig();

        const api = new DustAPI(
          config,
          {
            ...prodCredentials,
            extraHeaders: {
              ...getHeaderFromGroupIds(requestedGroupIds),
              "x-api-user-email": user.email,
            },
          },
          logger,
          config.nodeEnv === "development" ? "http://localhost:3000" : null
        );

        const res = await api.postConversationTools({
          conversationId,
          action: "add",
          mcpServerViewId: toolsetId,
        });

        if (res.isErr() || !res.value.success) {
          return new Err(
            new MCPError(`Failed to enable toolset`, {
              tracked: false,
            })
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Successfully enabled toolset ${toolsetId}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
