import type { CoreAPIError } from "@app/types/core/core_api";
import type { APIError } from "@app/types/error";

export class MCPServerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class RemoteMCPServerError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function isRemoteMCPServerError(
  error: Error
): error is RemoteMCPServerError {
  return error instanceof RemoteMCPServerError;
}

export class MCPError extends Error {
  // Whether the error should be tracked and reported on our observability stack. Defaults to
  // false: tool errors are overwhelmingly driven by user data or model-generated inputs and
  // are not actionable on our side. Failures that ARE actionable alert through other
  // channels regardless of this flag: provider 5xx (throw `ProviderError` from the API
  // client) and uncaught exceptions (report + rethrow in `withToolLogging`). Set
  // `tracked: true` only for failures we should investigate that neither channel can catch.
  public readonly tracked: boolean;
  public readonly code?: number;

  constructor(
    message: string,
    {
      tracked = false,
      code,
      cause,
    }: { tracked?: boolean; code?: number; cause?: Error | APIError } = {}
  ) {
    super(message, { cause });
    this.tracked = tracked;
    this.code = code;
  }
}

export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

/**
 * Thrown by tool API clients when the service a tool depends on fails unexpectedly: HTTP
 * 5xx-class responses, provider SDK internal errors, unreachable Dust infra. Caught in
 * `withToolLogging` and surfaced as a tracked `MCPError`, so it reaches our observability
 * stack regardless of the tool's error-tracking defaults.
 *
 * Must not be used for failures driven by user input or configuration (4xx-class responses,
 * invalid queries, permission errors) nor for arbitrary user-provided endpoints (e.g.
 * http_client URLs): those are not actionable on our side.
 */
export class ProviderError extends Error {
  public readonly status?: number;

  constructor(
    message: string,
    { status, cause }: { status?: number; cause?: Error } = {}
  ) {
    super(message, { cause });
    this.status = status;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/**
 * Throws a `ProviderError` when a `CoreAPIError` is an unexpected core failure (core uses the
 * `internal_server_error` code for its 500s). All other codes are request/data-driven and must
 * keep their local handling: call this before converting the error at the call site.
 */
export function throwOnCoreAPIInternalError(error: CoreAPIError): void {
  if (error.code === "internal_server_error") {
    throw new ProviderError("CoreAPI returned an unexpected error.", {
      cause: new Error(error.message),
    });
  }
}

/**
 * Throws a `ProviderError` when a Dust API error is an unexpected front failure (front uses the
 * `internal_server_error` type for its 500s). All other types are request/user/config-driven and
 * must keep their local handling: call this before converting the error at the call site.
 *
 * Accepts both the `@dust-tt/client` and the front `APIError` shapes structurally.
 */
export function throwOnDustAPIInternalError(error: {
  type: string;
  message: string;
}): void {
  if (error.type === "internal_server_error") {
    throw new ProviderError("Dust API returned an unexpected error.", {
      cause: new Error(error.message),
    });
  }
}
