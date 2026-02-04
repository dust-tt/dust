import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const AGENT_COPILOT_AGENT_STATE_TOOL_NAME =
  "agent_copilot_agent_state" as const;

export const AGENT_COPILOT_AGENT_STATE_TOOLS_METADATA = createToolsRecord({
  get_agent_info: {
    description:
      "Get detailed information about the current agent configuration, including name, description, instructions, model settings, and the IDs of all skills and tools currently used by the agent.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting agent info",
      done: "Get agent info",
    },
  },
});

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
  tools: Object.values(AGENT_COPILOT_AGENT_STATE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_COPILOT_AGENT_STATE_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
