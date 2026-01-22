import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getAgentConfigurationIdFromContext,
  getAgentConfigurationVersionFromContext,
} from "@app/lib/api/actions/servers/agent_copilot_agent_state/helpers";
import type { TOOLS_META } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { getAgentInfoMeta } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Err, Ok } from "@app/types";

type AgentCopilotAgentStateToolKey = (typeof TOOLS_META)[number]["name"];

type AgentCopilotAgentStateToolHandlers = {
  [K in AgentCopilotAgentStateToolKey]: (
    params: z.infer<
      z.ZodObject<Extract<(typeof TOOLS_META)[number], { name: K }>["schema"]>
    >,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
};

const handlers: AgentCopilotAgentStateToolHandlers = {
  get_agent_info: async (_, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    const agentVersion = getAgentConfigurationVersionFromContext(
      extra.agentLoopContext
    );

    // Fetch the agent configuration with full details to get the actions.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      agentVersion: agentVersion ?? undefined,
      variant: "full",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    // Get skills associated with this agent.
    const agentSkills = await SkillResource.listByAgentConfiguration(
      auth,
      agentConfiguration
    );

    const agentInfo = {
      sId: agentConfiguration.sId,
      version: agentConfiguration.version,
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      instructions: agentConfiguration.instructions,
      model: {
        providerId: agentConfiguration.model.providerId,
        modelId: agentConfiguration.model.modelId,
        temperature: agentConfiguration.model.temperature,
        reasoningEffort: agentConfiguration.model.reasoningEffort,
      },
      scope: agentConfiguration.scope,
      status: agentConfiguration.status,
      tags: agentConfiguration.tags.map((tag) => ({
        sId: tag.sId,
        name: tag.name,
      })),
      tools: agentConfiguration.actions.map((action) => ({
        sId: action.sId,
        name: action.name,
        description: action.description,
      })),
      skills: agentSkills.map((skill) => ({
        sId: skill.sId,
        name: skill.name,
        userFacingDescription: skill.userFacingDescription,
      })),
    };

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(agentInfo, null, 2),
      },
    ]);
  },
};

export const TOOLS = [
  {
    ...getAgentInfoMeta,
    handler: handlers[getAgentInfoMeta.name],
  },
] as ToolDefinition[];
