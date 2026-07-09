import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";

export const SANDBOX_FUNCTION_INVOCATION_STATUSES = ["created"] as const;

export type SandboxFunctionInvocationStatus =
  (typeof SANDBOX_FUNCTION_INVOCATION_STATUSES)[number];

// Lowercase alphanumeric with single hyphen separators (e.g. `greet`, `send-slack-message`).
export const SANDBOX_FUNCTION_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Mirrors DB_NAME_REGEX in cli/dust-sandbox/functions-runner/types/db.ts. Regex values cannot
// be type-checked and front cannot runtime-import cli code; equality is asserted in
// build_on_sandbox.test.ts.
export const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

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
