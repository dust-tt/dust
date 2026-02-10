import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { MODEL_IDS } from "@app/types/assistant/models/models";
import { REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import {
  AGENT_SUGGESTION_KINDS,
  AGENT_SUGGESTION_STATES,
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
} from "@app/types/suggestions/agent_suggestion";

export const AGENT_COPILOT_CONTEXT_TOOL_NAME = "agent_copilot_context" as const;

// Knowledge categories relevant for agent builder (excluding apps, actions, triggers)
const KNOWLEDGE_CATEGORIES = ["managed", "folder", "website"] as const;

// Suggestion tool schemas

const InstructionsSuggestionSchema = z.object({
  analysis: z
    .string()
    .optional()
    .describe("Analysis or reasoning for this specific suggestion"),
  content: z
    .string()
    .describe(
      "The full HTML content for this block, including the tag (e.g., '<p>New text</p>' or '<h2>Section Title</h2>')"
    ),
  targetBlockId: z
    .string()
    .describe("The data-block-id of the block to modify (e.g., '7f3a2b1c')"),
  type: z
    .enum(["replace"])
    .describe("The type of modification to perform on the target block"),
});

const ToolsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]).describe("The action to perform"),
  toolId: z.string().describe("The tool/server identifier"),
});

const SkillsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]).describe("The action to perform"),
  skillId: z.string().describe("The skill identifier"),
});

const ModelSuggestionSchema = z.object({
  modelId: z.enum(MODEL_IDS).describe("The model ID to suggest"),
  reasoningEffort: z
    .enum(REASONING_EFFORTS)
    .optional()
    .describe("Optional reasoning effort level"),
});

export const AGENT_COPILOT_CONTEXT_TOOLS_METADATA = createToolsRecord({
  get_available_knowledge: {
    description:
      "Get the list of available knowledge sources that can be added to an agent. " +
      "Returns a hierarchical structure organized by spaces, with connected data sources, folders, and websites listed under each space. " +
      "Only includes sources accessible to the current user.",
    schema: {
      spaceId: z
        .string()
        .optional()
        .describe(
          "Optional space ID to filter results to a specific space. If not provided, returns knowledge from all accessible spaces."
        ),
      category: z
        .enum(KNOWLEDGE_CATEGORIES)
        .optional()
        .describe(
          "Optional category to filter results. Options: 'managed' (connected data sources like Notion, Slack), 'folder' (custom folders), 'website' (crawled websites). If not provided, returns all categories."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing available knowledge",
      done: "List available knowledge",
    },
  },
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
    displayLabels: {
      running: "Listing available models",
      done: "List available models",
    },
  },
  get_available_skills: {
    description:
      "Get the list of available skills that can be added to agents. Returns skills accessible to the current user across all spaces they have access to.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing available skills",
      done: "List available skills",
    },
  },
  get_available_tools: {
    description:
      "Get the list of available tools (MCP servers) that can be added to agents. Returns tools accessible to the current user.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing available tools",
      done: "List available tools",
    },
  },
  get_available_agents: {
    description:
      "Get the list of available agents that can be used as sub-agents. Returns active agents accessible to the current user, excluding global agents.",
    schema: {
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of agents to return (default: 100)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing available agents",
      done: "List available agents",
    },
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
    displayLabels: {
      running: "Listing agent feedback",
      done: "List agent feedback",
    },
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
    displayLabels: {
      running: "Listing agent insights",
      done: "List agent insights",
    },
  },
  // Suggestion tools
  suggest_prompt_edits: {
    description:
      "Create suggestions to modify the agent's instructions/prompt using block-based targeting. " +
      "The instructions HTML contains blocks with data-block-id attributes (e.g., 'a3f1b20e'). " +
      "Each suggestion targets a specific block by its ID and provides the full replacement HTML for that block. " +
      `Each block ID must appear at most once. For full rewrites, use targetBlockId '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}'. ` +
      "Word-level diffs will be computed and displayed inline. " +
      "IMPORTANT: Include the tool output verbatim in your response - it renders as interactive card(s).",
    schema: {
      suggestions: z
        .array(InstructionsSuggestionSchema)
        .describe(
          "Array of block modifications. Each targets a block by its data-block-id and provides new content. Each suggestion can have its own analysis."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting prompt edits",
      done: "Suggest prompt edits",
    },
  },
  suggest_tools: {
    description:
      "Suggest adding or removing tools from the agent's configuration. " +
      "This tool does not support sub_agent suggestions - use `suggest_sub_agent` instead for that purpose. " +
      "If a pending suggestion for the same tool already exists, it will be automatically marked as outdated. " +
      "IMPORTANT: Include the tool output verbatim in your response - it renders as interactive card.",
    schema: {
      suggestion: ToolsSuggestionSchema.describe(
        "The tool additions and/or deletions to suggest"
      ),
      analysis: z
        .string()
        .optional()
        .describe("Analysis or reasoning for the suggestion"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting tools",
      done: "Suggest tools",
    },
  },
  suggest_sub_agent: {
    description:
      "Suggest adding or removing a sub-agent from the agent's configuration. A sub-agent allows the main agent to delegate tasks to a child agent. " +
      "If a pending suggestion for the same sub-agent already exists, it will be automatically marked as outdated. " +
      "IMPORTANT: Include the tool output verbatim in your response - it renders as interactive card.",
    schema: {
      action: z
        .enum(["add", "remove"])
        .describe(
          "The action to perform: 'add' to add the sub-agent, 'remove' to remove it"
        ),
      subAgentId: z
        .string()
        .describe("The sId of the agent to add or remove as a sub-agent"),
      analysis: z
        .string()
        .optional()
        .describe("Analysis or reasoning for the suggestion"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting sub-agent",
      done: "Suggest sub-agent",
    },
  },
  suggest_skills: {
    description:
      "Suggest adding or removing skills from the agent's configuration. " +
      "If a pending suggestion for the same skill already exists, it will be automatically marked as outdated. " +
      "IMPORTANT: Include the tool output verbatim in your response - it renders as interactive card.",
    schema: {
      suggestion: SkillsSuggestionSchema.describe(
        "The skill additions and/or deletions to suggest"
      ),
      analysis: z
        .string()
        .optional()
        .describe("Analysis or reasoning for the suggestion"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skills",
      done: "Suggest skills",
    },
  },
  suggest_model: {
    description:
      "Suggest changing the agent's LLM model configuration. IMPORTANT: Include the tool output verbatim in your response - it renders as interactive card.",
    schema: {
      suggestion: ModelSuggestionSchema.describe(
        "The model configuration to suggest"
      ),
      analysis: z
        .string()
        .optional()
        .describe("Analysis or reasoning for the suggestion"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting model",
      done: "Suggest model",
    },
  },
  list_suggestions: {
    description:
      "List existing suggestions for the agent's configuration changes.",
    schema: {
      states: z
        .array(z.enum(AGENT_SUGGESTION_STATES))
        .optional()
        .describe(
          `Filter by suggestion states. Options: ${AGENT_SUGGESTION_STATES.join(", ")}. If not provided, returns all states.`
        ),
      kind: z
        .enum(AGENT_SUGGESTION_KINDS)
        .optional()
        .describe(
          `Filter by suggestion type. Options: ${AGENT_SUGGESTION_KINDS.join(", ")}. If not provided, returns all types.`
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(50)
        .describe(
          "Maximum number of suggestions to return. Results are ordered by creation date (most recent first). If not provided, returns all matching suggestions."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing suggestions",
      done: "List suggestions",
    },
  },
  update_suggestions_state: {
    description:
      "Update the state of one or more suggestions. Use this to reject or mark suggestions as outdated.",
    schema: {
      suggestions: z
        .array(
          z.object({
            suggestionId: z
              .string()
              .describe("The sId of the suggestion to update"),
            state: z
              .enum(["rejected", "outdated"])
              .describe(
                "The new state for the suggestion: 'rejected' or 'outdated'."
              ),
          })
        )
        .describe("Array of suggestions to update with their new states"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Updating suggestion state",
      done: "Update suggestion state",
    },
  },
  get_agent_template: {
    description:
      "Fetch template-specific guidance for the current agent. " +
      "Use this tool when the agent was created from a template to retrieve specialized copilotInstructions that define how you should assist with this agent type. " +
      "These instructions may contain domain-specific rules, preferred approaches, or constraints you should follow.",
    schema: {
      templateId: z.string().describe("The sId of the template to retrieve"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching template",
      done: "Fetch template",
    },
  },
  inspect_conversation: {
    description:
      "Inspect a conversation to get its shape and summary. Returns the conversation title, " +
      "a timeline of messages with user messages (content and mentions) and agent messages " +
      "(actions taken, handoffs, status), useful for understanding what happened in a conversation.",
    schema: {
      conversationId: z.string().describe("The conversation to inspect"),
      fromMessageIndex: z
        .number()
        .int()
        .optional()
        .describe("Start timeline from this message index (0-based)"),
      toMessageIndex: z
        .number()
        .int()
        .optional()
        .describe("End timeline at this message index (0-based, exclusive)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Inspecting conversation",
      done: "Inspect conversation",
    },
  },
});

export const AGENT_COPILOT_CONTEXT_SERVER = {
  serverInfo: {
    name: "agent_copilot_context",
    version: "1.0.0",
    description:
      "Retrieve context about available models, skills, tools, and agent-specific feedback and insights. Create and manage suggestions for agent configuration changes.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(AGENT_COPILOT_CONTEXT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_COPILOT_CONTEXT_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
