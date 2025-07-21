import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
} from "@app/lib/actions/constants";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";
import { getHeaderFromGroupIds, getHeaderFromRole } from "@app/types/groups";

const serverInfo: InternalMCPServerDefinitionType = {
  name: DEFAULT_AGENT_ROUTER_ACTION_NAME,
  version: "1.0.0",
  description: DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  icon: "ActionRobotIcon",
  authorization: null,
  documentationUrl: null,
};

const MAX_INSTRUCTIONS_LENGTH = 1000;
const LIST_ALL_AGENTS_TOOL_NAME = "list_all_published_agents";
export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content";

const SERVER_INSTRUCTIONS = `These tools provide discoverability to published agents available in the workspace.
The tools return agents with their "mention" markdown directive.
The directive should be used to display a clickable version of the agent name in the response.`;

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions: SERVER_INSTRUCTIONS,
  });

  server.tool(
    LIST_ALL_AGENTS_TOOL_NAME,
    "Returns a complete list of all published agents in the workspace.",
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
        return makeMCPToolTextError("Error fetching agent configurations");
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
    "Analyzes a user query and returns relevant specialized agents that might be better " +
      "suited to handling specific requests. The tool uses semantic matching to find agents " +
      "whose capabilities align with the query content.",
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
        return makeMCPToolTextError("Error fetching agent configurations");
      }
      const agents = getAgentsRes.value as LightAgentConfigurationType[];

      const suggestedAgentsRes = await getSuggestedAgentsForContent(auth, {
        agents,
        content: userMessage,
      });

      if (suggestedAgentsRes.isErr()) {
        return makeMCPToolTextError(
          `Error suggesting agents: ${suggestedAgentsRes.error}`
        );
      }

      const suggestedAgents = suggestedAgentsRes.value;
      const formattedSuggestedAgents = suggestedAgents
        .filter((agent) => agent.sId !== "dust")
        .map((agent) => {
          const instructions = agent.instructions || "";
          const truncatedInstructions =
            instructions.length > MAX_INSTRUCTIONS_LENGTH
              ? instructions.slice(0, MAX_INSTRUCTIONS_LENGTH) + " (truncated)"
              : instructions;

          return {
            mention: `:mention[${agent.name}]{sId=${agent.sId}}`,
            description: agent.description,
            instructions: truncatedInstructions,
          };
        });

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Suggested agents successfully fetched",
          },
          {
            type: "text",
            text: JSON.stringify(formattedSuggestedAgents),
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
