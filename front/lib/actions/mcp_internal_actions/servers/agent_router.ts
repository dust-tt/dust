import { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { DEFAULT_AGENT_ROUTER_ACTION_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";
import { Err, Ok } from "@app/types";
import { getHeaderFromGroupIds } from "@app/types/groups";

const MAX_INSTRUCTIONS_LENGTH = 1000;
const LIST_ALL_AGENTS_TOOL_NAME = "list_all_published_agents";
export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(DEFAULT_AGENT_ROUTER_ACTION_NAME);

  server.tool(
    LIST_ALL_AGENTS_TOOL_NAME,
    "Returns a complete list of all published agents in the workspace. " +
      "Each agent includes its name, description, and mention directive " +
      "(e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link to the agent.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_router",
        agentLoopContext,
        enableAlerting: true,
      },
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
          return new Err(new MCPError("Error fetching agent configurations"));
        }

        const agents = res.value;
        const formattedAgents = agents
          .map((agent) => {
            let result = `## ${agent.name}\n`;
            result += `\n**Mention:** ${serializeMention(agent)}`;
            result += `\n**Description:** ${agent.description}`;
            return result;
          })
          .join("\n\n");

        return new Ok([
          {
            type: "text",
            text: `# Published Agents\n\n${formattedAgents}`,
          },
        ]);
      }
    )
  );

  server.tool(
    SUGGEST_AGENTS_TOOL_NAME,
    "Analyzes a user query and returns relevant specialized agents that might be better " +
      "suited to handling specific requests. The tool uses semantic matching to find agents " +
      "whose capabilities align with the query content. Each suggested agent includes its " +
      "mention directive (e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link, " +
      "along with its description and instructions.",
    {
      userMessage: z.string().describe("The user's message."),
      conversationId: z.string().describe("The conversation id."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_router",
        agentLoopContext,
        enableAlerting: true,
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
          return new Err(new MCPError("Error fetching agent configurations"));
        }
        const agents = getAgentsRes.value as LightAgentConfigurationType[];

        const suggestedAgentsRes = await getSuggestedAgentsForContent(auth, {
          agents,
          content: userMessage,
        });

        if (suggestedAgentsRes.isErr()) {
          return new Err(
            new MCPError(`Error suggesting agents: ${suggestedAgentsRes.error}`)
          );
        }

        const formattedSuggestedAgents = suggestedAgentsRes.value
          .filter((agent) => agent.sId !== "dust")
          .map((agent) => {
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const instructions = agent.instructions || "";
            const truncatedInstructions =
              instructions.length > MAX_INSTRUCTIONS_LENGTH
                ? instructions.slice(0, MAX_INSTRUCTIONS_LENGTH) +
                  " (truncated)"
                : instructions;

            let result = `## ${agent.name}\n`;
            result += `\n**Mention:** ${serializeMention(agent)}`;
            result += `\n**Description:** ${agent.description}`;
            result += `\n**Instructions:** ${truncatedInstructions}`;
            return result;
          })
          .join("\n\n");

        return new Ok([
          {
            type: "text",
            text: `# Suggested Agents\n\n${formattedSuggestedAgents}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
