import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_SIDEKICK_AGENT_STATE_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_agent_state/metadata";
import {
  getAgentConfigurationIdFromContext,
  getAgentConfigurationVersionFromContext,
} from "@app/lib/api/actions/servers/agent_sidekick_helpers";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof AGENT_SIDEKICK_AGENT_STATE_TOOLS_METADATA> =
  {
    get_agent_info: async (_, { auth, runContext }) => {
      const agentConfigurationId = getAgentConfigurationIdFromContext({
        runContext,
      });

      if (!agentConfigurationId) {
        return new Err(
          new MCPError(
            "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
            { tracked: false }
          )
        );
      }

      const agentVersion = getAgentConfigurationVersionFromContext({
        runContext,
      });

      const agent = await AgentResource.fetchById(auth, agentConfigurationId);
      const agentVersionResource =
        agent && agentVersion !== null
          ? await agent.fetchVersion(auth, agentVersion)
          : agent;

      if (
        !agentVersionResource ||
        !agentVersionResource.canViewContent ||
        !auth.can("read", agentVersionResource)
      ) {
        return new Err(
          new MCPError(
            `Agent configuration not found: ${agentConfigurationId}`,
            {
              tracked: false,
            }
          )
        );
      }

      const [{ instructions }, tags, actions, skills] = await Promise.all([
        agentVersionResource.fetchInstructions(),
        agentVersionResource.listTags(auth),
        agentVersionResource.listActions(auth),
        agentVersionResource.listSkills(auth),
      ]);
      const agentInfo = agentVersionResource.toSidekickAgentInfoJSON({
        instructions,
        tags,
        actions,
        skills,
      });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(agentInfo, null, 2),
        },
      ]);
    },
  };

export const TOOLS = buildTools(
  AGENT_SIDEKICK_AGENT_STATE_TOOLS_METADATA,
  handlers
);
