import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const AGENT_ROUTER_SERVER_NAME = "agent_router" as const;
export const AGENT_ROUTER_ACTION_DESCRIPTION =
  "Tools with access to the published agents of the workspace.";

export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content" as const;

export const AGENT_ROUTER_TOOLS_METADATA = createToolsRecord({
  list_all_published_agents: {
    description:
      "Returns a complete list of all published agents in the workspace. " +
      "Each agent includes its name, description, and mention directive " +
      "(e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link to the agent.",
    schema: {},
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Listing agents",
      done: "List agents",
    },
  },
  suggest_agents_for_content: {
    description:
      "Analyzes a user query and returns relevant specialized agents that might be better " +
      "suited to handling specific requests. The tool uses semantic matching to find agents " +
      "whose capabilities align with the query content. Each suggested agent includes its " +
      "mention directive (e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link, " +
      "along with its description and instructions.",
    schema: {
      userMessage: z.string().describe("The user's message."),
      conversationId: z.string().describe("The conversation id."),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Suggesting agents",
      done: "Suggest agents",
    },
  },
});

export const AGENT_ROUTER_SERVER = {
  serverInfo: {
    name: AGENT_ROUTER_SERVER_NAME,
    version: "1.0.0",
    description: AGENT_ROUTER_ACTION_DESCRIPTION,
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(AGENT_ROUTER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_ROUTER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
