import type {
  CustomServerIconType,
  InternalAllowedIconType,
} from "@app/lib/actions/mcp_icons";

export const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes.

export const RETRY_ON_INTERRUPT_MAX_ATTEMPTS = 15;

// Stored in a separate file to prevent a circular dependency issue.

// Use top_k of 768 as 512 worked really smoothly during initial tests. Might update to 1024 in the
// future based on user feedback.
export const PROCESS_ACTION_TOP_K = 768;

// If we have actions that are used in global agents, we define the name and description of the action
// (<=> of the internal MCP server) here and use it from here in both the internal MCP server
// and `global_agents.ts`.

export const DEFAULT_WEBSEARCH_ACTION_NAME = "web_search_&_browse";
export const DEFAULT_WEBSEARCH_ACTION_DESCRIPTION =
  "Agent can search (Google) and retrieve information from specific websites.";

export const DEFAULT_AGENT_ROUTER_ACTION_NAME = "agent_router";
export const DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION =
  "Tools with access to the published agents of the workspace.";

export const DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME = "list_files";

export const DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME = "include_file";

export const DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME =
  "query_conversation_tables";

export const DEFAULT_CONVERSATION_SEARCH_ACTION_NAME =
  "search_conversation_files";

export const DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY =
  "__dust_conversation_history";

export const DEFAULT_DATA_VISUALIZATION_NAME = "data_visualization";
export const DEFAULT_DATA_VISUALIZATION_DESCRIPTION =
  "Generate a data visualization.";

export const DEFAULT_MCP_ACTION_NAME = "mcp";
export const DEFAULT_MCP_ACTION_VERSION = "1.0.0";
export const DEFAULT_MCP_ACTION_DESCRIPTION =
  "Call a tool to answer a question.";

export const CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS = ["high", "low"] as const;
export type CustomRemoteMCPToolStakeLevelType =
  (typeof CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS)[number];
export const MCP_TOOL_STAKE_LEVELS = [
  ...CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS,
  "never_ask",
] as const;
export type MCPToolStakeLevelType = (typeof MCP_TOOL_STAKE_LEVELS)[number];

export const FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL =
  "never_ask" as const;
export const FALLBACK_MCP_TOOL_STAKE_LEVEL = "high" as const;

export const DEFAULT_CLIENT_SIDE_MCP_TOOL_STAKE_LEVEL = "low" as const;

const MCP_VALIDATION_OUTPUTS = [
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
  icon?: InternalAllowedIconType | CustomServerIconType;
};
