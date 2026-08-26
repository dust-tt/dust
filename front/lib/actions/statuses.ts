export const TOOL_EXECUTION_FINAL_STATUSES = [
  "succeeded",
  "errored",
  "denied",
] as const;

type ToolExecutionFinalStatus = (typeof TOOL_EXECUTION_FINAL_STATUSES)[number];

// Base lifecycle shared by every MCP tool execution, regardless of context: the tool runs, may be
// blocked awaiting user approval or authentication, and ends succeeded, errored, or denied.
// AgentMCPActionModel and SandboxFunctionMCPActionModel both draw from this vocabulary; the agent
// loop extends it with its scheduling and conversation-interaction states below.
export const TOOL_EXECUTION_BASE_STATUSES = [
  "running",
  "blocked_authentication_required",
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
  "blocked_file_authorization_required",
  "blocked_child_action_input_required",
  "blocked_user_answer_required",
] as const;

export const TOOL_EXECUTION_STATUSES = [
  ...TOOL_EXECUTION_BASE_STATUSES,
  ...TOOL_EXECUTION_AGENT_LOOP_EXTENSION_STATUSES,
] as const;

export type ToolExecutionStatus = (typeof TOOL_EXECUTION_STATUSES)[number];

export function isToolExecutionStatus(
  value: string
): value is ToolExecutionStatus {
  return TOOL_EXECUTION_STATUSES.some((status) => status === value);
}

export const TOOL_EXECUTION_BLOCKED_STATUSES = [
  "blocked_authentication_required",
  "blocked_file_authorization_required",
  "blocked_validation_required",
  "blocked_child_action_input_required",
  "blocked_user_answer_required",
] as const satisfies readonly ToolExecutionStatus[];

type ToolExecutionBlockedStatus =
  (typeof TOOL_EXECUTION_BLOCKED_STATUSES)[number];

export function isToolExecutionStatusFinal(
  state: ToolExecutionStatus
): state is ToolExecutionFinalStatus {
  return TOOL_EXECUTION_FINAL_STATUSES.includes(
    state as ToolExecutionFinalStatus
  );
}

// The final statuses the tool actually ran under. `denied` is final but never executed: the user
// rejected the approval, declined the authentication, or ended the message while the call sat
// blocked. Charges are per invocation, so none of those are charged, while the model tokens spent
// emitting the call are still billed as intelligence through the run usage. `errored` stays
// billable, since the tool was invoked and failed on its own terms.
const TOOL_EXECUTION_BILLABLE_STATUSES = [
  "succeeded",
  "errored",
] as const satisfies readonly ToolExecutionFinalStatus[];

type ToolExecutionBillableStatus =
  (typeof TOOL_EXECUTION_BILLABLE_STATUSES)[number];

export function isToolExecutionStatusBillable(
  state: ToolExecutionStatus
): state is ToolExecutionBillableStatus {
  return TOOL_EXECUTION_BILLABLE_STATUSES.includes(
    state as ToolExecutionBillableStatus
  );
}

export function isToolExecutionStatusBlocked(
  state: ToolExecutionStatus
): state is ToolExecutionBlockedStatus {
  return TOOL_EXECUTION_BLOCKED_STATUSES.includes(
    state as ToolExecutionBlockedStatus
  );
}
