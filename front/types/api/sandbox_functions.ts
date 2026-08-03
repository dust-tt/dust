import type {
  SandboxFunctionMCPApproveExecutionEvent,
  SandboxFunctionToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";
import type { APIErrorType } from "@app/types/error";
import type { JSONSchema7 as JSONSchema } from "json-schema";

export const SANDBOX_FUNCTION_INVOCATION_STATUSES = [
  "created",
  "errored",
  "succeeded",
] as const;

export type SandboxFunctionInvocationStatus =
  (typeof SANDBOX_FUNCTION_INVOCATION_STATUSES)[number];

export const SANDBOX_FUNCTION_USER_IDENTITY_POLICIES = [
  "optional",
  "workspace_user_required",
  "interactive_workspace_user_required",
] as const;

export type SandboxFunctionUserIdentityPolicy =
  (typeof SANDBOX_FUNCTION_USER_IDENTITY_POLICIES)[number];

export const SANDBOX_FUNCTION_INVOCATION_ORIGINS = [
  "interactive_session",
  "delegated",
] as const;

export type SandboxFunctionInvocationOrigin =
  (typeof SANDBOX_FUNCTION_INVOCATION_ORIGINS)[number];

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

// Pod-wide run summary of a function, shown to every pod member. Statuses, timestamps and counts
// only: the invocation payloads stay behind the per-viewer reads.
export type PodFunctionActivityType = {
  lastRunAt: string | null;
  lastRunStatus: SandboxFunctionInvocationStatus | null;
  runCountLastWeek: number;
};

// A pod function as its pod members see it: what it does and what it takes, never its code.
export type PodFunctionType = {
  sId: string;
  slug: string;
  description: string;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  userIdentity: SandboxFunctionUserIdentityPolicy;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  activity: PodFunctionActivityType;
};

// The error of a function's most recent failed run, when the viewer is allowed to see that run.
// Never carries the run's input or result.
export type PodFunctionFailureType = {
  code: string;
  message: string;
  status?: number;
  occurredAt: string;
  origin: SandboxFunctionInvocationOrigin | null;
};

// A published frame of the pod that calls a function.
export type PodFrameReferenceType = {
  fileId: string;
  fileName: string;
};

export type PodFunctionFrameUsageType = {
  functionId: string;
  frames: PodFrameReferenceType[];
};

export type GetPodFunctionsResponseBody = {
  functions: PodFunctionType[];
};

export type GetPodFunctionFrameUsageResponseBody = {
  usage: PodFunctionFrameUsageType[];
};

export type GetPodFunctionLastFailureResponseBody = {
  failure: PodFunctionFailureType | null;
};

export const SANDBOX_FUNCTION_RUNNER_ERROR_CODES = [
  "bad_input",
  "invalid_input",
  "import_failed",
  "threw",
  "bad_return",
  "http_error",
  "invalid_output",
] as const;

// Codes minted by front, for failures that happen outside the runner and therefore have no
// upstream classification to forward.
type SandboxFunctionFrontErrorCode =
  | "invocation_failed"
  | "transport_error"
  | "not_supported";

// A call error code is never re-derived along the way: it is the runner's code, the `type` of the
// API error that failed the call, or one of the front codes above when nothing upstream classified
// the failure. Keeping the original code means a Frame error points at where it came from instead
// of at the layer that relabelled it.
export type SandboxFunctionCallErrorCode =
  | (typeof SANDBOX_FUNCTION_RUNNER_ERROR_CODES)[number]
  | SandboxFunctionFrontErrorCode
  | APIErrorType;

export type SandboxFunctionCallError = {
  code: SandboxFunctionCallErrorCode;
  message: string;
  status?: number;
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

// Published when the invocation cannot produce a valid result, so listeners settle instead of
// waiting forever.
export type SandboxFunctionInvocationErrorEvent = {
  type: "sandbox_function_invocation_error";
  created: number;
  invocationId: string;
  functionId: string;
  error: SandboxFunctionCallError;
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

export type SandboxFunctionInvocationContext = {
  timezone?: string;
};

export type PostSandboxFunctionInvocationRequestBody = {
  input?: unknown;
  context?: SandboxFunctionInvocationContext;
};

export type PostSandboxFunctionInvocationResponseBody = {
  invocation: SandboxFunctionInvocationType;
};
