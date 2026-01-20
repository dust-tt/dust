import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { MCPToolType } from "@app/lib/api/mcp";

export const AGENT_COPILOT_CONTEXT_TOOL_NAME = "agent_copilot_context" as const;

// Key used to store the agent configuration ID in additionalConfiguration.
export const AGENT_CONFIGURATION_ID_KEY = "agentConfigurationId";

export const getAvailableModelsMeta = {
  name: "get_available_models" as const,
  description:
    "Get the list of available models. Can optionally filter by provider.",
  schema: {
    providerId: z
      .string()
      .optional()
      .describe(
        "Optional provider ID to filter models (e.g., 'openai', 'anthropic', 'google_ai_studio', 'mistral')"
      ),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getAvailableSkillsMeta = {
  name: "get_available_skills" as const,
  description:
    "Get the list of available skills that can be added to agents. Returns skills accessible to the current user across all spaces they have access to.",
  schema: {},
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getAvailableToolsMeta = {
  name: "get_available_tools" as const,
  description:
    "Get the list of available tools (MCP servers) that can be added to agents. Returns tools accessible to the current user.",
  schema: {},
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getAgentFeedbackMeta = {
  name: "get_agent_feedback" as const,
  description: "Get user feedback for the agent.",
  schema: {
    limit: z
      .number()
      .optional()
      .default(50)
      .describe("Maximum number of feedback items to return (default: 50)"),
    filter: z
      .enum(["active", "all"])
      .optional()
      .default("active")
      .describe(
        "Filter type: 'active' for non-dismissed feedback only (default), 'all' for all feedback"
      ),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getAgentInsightsMeta = {
  name: "get_agent_insights" as const,
  description:
    "Get insight and analytics data for the agent, including the number of active users, " +
    "the conversation and message counts, and the feedback statistics.",
  schema: {
    days: z
      .number()
      .optional()
      .default(30)
      .describe("Number of days to include in the analysis (default: 30)"),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const TOOLS_META = [
  getAvailableModelsMeta,
  getAvailableSkillsMeta,
  getAvailableToolsMeta,
  getAgentFeedbackMeta,
  getAgentInsightsMeta,
];

export const AGENT_COPILOT_CONTEXT_TOOLS: MCPToolType[] = TOOLS_META.map(
  (t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })
);

export const AGENT_COPILOT_CONTEXT_TOOL_STAKES: Record<
  string,
  MCPToolStakeLevelType
> = Object.fromEntries(TOOLS_META.map((t) => [t.name, t.stake]));

export const AGENT_COPILOT_CONTEXT_SERVER_INFO = {
  name: "agent_copilot_context" as const,
  version: "1.0.0",
  description:
    "Retrieve context about available models, skills, tools, and agent-specific feedback and insights.",
  authorization: null,
  icon: "ActionRobotIcon" as const,
  documentationUrl: null,
  instructions: null,
};

export const AGENT_COPILOT_CONTEXT_SERVER = {
  serverInfo: AGENT_COPILOT_CONTEXT_SERVER_INFO,
  tools: AGENT_COPILOT_CONTEXT_TOOLS,
  tools_stakes: AGENT_COPILOT_CONTEXT_TOOL_STAKES,
} as const satisfies ServerMetadata;
