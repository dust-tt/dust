import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";

export const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes.

export const RUN_AGENT_CALL_TOOL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes.

// Default and maximum timeout the model can request for a single sandbox bash
// command. The value is enforced in-container by the `timeout` wrapper (see
// `wrapCommandWithCapture`), which kills the command and returns the captured
// output when it overruns.
export const SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS = 60 * 1000;
export const SANDBOX_MAX_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

// Extra time we add on top of a command's in-container timeout to set the
// timeout we give the sandbox provider. The in-container `timeout` wrapper
// stops the command and returns whatever output it has; this extra time lets
// that finish and reach us before the provider gives up. A few seconds is
// plenty (it only covers stopping the command and sending its output back).
export const SANDBOX_EXEC_TIMEOUT_BUFFER_MS = 10 * 1000;

// Outer MCP request deadline for the sandbox server. It must be strictly
// greater than the max in-container command timeout so the graceful
// in-container timeout (which returns partial output) always fires before the
// MCP layer hard-aborts the call. The buffer covers process teardown, output
// flushing, and the host round-trip.
const SANDBOX_MCP_TIMEOUT_BUFFER_MS = 30 * 1000;
export const SANDBOX_MCP_REQUEST_TIMEOUT_MS =
  SANDBOX_MAX_COMMAND_TIMEOUT_MS + SANDBOX_MCP_TIMEOUT_BUFFER_MS;

// Time reserved inside the tool activity for the work surrounding the MCP call:
// action setup and tool result processing, which can take minutes on large
// outputs (see `processToolResults`).
export const TOOL_RESULT_PROCESSING_BUDGET_MS = 5 * 60 * 1000;

// Start-to-close for the Temporal tool activities: the longest MCP deadline any
// tool can hold, plus the processing budget. Tool activities are not retried, so
// blowing this budget loses the tool call instead of returning partial output.
export const TOOL_ACTIVITY_START_TO_CLOSE_TIMEOUT_MS =
  Math.max(
    RUN_AGENT_CALL_TOOL_TIMEOUT_MS,
    DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    SANDBOX_MCP_REQUEST_TIMEOUT_MS
  ) + TOOL_RESULT_PROCESSING_BUDGET_MS;

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

export const DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY =
  "__dust_conversation_history";

export const ENABLE_SKILL_TOOL_NAME = "enable_skill";

export const DEFAULT_MCP_SERVER_ICON = "ActionCommand1Icon" as const;

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
  // Deprecated (2026-07-09): no longer read by any client, but still required at parse time by
  // already-deployed CLI and extension versions. Typed as the literal to force emit sites to the
  // placeholder constant; remove the field entirely once old clients have cycled out.
  agentName: "agent";
  pubsubMessageId?: string;
  icon?: InternalAllowedIconType | CustomResourceIconType;
  displayedAs?: "agent" | "server";
};
