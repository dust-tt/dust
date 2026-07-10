import type {
  SandboxFunctionMCPApproveExecutionEvent,
  SandboxFunctionToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";

export const SANDBOX_FUNCTION_INVOCATION_STATUSES = ["created"] as const;

export type SandboxFunctionInvocationStatus =
  (typeof SANDBOX_FUNCTION_INVOCATION_STATUSES)[number];

// Lowercase alphanumeric with single hyphen separators (e.g. `greet`, `send-slack-message`).
export const SANDBOX_FUNCTION_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSandboxFunctionSlug(value: unknown): value is string {
  return typeof value === "string" && SANDBOX_FUNCTION_SLUG_REGEX.test(value);
}

export type SandboxFunctionInvocationType = {
  sId: string;
  functionId: string;
  status: SandboxFunctionInvocationStatus;
  createdAt: string;
};

export type SandboxFunctionMCPActionType = {
  sId: string;
  createdAt: number;
  updatedAt: number;

  invocationId: string;
  toolName: string;
  inputs: Record<string, unknown>;
  status: ToolExecutionBaseStatus;
  executionDurationMs: number | null;
};

export type SandboxFunctionInvocationCreatedEvent = {
  type: "sandbox_function_invocation_created";
  created: number;
  invocation: SandboxFunctionInvocationType;
};

export type SandboxFunctionInvocationResultEvent = {
  type: "sandbox_function_invocation_result";
  created: number;
  invocationId: string;
  functionId: string;
  result: unknown;
};

// Published when the invocation failed before producing a result, so listeners settle instead of
// waiting forever.
export type SandboxFunctionInvocationErrorEvent = {
  type: "sandbox_function_invocation_error";
  created: number;
  invocationId: string;
  functionId: string;
  message: string;
};

export type SandboxFunctionInvocationEvent =
  | SandboxFunctionInvocationCreatedEvent
  | SandboxFunctionInvocationResultEvent
  | SandboxFunctionInvocationErrorEvent
  | SandboxFunctionMCPApproveExecutionEvent
  | SandboxFunctionToolPersonalAuthRequiredEvent;

// The events that end an invocation stream: no further event is published after them.
export function isSandboxFunctionInvocationTerminalEvent(
  event: SandboxFunctionInvocationEvent
): boolean {
  return (
    event.type === "sandbox_function_invocation_result" ||
    event.type === "sandbox_function_invocation_error"
  );
}

export type PostSandboxFunctionInvocationRequestBody = {
  input?: unknown;
  context?: {
    frameFileId?: string;
  };
};

export type PostSandboxFunctionInvocationResponseBody = {
  invocation: SandboxFunctionInvocationType;
};
