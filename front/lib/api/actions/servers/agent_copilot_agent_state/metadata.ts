import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { MCPToolType } from "@app/lib/api/mcp";

export const AGENT_COPILOT_AGENT_STATE_TOOL_NAME =
  "agent_copilot_agent_state" as const;

// Key used to store the agent configuration version in additionalConfiguration.
export const AGENT_CONFIGURATION_VERSION_KEY = "agentConfigurationVersion";

// Re-export the AGENT_CONFIGURATION_ID_KEY for convenience.
export { AGENT_CONFIGURATION_ID_KEY } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";

export const getAgentInfoMeta = {
  name: "get_agent_info" as const,
  description:
    "Get detailed information about the current agent configuration, including name, description, instructions, model settings, and the IDs of all skills and tools currently used by the agent.",
  schema: {},
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const TOOLS_META = [getAgentInfoMeta];

export const AGENT_COPILOT_AGENT_STATE_TOOLS: MCPToolType[] = TOOLS_META.map(
  (t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })
);

export const AGENT_COPILOT_AGENT_STATE_TOOL_STAKES: Record<
  string,
  MCPToolStakeLevelType
> = Object.fromEntries(TOOLS_META.map((t) => [t.name, t.stake]));

export const AGENT_COPILOT_AGENT_STATE_SERVER_INFO = {
  name: "agent_copilot_agent_state" as const,
  version: "1.0.0",
  description:
    "Retrieve information about the current agent's configuration, including name, description, instructions, model, and tools.",
  authorization: null,
  icon: "ActionRobotIcon" as const,
  documentationUrl: null,
  instructions: null,
};

export const AGENT_COPILOT_AGENT_STATE_SERVER = {
  serverInfo: AGENT_COPILOT_AGENT_STATE_SERVER_INFO,
  tools: AGENT_COPILOT_AGENT_STATE_TOOLS,
  tools_stakes: AGENT_COPILOT_AGENT_STATE_TOOL_STAKES,
} as const satisfies ServerMetadata;
