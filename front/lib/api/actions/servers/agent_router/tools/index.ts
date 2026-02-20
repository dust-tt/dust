import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_ROUTER_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_router/metadata";
import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import apiConfig from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationWithInstructionsType } from "@app/types/assistant/agent";
import { getHeaderFromGroupIds } from "@app/types/groups";
import { Err, Ok } from "@app/types/shared/result";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DustAPI } from "@dust-tt/client";

const MAX_INSTRUCTIONS_LENGTH = 1000;

const handlers: ToolHandlers<typeof AGENT_ROUTER_TOOLS_METADATA> = {
  list_all_published_agents: async (_, { auth }) => {
    const owner = auth.getNonNullableWorkspace();
    const requestedGroupIds = auth.groupIds();

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
        let result = `## ${agent.name}\n\n`;
        result += `**Mention:** ${serializeMention(agent)}\n\n`;
        result += `**Description:** ${agent.description}\n`;
        return result;
      })
      .join("\n");

    return new Ok([
      {
        type: "text" as const,
        text: `# Published Agents\n\n${formattedAgents}`,
      },
    ]);
  },

  suggest_agents_for_content: async ({ userMessage }, { auth }) => {
    const owner = auth.getNonNullableWorkspace();
    const requestedGroupIds = auth.groupIds();

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
    const agents =
      getAgentsRes.value as LightAgentConfigurationWithInstructionsType[];

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
            ? instructions.slice(0, MAX_INSTRUCTIONS_LENGTH) + " (truncated)"
            : instructions;

        let result = `## ${agent.name}\n\n`;
        result += `**Mention:** ${serializeMention(agent)}\n\n`;
        result += `**Description:** ${agent.description}\n\n`;
        result += `**Instructions:** ${truncatedInstructions.trim()}\n`;
        return result;
      })
      .join("\n");

    return new Ok([
      {
        type: "text" as const,
        text: `# Suggested Agents\n\n${formattedSuggestedAgents}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(AGENT_ROUTER_TOOLS_METADATA, handlers);
