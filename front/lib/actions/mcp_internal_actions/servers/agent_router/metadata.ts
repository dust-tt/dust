import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Tool name for monitoring (all tools in this server use the same monitoring name).
export const AGENT_ROUTER_TOOL_NAME = "agent_router" as const;

// Tool names.
export const LIST_ALL_AGENTS_TOOL_NAME = "list_all_published_agents";
export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content";

export const listAllAgentsSchema = {};

export const suggestAgentsSchema = {
  userMessage: z.string().describe("The user's message."),
  conversationId: z.string().describe("The conversation id."),
};

export const AGENT_ROUTER_TOOLS: MCPToolType[] = [
  {
    name: LIST_ALL_AGENTS_TOOL_NAME,
    description:
      "Returns a complete list of all published agents in the workspace. " +
      "Each agent includes its name, description, and mention directive " +
      "(e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link to the agent.",
    inputSchema: zodToJsonSchema(z.object(listAllAgentsSchema)) as JSONSchema,
  },
  {
    name: SUGGEST_AGENTS_TOOL_NAME,
    description:
      "Analyzes a user query and returns relevant specialized agents that might be better " +
      "suited to handling specific requests. The tool uses semantic matching to find agents " +
      "whose capabilities align with the query content. Each suggested agent includes its " +
      "mention directive (e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link, " +
      "along with its description and instructions.",
    inputSchema: zodToJsonSchema(z.object(suggestAgentsSchema)) as JSONSchema,
  },
];

export const AGENT_ROUTER_SERVER_INFO = {
  name: "agent_router" as const,
  version: "1.0.0",
  description: "Tools with access to the published agents of the workspace.",
  authorization: null,
  icon: "ActionRobotIcon" as const,
  documentationUrl: null,
  instructions: null,
};
