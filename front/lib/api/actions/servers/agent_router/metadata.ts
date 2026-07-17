import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const AGENT_ROUTER_SERVER_NAME = "agent_router" as const;
export const AGENT_ROUTER_ACTION_DESCRIPTION =
  "Tools with access to the agents of the workspace.";

export const SUGGEST_AGENTS_TOOL_NAME = "suggest_agents_for_content" as const;

export const AGENT_ROUTER_TOOLS_METADATA = [
  {
    name: "list_all_published_agents",
    description:
      "Return a complete list of all agents accessible to the user in the workspace, " +
      "including their personal (unpublished) agents. " +
      "Each agent includes its name, description, and mention directive " +
      "(e.g., `:mention[agent-name]{sId=xyz}`) to display a clickable link to the agent.",
    schema: {},
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Listing agents",
      done: "List agents",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "suggest_agents_for_content",
    description:
      "Analyze a user query and return relevant specialized agents that might be better " +
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const satisfies readonly InternalMCPToolType[];

export const AGENT_ROUTER_SERVER = {
  serverInfo: {
    name: AGENT_ROUTER_SERVER_NAME,
    version: "1.0.0",
    description: AGENT_ROUTER_ACTION_DESCRIPTION,
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
  },
  tools: AGENT_ROUTER_TOOLS_METADATA,
} as const satisfies ServerMetadata;
