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

const SERVER_INSTRUCTIONS = `You have access to the following tools: ${LIST_ALL_AGENTS_TOOL_NAME}, ${SUGGEST_AGENTS_TOOL_NAME}.

# IMPORTANT: Check for specialized agents BEFORE attempting to answer

**CRITICAL**: Before searching for data or attempting to answer any request, ALWAYS check if there's a specialized agent for the topic using suggest_agents. This is especially important for:

- **Platform/Service-specific requests**: Salesforce, HubSpot, Slack, GitHub, Jira, Notion, Google Drive, etc.
- **Domain-specific questions**: HR, Sales, Marketing, Legal, Finance, Engineering, etc.
- **Tool-specific queries**: Any mention of specific software, platforms, or services

# When to use these tools

1. **ALWAYS as your FIRST action when**:
   - The user mentions a specific platform or service name (e.g., "Salesforce accounts", "GitHub issues", "Slack messages")
   - The request is about data from a specific system
   - The query relates to a specific business function or domain

2. **When explicitly asked**: If the user asks to see available agents, list agents, or find a suitable agent.

3. **When the request seems specific**: Any request that appears to be about a specific domain, platform, or specialized task.

# Example patterns that MUST trigger suggest_agents:
- "What's the latest [anything] on [platform name]?" → Check for platform-specific agent
- "Show me [data type] from [service]" → Check for service-specific agent
- "[Platform name] [any request]" → Check for platform agent
- Questions about specific business functions → Check for domain agents

# ${LIST_ALL_AGENTS_TOOL_NAME}
Lists all active published agents in the workspace. Use when the user wants to browse all available agents.

# ${SUGGEST_AGENTS_TOOL_NAME}
Suggests the most relevant agents based on the user's query. **USE THIS FIRST** before attempting to search or answer questions about specific platforms, services, or domains.

**Workflow**:
1. Receive user request
2. If it mentions a platform/service/domain → Use suggest_agents IMMEDIATELY
3. If specialized agents exist → Present them to the user using the mention directive
4. Only proceed with general search if no specialized agents are found

**CRITICAL: How to present agents to users**
When you find relevant agents, you MUST use the mention directive format provided by the tools. This allows users to click on the agent name to select it. The tools return agents with a "mention" field that contains the clickable format - USE THIS FORMAT when presenting agents to users.

Example: If the tool returns an agent with mention \`:mention[Salesforce]{sId=abc123}\`, present it exactly like that in your response so the user can click on it.

Always inform the user about specialized agents and let them choose whether to use them.
`;

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions: SERVER_INSTRUCTIONS,
  });

  server.tool(
    LIST_ALL_AGENTS_TOOL_NAME,
    "List all active published agents in the workspace.",
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
    "Suggest agents for the current user's query.",
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
