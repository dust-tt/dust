import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";

export const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes.

export const RUN_AGENT_CALL_TOOL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes.

export const RETRY_ON_INTERRUPT_MAX_ATTEMPTS = 15;

// Stored in a separate file to prevent a circular dependency issue.

// Use top_k of 768 as 512 worked really smoothly during initial tests. Might update to 1024 in the
// future based on user feedback.
export const PROCESS_ACTION_TOP_K = 768;

// If we have actions that are used in global agents, we define the name and description of the action
// (<=> of the internal MCP server) here and use it from here in both the internal MCP server
// and `global_agents.ts`.

export const DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME =
  "query_conversation_tables";

export const DEFAULT_CONVERSATION_SEARCH_ACTION_NAME = "conversation_files";

export const DEFAULT_PROJECT_SEARCH_ACTION_NAME =
  "project_context_and_conversations";

export const DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY =
  "__dust_conversation_history";

export const ENABLE_SKILL_TOOL_NAME = "enable_skill";

export const DEFAULT_MCP_ACTION_NAME = "mcp";
export const DEFAULT_MCP_ACTION_VERSION = "1.0.0";
export const DEFAULT_MCP_ACTION_DESCRIPTION =
  "Call a tool to answer a question.";

export const TOOL_NAME_SEPARATOR = "__";

export const MCP_TOOL_STAKE_LEVELS = [
  "high",
  "medium",
  "low",
  "never_ask",
] as const;
export type MCPToolStakeLevelType = (typeof MCP_TOOL_STAKE_LEVELS)[number];

export const FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL =
  "never_ask" as const;
export const FALLBACK_MCP_TOOL_STAKE_LEVEL = "high" as const;

export const DEFAULT_CLIENT_SIDE_MCP_TOOL_STAKE_LEVEL = "low" as const;

export const MCP_VALIDATION_OUTPUTS = [
  "approved",
  "rejected",
  "always_approved",
] as const;
export type MCPValidationOutputType = (typeof MCP_VALIDATION_OUTPUTS)[number];

export type MCPValidationMetadataType = {
  toolName: string;
  mcpServerName: string;
  agentName: string;
  pubsubMessageId?: string;
  icon?: InternalAllowedIconType | CustomResourceIconType;
};
