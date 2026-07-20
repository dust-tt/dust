import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const AGENT_SIDEKICK_AGENT_STATE_TOOLS_METADATA = [
  {
    name: "get_agent_info",
    description:
      "Get detailed information about the current agent configuration, including name, description, instructions, model settings, and the IDs of all skills and tools currently used by the agent.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting agent info",
      done: "Get agent info",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const AGENT_SIDEKICK_AGENT_STATE_SERVER = {
  serverInfo: {
    name: "agent_sidekick_agent_state",
    version: "1.0.0",
    description:
      "Retrieve information about the current agent's configuration, including name, description, instructions, model, and tools.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
  },
  tools: AGENT_SIDEKICK_AGENT_STATE_TOOLS_METADATA,
} as const satisfies ServerMetadata;
