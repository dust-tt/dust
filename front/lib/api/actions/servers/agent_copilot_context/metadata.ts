import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const AGENT_COPILOT_CONTEXT_TOOL_NAME = "agent_copilot_context" as const;

export const AGENT_COPILOT_CONTEXT_TOOLS_METADATA = createToolsRecord({
  get_available_models: {
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
    stake: "never_ask",
  },
  get_available_skills: {
    description:
      "Get the list of available skills that can be added to agents. Returns skills accessible to the current user across all spaces they have access to.",
    schema: {},
    stake: "never_ask",
  },
  get_available_tools: {
    description:
      "Get the list of available tools (MCP servers) that can be added to agents. Returns tools accessible to the current user.",
    schema: {},
    stake: "never_ask",
  },
  get_agent_feedback: {
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
    stake: "never_ask",
  },
  get_agent_insights: {
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
    stake: "never_ask",
  },
});

export const AGENT_COPILOT_CONTEXT_SERVER = {
  serverInfo: {
    name: "agent_copilot_context",
    version: "1.0.0",
    description:
      "Retrieve context about available models, skills, tools, and agent-specific feedback and insights.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(AGENT_COPILOT_CONTEXT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_COPILOT_CONTEXT_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
