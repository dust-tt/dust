const TOOL_EXECUTION_FINAL_STATUSES = [
  "succeeded",
  "errored",
  "denied",
] as const;

type ToolExecutionFinalStatus = (typeof TOOL_EXECUTION_FINAL_STATUSES)[number];

export const TOOL_EXECUTION_BLOCKED_STATUSES = [
  "blocked_authentication_required",
  "blocked_validation_required",
  "blocked_child_action_input_required",
] as const;

export type ToolExecutionBlockedStatus =
  (typeof TOOL_EXECUTION_BLOCKED_STATUSES)[number];

const TOOL_EXECUTION_TRANSIENT_STATUSES = [
  "ready_allowed_explicitly",
  "ready_allowed_implicitly",
  ...TOOL_EXECUTION_BLOCKED_STATUSES,
  "running",
] as const;

type ToolExecutionTransientStatus =
  (typeof TOOL_EXECUTION_TRANSIENT_STATUSES)[number];

export type ToolExecutionStatus =
  | ToolExecutionFinalStatus
  | ToolExecutionTransientStatus;

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
