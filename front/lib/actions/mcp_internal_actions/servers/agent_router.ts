import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { getHeaderFromGroupIds } from "@app/types/groups";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_router",
  version: "1.0.0",
  description: "Tools with access to the published agents of the workspace.",
  icon: "ActionRobotIcon",
  authorization: null,
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "list_agents",
    "List all active published agents in the workspace, to know which ones are the best suited for the current conversation. the mention directive allows the user to click on the agent name to select it.",
    {},
    async () => {
      const owner = auth.getNonNullableWorkspace();
      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const requestedGroupIds = auth.groups().map((g) => g.sId);
      const api = new DustAPI(
        apiConfig.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: getHeaderFromGroupIds(requestedGroupIds),
        },
        logger
      );

      // We cannot call the internal getAgentConfigurations() here because it causes a circular dependency.
      // Instead, we call the public API endpoint.
      // Since this endpoint is using the workspace credentials we do not have the user and as a result
      // we cannot use the "list" view, meaning we do not have the user's unpublished agents.
      const res = await api.getAgentConfigurations({
        view: "all",
      });
      if (res.isErr()) {
        return {
          isError: true,
          content: [
            { type: "text", text: "Error fetching agent configurations" },
          ],
        };
      }

      const agents = res.value;
      const formattedAgents = agents.map((agent) => {
        return {
          name: agent.name,
          mention: `:mention[${agent.name}]{sId=${agent.sId}}`,
          description: agent.description,
        };
      });

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Published agents successfully fetched",
          },
          {
            type: "text",
            text: JSON.stringify(formattedAgents),
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
