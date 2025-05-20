import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";
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
            text: "List of published agents successfully fetched",
          },
          {
            type: "text",
            text: JSON.stringify(formattedAgents),
          },
        ],
      };
    }
  );

  server.tool(
    "suggest_agents",
    "Suggest agents for the current user's query.",
    {
      userMessage: z.string().describe("The user's message."),
      conversationId: z.string().describe("The conversation id."),
    },
    async ({ userMessage }) => {
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
      const getAgentsRes = await api.getAgentConfigurations({
        view: "all",
      });
      if (getAgentsRes.isErr()) {
        return {
          isError: true,
          content: [
            { type: "text", text: "Error fetching agent configurations" },
          ],
        };
      }
      const agents = getAgentsRes.value as LightAgentConfigurationType[];

      const suggestedAgentsRes = await getSuggestedAgentsForContent(auth, {
        agents,
        content: userMessage,
      });

      if (suggestedAgentsRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error suggesting agents: ${suggestedAgentsRes.error}`,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Suggested agents successfully fetched",
          },
          {
            type: "text",
            text: JSON.stringify(suggestedAgentsRes.value),
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
