import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  makeInternalMCPServer,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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
        const prodCredentials = await prodAPICredentialsForOwner(owner, {
          useLocalInDev: true,
        });
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

        // Fetch the MCPServerView to check if it requires personal authentication.
        // Note: fetchById internally calls init() which loads the underlying server.
        const mcpServerView = await MCPServerViewResource.fetchById(
          auth,
          toolsetId
        );
        if (!mcpServerView) {
          return new Err(new MCPError("Toolset not found", { tracked: false }));
        }

        const serverJson = mcpServerView.toJSON();
        const authorization = serverJson.server.authorization;

        // If the server requires personal OAuth, validate the user has a personal connection.
        if (
          serverJson.oAuthUseCase === "personal_actions" &&
          authorization?.provider
        ) {
          // Check if workspace connection exists (admin setup).
          const workspaceConnectionRes =
            await MCPServerConnectionResource.findByMCPServer(auth, {
              mcpServerId: serverJson.server.sId,
              connectionType: "workspace",
            });

          if (workspaceConnectionRes.isErr()) {
            // Admin hasn't set up the connection yet - return error message.
            return new Err(
              new MCPError(
                `The ${getMcpServerViewDisplayName(serverJson)} tool requires your workspace admin to set up the connection first.`,
                { tracked: false }
              )
            );
          }

          // Check if user has a personal connection.
          const personalConnectionRes =
            await MCPServerConnectionResource.findByMCPServer(auth, {
              mcpServerId: serverJson.server.sId,
              connectionType: "personal",
            });

          if (personalConnectionRes.isErr()) {
            // User needs to authenticate personally - return auth prompt.
            // Pass the server ID so the UI shows the correct server name (not "Toolsets").
            return new Ok(
              makePersonalAuthenticationError(
                authorization.provider,
                authorization.scope,
                serverJson.server.sId
              ).content
            );
          }
        }

        const requestedGroupIds = auth.groups().map((g) => g.sId);
        const prodCredentials = await prodAPICredentialsForOwner(owner, {
          useLocalInDev: true,
        });
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
