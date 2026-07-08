const TOOL_EXECUTION_FINAL_STATUSES = [
  "succeeded",
  "errored",
  "denied",
] as const;

type ToolExecutionFinalStatus = (typeof TOOL_EXECUTION_FINAL_STATUSES)[number];

// Base lifecycle shared by every MCP tool execution, regardless of context: the tool runs, may be
// blocked awaiting user approval, and ends succeeded, errored, or denied. AgentMCPActionModel and
// SandboxFunctionMCPActionModel both draw from this vocabulary; the agent loop extends it with its
// scheduling and conversation-interaction states below.
export const TOOL_EXECUTION_BASE_STATUSES = [
  "running",
  "blocked_validation_required",
  ...TOOL_EXECUTION_FINAL_STATUSES,
] as const;

export type ToolExecutionBaseStatus =
  (typeof TOOL_EXECUTION_BASE_STATUSES)[number];

// The agent loop's extension over the base lifecycle: batch scheduling within a step (ready_*)
// and conversation interactions the action can be parked on (the other blocked_*).
const TOOL_EXECUTION_AGENT_LOOP_EXTENSION_STATUSES = [
  "ready_allowed_explicitly",
  "ready_allowed_implicitly",
  "blocked_authentication_required",
  "blocked_file_authorization_required",
  "blocked_child_action_input_required",
  "blocked_user_answer_required",
] as const;

export type ToolExecutionStatus =
  | ToolExecutionBaseStatus
  | (typeof TOOL_EXECUTION_AGENT_LOOP_EXTENSION_STATUSES)[number];

export const TOOL_EXECUTION_BLOCKED_STATUSES = [
  "blocked_authentication_required",
  "blocked_file_authorization_required",
  "blocked_validation_required",
  "blocked_child_action_input_required",
  "blocked_user_answer_required",
] as const satisfies readonly ToolExecutionStatus[];

export type ToolExecutionBlockedStatus =
  (typeof TOOL_EXECUTION_BLOCKED_STATUSES)[number];

const TOOL_EXECUTION_TRANSIENT_STATUSES = [
  "ready_allowed_explicitly",
  "ready_allowed_implicitly",
  ...TOOL_EXECUTION_BLOCKED_STATUSES,
  "running",
] as const satisfies readonly ToolExecutionStatus[];

type ToolExecutionTransientStatus =
  (typeof TOOL_EXECUTION_TRANSIENT_STATUSES)[number];

export function isToolExecutionStatusFinal(
  state: ToolExecutionStatus
): state is ToolExecutionFinalStatus {
  return TOOL_EXECUTION_FINAL_STATUSES.includes(
    state as ToolExecutionFinalStatus
  );
}

export function isToolExecutionStatusTransient(
  state: ToolExecutionStatus
): state is ToolExecutionTransientStatus {
  return TOOL_EXECUTION_TRANSIENT_STATUSES.includes(
    state as ToolExecutionTransientStatus
  );
}

export function isToolExecutionStatusBlocked(
  state: ToolExecutionStatus
): state is ToolExecutionBlockedStatus {
  return TOOL_EXECUTION_BLOCKED_STATUSES.includes(
    state as ToolExecutionBlockedStatus
  );
}
