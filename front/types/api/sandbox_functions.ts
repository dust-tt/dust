import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
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

export type SandboxFunctionInvocationEvent =
  | SandboxFunctionInvocationCreatedEvent
  | SandboxFunctionInvocationResultEvent
  | SandboxFunctionMCPApproveExecutionEvent;

export type PostSandboxFunctionInvocationRequestBody = {
  input?: unknown;
  context?: {
    frameFileId?: string;
  };
};

export type PostSandboxFunctionInvocationResponseBody = {
  invocation: SandboxFunctionInvocationType;
};
