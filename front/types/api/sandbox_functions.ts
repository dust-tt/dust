import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type {
  SandboxFunctionMCPApproveExecutionEvent,
  SandboxFunctionToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";
import type { APIErrorType } from "@app/types/error";

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
  "pod_member_required",
  "frame_author_required",
] as const;

export type SandboxFunctionUserIdentityPolicy =
  (typeof SANDBOX_FUNCTION_USER_IDENTITY_POLICIES)[number];

// How an invocation reaches the sandbox.
//
// `durable` runs through a Temporal workflow, which is what a function calling Dust tools needs: a
// tool call can wait on an approval or on personal authentication for as long as the user takes,
// across sandbox stops and restarts.
//
// `fast` is for everything else, and the line is narrower than it sounds. A fast function still
// reads and writes pod state, spawns local binaries, and makes outbound HTTP calls; what it cannot
// do is call a Dust tool through `dsbx tools`, the one thing that can block on a person. The rest
// is merely slow, which the ceiling on an inline invocation covers, so its invocation does not need
// to outlive the request that starts it.
export const SANDBOX_FUNCTION_EXECUTION_MODES = ["fast", "durable"] as const;

export type SandboxFunctionExecutionMode =
  (typeof SANDBOX_FUNCTION_EXECUTION_MODES)[number];

// Functions published before execution modes existed, and publishes that do not opt in, are
// durable: the mode that can do everything. Backs both the column default and the publish default.
export const DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE: SandboxFunctionExecutionMode =
  "durable";

// How much a caller has to approve before a published function runs, for the day a function is
// shared as an MCP tool: `never_ask` runs unattended, `low` asks once and can be always-approved,
// `high` asks on every call.
//
// A subset of MCP_TOOL_STAKE_LEVELS, kept assignable to it so sharing a function needs no
// translation. `medium` is excluded on purpose: it only means anything paired with
// `argumentsRequiringApproval` (which argument values scope the approval), and a published function
// has no way to declare those, so a `medium` function would silently approve on an empty argument
// set.
export const SANDBOX_FUNCTION_STAKES = [
  "never_ask",
  "low",
  "high",
] as const satisfies readonly MCPToolStakeLevelType[];

export type SandboxFunctionStake = (typeof SANDBOX_FUNCTION_STAKES)[number];

// Functions published before stakes existed, and publishes that do not state one, ask once. It is
// the only safe guess for a function nothing has classified: `never_ask` would run an unreviewed
// write unattended, and `high` would nag on a read. Backs both the column default and the publish
// default.
export const DEFAULT_SANDBOX_FUNCTION_STAKE: SandboxFunctionStake = "low";

/**
 * Header a frame host attaches to invocation requests to present the frame's share token. The
 * server grants invocation of the frame's app's functions to workspace members who may view the
 * frame (the token suffices for workspace-visible scopes; invite-only frames also require an
 * active email grant). Lives here (not with the server-side resolver) because the client
 * attaches it too.
 */
export const FRAME_SHARE_TOKEN_HEADER = "x-dust-frame-share-token";

/** Request-header fragment carrying the frame share token, empty when there is none. */
export function frameShareTokenHeader(token?: string): Record<string, string> {
  return token ? { [FRAME_SHARE_TOKEN_HEADER]: token } : {};
}

/**
 * What a validated frame share token authorizes: invoking the published functions of its own app
 * folder in its own pod. Derived server-side by `resolveFrameShareCapability`; grants function
 * resolution only, never reads or writes on the pod.
 */
export type FrameShareCapability = {
  /** sId of the pod the shared frame lives in. */
  podId: string;
  /** Normalized prefix of the frame's app folder — the namespace of the slugs it authorizes. */
  appPrefix: string;
};

export const SANDBOX_FUNCTION_INVOCATION_ORIGINS = [
  "interactive_session",
  "delegated",
] as const;

export type SandboxFunctionInvocationOrigin =
  (typeof SANDBOX_FUNCTION_INVOCATION_ORIGINS)[number];

// One slug segment: lowercase alphanumeric with single hyphen separators (e.g. `greet`,
// `send-slack-message`). A function's own name is a single segment; the app prefix publish derives
// from the source path is another.
const SANDBOX_FUNCTION_SLUG_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX = new RegExp(
  `^${SANDBOX_FUNCTION_SLUG_SEGMENT}$`
);

// A published function's slug: `<appPrefix>__<name>` (e.g. `tasklist__add-task`), where publish
// derives the prefix from the app folder the source lives in. The prefix is optional so slugs
// published before app namespacing existed stay valid.
//
// Stays deliberately stricter than dsbx's own `[A-Za-z0-9_-]+` (is_valid_name in
// cli/dust-sandbox/src/commands/function/mod.rs), which is what lets `<slug>.ts` resolve in the flat
// $DUST_FUNCTIONS_DIR mount without any CLI change.
export const SANDBOX_FUNCTION_SLUG_REGEX = new RegExp(
  `^${SANDBOX_FUNCTION_SLUG_SEGMENT}(?:__${SANDBOX_FUNCTION_SLUG_SEGMENT})?$`
);

// Mirrors DB_NAME_REGEX in cli/dust-sandbox/functions-runner/types/db.ts. Regex values cannot
// be type-checked and front cannot runtime-import cli code; equality is asserted in
// build_on_sandbox.test.ts.
export const SANDBOX_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Pod databases and Frame databases share the dsbx runtime naming contract.
export const POD_DATABASE_NAME_REGEX = SANDBOX_DATABASE_NAME_REGEX;

export function isValidSandboxFunctionSlug(value: unknown): value is string {
  return typeof value === "string" && SANDBOX_FUNCTION_SLUG_REGEX.test(value);
}

export type SandboxFunctionInvocationType = {
  sId: string;
  functionId: string;
  status: SandboxFunctionInvocationStatus;
  createdAt: string;
};

export const SANDBOX_FUNCTION_RUNNER_ERROR_CODES = [
  "bad_input",
  "invalid_input",
  "import_failed",
  "threw",
  "bad_return",
  "http_error",
  "invalid_output",
  // Emitted by the warm server's admission layer when the function is at its
  // concurrency limit and the invocation was refused before anything ran.
  "overloaded",
  // Minted by dsbx's run wrapper when the runner's stdout envelope was cut
  // mid-JSON in transit, so the function ran but its result was lost.
  "output_truncated",
  // Emitted by the runner when the serialized result exceeds the hard size
  // cap; the function must store large data in a pod file or database and
  // return a pointer instead.
  "output_too_large",
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

// The terminal state of an invocation, as returned by the invocation endpoint when the invocation
// settled while the request was still open.
export type SandboxFunctionInvocationOutcome =
  | { status: "succeeded"; result: unknown }
  | { status: "errored"; error: SandboxFunctionCallError };

export type PostSandboxFunctionInvocationResponseBody = {
  invocation: SandboxFunctionInvocationType;
  // Set when the invocation settled before the response was sent. Callers that get an outcome are
  // done; callers that do not must subscribe to the invocation event stream, which replays
  // everything published so far.
  outcome?: SandboxFunctionInvocationOutcome;
};
