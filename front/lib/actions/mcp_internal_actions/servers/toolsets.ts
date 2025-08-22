import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { getHeaderFromGroupIds, getHeaderFromRole, Ok } from "@app/types";

export const TOOLSETS_FILESYSTEM_SERVER_NAME = "toolsets";

const serverInfo: InternalMCPServerDefinitionType = {
  name: TOOLSETS_FILESYSTEM_SERVER_NAME,
  version: "1.0.0",
  description:
    "Comprehensive navigation toolkit for browsing Toolsets available. Toolsets provides functions for the agent to use.",
  authorization: null,
  icon: "ActionLightbulbIcon",
  documentationUrl: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer(serverInfo);

  server.tool(
    "list",
    "List the available toolsets with their names and descriptions. This is like using 'ls' in Unix.",
    {},
    withToolLogging(auth, { toolName: "list", agentLoopContext }, async () => {
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
            ...getHeaderFromRole(auth.role()),
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
            !mcpServerViewIdsFromAgentConfiguration.includes(mcpServerView.sId)
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
    })
  );

  return server;
};

export default createServer;
