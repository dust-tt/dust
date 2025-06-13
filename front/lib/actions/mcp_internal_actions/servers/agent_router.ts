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
import { getHeaderFromGroupIds, getHeaderFromRole } from "@app/types/groups";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_router",
  version: "1.0.0",
  description: "Tools with access to the published agents of the workspace.",
  icon: "ActionRobotIcon",
  authorization: null,
  documentationUrl: null,
};

export const LIST_ALL_AGENTS_TOOL_NAME = "list_all_published_agents";
export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content";

const SERVER_INSTRUCTIONS = `This toolset provides access to specialized agents available in the workspace.
A good usage of these tools is:
- when the user asks for a list of agents or when the user asks for suggestions for an agent.
- when the agent is not able to handle the user's request and tries to suggest an agent that might be able to handle the request.

# Agent Presentation Format
Both tools return agents with a "mention" field containing a clickable format (e.g., \`:mention[AgentName]{sId=abc123}\`). This format allows users to directly select and interact with the suggested agents.

# Specialized Agent Examples
The workspace may contain specialized agents for:
- Platform integrations (Salesforce, Slack, GitHub, etc.)
- Business domains (HR, Sales, Marketing, etc.)
- Specific workflows or processes
`;

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions: SERVER_INSTRUCTIONS,
  });

  server.tool(
    LIST_ALL_AGENTS_TOOL_NAME,
    "Returns a complete list of all published agents in the workspace. Each agent includes: name and description, and a clickable mention format for easy selection",
    {},
    async () => {
      const owner = auth.getNonNullableWorkspace();
      const requestedGroupIds = auth.groups().map((g) => g.sId);

      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const api = new DustAPI(
        apiConfig.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: {
            ...getHeaderFromGroupIds(requestedGroupIds),
            ...getHeaderFromRole(auth.role()),
          },
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
    SUGGEST_AGENTS_TOOL_NAME,
    "Analyzes a user query and returns relevant specialized agents that might be better suited to handle specific requests. The tool uses semantic matching to find agents whose capabilities align with the query content.",
    {
      userMessage: z.string().describe("The user's message."),
      conversationId: z.string().describe("The conversation id."),
    },
    async ({ userMessage }) => {
      const owner = auth.getNonNullableWorkspace();
      const requestedGroupIds = auth.groups().map((g) => g.sId);

      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const api = new DustAPI(
        apiConfig.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: {
            ...getHeaderFromGroupIds(requestedGroupIds),
            ...getHeaderFromRole(auth.role()),
          },
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
