// Typed client for calling workspace tools (MCP servers) from pod function
// code.
//
// `tools.call(server, tool, args)` POSTs `sandbox/actions/call` with the
// arguments as a real JSON object and polls `sandbox/actions/{aId}` until the
// action completes, mirroring the dsbx CLI transport (src/api/client.rs)
// without shelling out: no argv size limits, no scalar coercion, no stdout
// parsing, and the wait is async so a resident worker serving concurrent
// invocations is never blocked on a child process.
//
// Auth and routing come from the invocation environment (DUST_API_URL is
// workspace-scoped, DUST_SANDBOX_TOKEN is minted per invocation), read through
// podEnv() so concurrent invocations in one process stay isolated.
//
// Tool outputs above front's offload threshold arrive as a truncated snippet
// block plus an archive pointer into the pod filesystem. text()/json() return
// the blocks as delivered; transparent archive resolution will build on the
// resolveToolTextContent helper once it lands in this package.

import { z } from "zod";

import { podEnv } from "./context.ts";

export const TOOLS_API_URL_ENV = "DUST_API_URL";
export const TOOLS_SANDBOX_TOKEN_ENV = "DUST_SANDBOX_TOKEN";

// Poll cadence mirrors the dsbx CLI client (src/api/client.rs): 500 ms
// interval, 10-minute hard cap so a wedged action cannot pin an invocation
// forever, and bounded retries with exponential backoff on transient network
// errors (re-polling an action id is idempotent).
const POLL_INTERVAL_MS = 500;
const POLL_MAX_DURATION_MS = 10 * 60 * 1000;
const HTTP_REQUEST_TIMEOUT_MS = 30 * 1000;
const POLL_MAX_CONSECUTIVE_NETWORK_ERRORS = 30;
const POLL_RETRY_BACKOFF_BASE_MS = 500;
const POLL_RETRY_BACKOFF_CAP_MS = 5 * 1000;

// Server-name resolution is cached per invocation: the sandbox token is minted
// once per invocation, so keying by token scopes entries to exactly one
// invocation on both the cold and warm paths. FIFO eviction keeps the map
// bounded in a long-lived resident worker.
const SERVER_VIEW_CACHE_MAX_ENTRIES = 256;

export type ToolCallErrorCode =
  | "missing_env"
  | "server_not_found"
  | "invalid_token"
  | "permission_denied"
  | "rejected"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "invalid_response"
  | "timeout";

/**
 * Transport-level failure of a tool call. Tool-level failures (the tool ran
 * and reported an error) are NOT thrown: they come back as a ToolCallResult
 * with `isError: true`.
 *
 * `retryable` means "issuing the same tools.call() again is safe and has a
 * chance of succeeding". It is false when the failure is deterministic
 * (bad request, unknown server), when the invocation's token cannot recover
 * (tokens are minted once per invocation and expire on their own schedule),
 * and when the underlying action may already exist or still be running
 * (a retry would start a duplicate tool call).
 */
export class ToolCallError extends Error {
  override readonly name = "ToolCallError";
  readonly code: ToolCallErrorCode;
  readonly retryable: boolean;
  /** HTTP status of the failing response, when the failure was an HTTP error. */
  readonly status?: number;

  constructor(
    code: ToolCallErrorCode,
    message: string,
    { retryable, status }: { retryable: boolean; status?: number }
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/**
 * Result of a completed tool call: the raw MCP content blocks exactly as the
 * platform delivered them, plus convenience accessors.
 */
export class ToolCallResult {
  /** Raw content blocks, verbatim (text, resource, image, ... blocks). */
  readonly content: readonly unknown[];
  /** True when the tool ran and reported an error. */
  readonly isError: boolean;
  /**
   * Machine-readable output, when the platform delivers one. Absent today;
   * carried so results are forward-compatible with structured tool output.
   */
  readonly structuredContent?: unknown;

  constructor({
    content,
    isError,
    structuredContent,
  }: {
    content: readonly unknown[];
    isError: boolean;
    structuredContent?: unknown;
  }) {
    this.content = content;
    this.isError = isError;
    this.structuredContent = structuredContent;
  }

  /**
   * Concatenate the text carried by the content blocks (`text` blocks and
   * embedded text resources), separated by newlines. Non-text blocks are
   * skipped.
   */
  text(): string {
    const parts: string[] = [];
    for (const block of this.content) {
      if (!isRecord(block)) {
        continue;
      }
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      } else if (
        block.type === "resource" &&
        isRecord(block.resource) &&
        typeof block.resource.text === "string"
      ) {
        parts.push(block.resource.text);
      }
    }
    return parts.join("\n");
  }

  /**
   * Parse the result as JSON: `structuredContent` when present, otherwise
   * `JSON.parse(this.text())`. Throws a SyntaxError when the text is not
   * valid JSON — callers mixing prose and JSON blocks should read `content`
   * directly instead.
   */
  json(): unknown {
    if (this.structuredContent !== undefined) {
      return this.structuredContent;
    }
    return JSON.parse(this.text());
  }
}

export interface ToolCallOptions {
  /**
   * Cap on the total time spent waiting for the tool result. Defaults to the
   * 10-minute poll ceiling. The invocation's own execution deadline is
   * typically tighter.
   */
  timeoutMs?: number;
}

interface ToolsClientConfig {
  readonly baseUrl: string;
  readonly token: string;
}

const serverViewsResponseSchema = z.object({
  serverViews: z.array(
    z.object({
      sId: z.string(),
      server: z.object({ name: z.string() }),
    })
  ),
});

const callPostResponseSchema = z.object({
  status: z.literal("pending"),
  actionId: z.string(),
});

const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    type: z.string().optional(),
    message: z.string().optional(),
  }),
});

const pollResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("rejected") }),
  z.object({
    status: z.literal("success"),
    action: z.object({
      status: z.string(),
      output: z.array(z.unknown()).nullish(),
      structuredContent: z.unknown().optional(),
    }),
  }),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function requiredEnv(name: string): string {
  const value = podEnv(name);
  if (!value) {
    throw new ToolCallError(
      "missing_env",
      `${name} is not set: tools.call() only works inside a pod function invocation.`,
      { retryable: false }
    );
  }
  return value;
}

/**
 * Classify a failing (or unparseable) HTTP response into a ToolCallError.
 * Front error bodies are `{error: {type, message}}`; the message is surfaced
 * verbatim when present so the caller sees the platform's explanation (e.g.
 * the fast-function tool refusal).
 */
function errorFromResponse(
  context: string,
  status: number,
  bodyText: string
): ToolCallError {
  let detail = bodyText.slice(0, 500);
  const envelope = apiErrorEnvelopeSchema.safeParse(tryParseJson(bodyText));
  if (envelope.success) {
    const { type, message } = envelope.data.error;
    detail = message ?? type ?? detail;
  }

  if (status >= 200 && status < 300) {
    return new ToolCallError(
      "invalid_response",
      `${context} returned an unparseable body: ${detail}`,
      { retryable: false, status }
    );
  }

  const message = `${context} returned ${status}: ${detail}`;
  if (status === 401) {
    // Tokens are minted once per invocation with a short expiry; a fresh one
    // only exists in a fresh invocation, so retrying here is futile.
    return new ToolCallError("invalid_token", message, {
      retryable: false,
      status,
    });
  }
  if (status === 403) {
    return new ToolCallError("permission_denied", message, {
      retryable: false,
      status,
    });
  }
  if (status === 404) {
    return new ToolCallError("not_found", message, {
      retryable: false,
      status,
    });
  }
  if (status === 429) {
    return new ToolCallError("rate_limited", message, {
      retryable: true,
      status,
    });
  }
  if (status >= 500) {
    return new ToolCallError("server_error", message, {
      retryable: true,
      status,
    });
  }
  return new ToolCallError("invalid_request", message, {
    retryable: false,
    status,
  });
}

interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly bodyText: string;
}

/**
 * One HTTP round-trip. Network failures (DNS, refused connection, per-request
 * timeout) reject with the underlying error; callers classify them because
 * retryability depends on the request's idempotency.
 */
async function httpRequest(
  config: ToolsClientConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<HttpResponse> {
  const response = await fetch(`${config.baseUrl}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS),
  });
  const bodyText = await response.text();
  return { status: response.status, ok: response.ok, bodyText };
}

const serverViewIdCache = new Map<string, Promise<string>>();

function resolveServerViewId(
  config: ToolsClientConfig,
  server: string
): Promise<string> {
  const key = `${config.token}\u0000${server}`;
  const cached = serverViewIdCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const promise = fetchServerViewId(config, server);
  serverViewIdCache.set(key, promise);
  // Failures are not cached: a transient listing error must not poison every
  // later call of the invocation.
  promise.catch(() => serverViewIdCache.delete(key));
  while (serverViewIdCache.size > SERVER_VIEW_CACHE_MAX_ENTRIES) {
    const oldest = serverViewIdCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    serverViewIdCache.delete(oldest);
  }
  return promise;
}

async function fetchServerViewId(
  config: ToolsClientConfig,
  server: string
): Promise<string> {
  const path = `sandbox/actions?server=${encodeURIComponent(server)}&light=true`;
  let response: HttpResponse;
  try {
    response = await httpRequest(config, "GET", path);
  } catch (err) {
    // Listing is read-only, so re-calling after a network failure is safe.
    throw new ToolCallError(
      "network_error",
      `GET ${path} failed: ${errorMessageOf(err)}`,
      { retryable: true }
    );
  }
  if (!response.ok) {
    throw errorFromResponse(`GET ${path}`, response.status, response.bodyText);
  }

  const parsed = serverViewsResponseSchema.safeParse(
    tryParseJson(response.bodyText)
  );
  if (!parsed.success) {
    throw errorFromResponse(`GET ${path}`, response.status, response.bodyText);
  }

  const view = parsed.data.serverViews.find((v) => v.server.name === server);
  if (view === undefined) {
    throw new ToolCallError(
      "server_not_found",
      `Server '${server}' not found: it is not available to this pod.`,
      { retryable: false }
    );
  }
  return view.sId;
}

async function postToolCall(
  config: ToolsClientConfig,
  {
    serverViewId,
    toolName,
    args,
  }: {
    serverViewId: string;
    toolName: string;
    args: Record<string, unknown>;
  }
): Promise<string> {
  const path = "sandbox/actions/call";
  let response: HttpResponse;
  try {
    response = await httpRequest(config, "POST", path, {
      serverViewId,
      toolName,
      arguments: args,
    });
  } catch (err) {
    // The POST is not idempotent (each one creates an action) and a request
    // that failed in flight may still have been processed, so a blind retry
    // could run the tool twice.
    throw new ToolCallError(
      "network_error",
      `POST ${path} failed: ${errorMessageOf(err)}`,
      { retryable: false }
    );
  }
  if (!response.ok) {
    throw errorFromResponse(`POST ${path}`, response.status, response.bodyText);
  }

  const parsed = callPostResponseSchema.safeParse(
    tryParseJson(response.bodyText)
  );
  if (!parsed.success) {
    throw errorFromResponse(`POST ${path}`, response.status, response.bodyText);
  }
  return parsed.data.actionId;
}

function timeoutError(actionId: string, timeoutMs: number): ToolCallError {
  // The action may still complete server-side; retrying would start a
  // duplicate tool call on top of it.
  return new ToolCallError(
    "timeout",
    `Timed out waiting for action ${actionId} after ${timeoutMs} ms.`,
    { retryable: false }
  );
}

async function pollActionResult(
  config: ToolsClientConfig,
  {
    actionId,
    deadlineMs,
    timeoutMs,
  }: { actionId: string; deadlineMs: number; timeoutMs: number }
): Promise<ToolCallResult> {
  const path = `sandbox/actions/${actionId}`;
  let consecutiveNetworkErrors = 0;

  for (;;) {
    let response: HttpResponse;
    try {
      response = await httpRequest(config, "GET", path);
      consecutiveNetworkErrors = 0;
    } catch (err) {
      // Transient network errors are retried: action ids are durable and
      // re-polling one is idempotent. HTTP-level errors below are terminal.
      consecutiveNetworkErrors += 1;
      if (consecutiveNetworkErrors > POLL_MAX_CONSECUTIVE_NETWORK_ERRORS) {
        throw new ToolCallError(
          "network_error",
          `Polling action ${actionId} failed after ` +
            `${POLL_MAX_CONSECUTIVE_NETWORK_ERRORS} consecutive network ` +
            `errors: ${errorMessageOf(err)}`,
          // The tool call may still be running server-side.
          { retryable: false }
        );
      }
      if (Date.now() >= deadlineMs) {
        throw timeoutError(actionId, timeoutMs);
      }
      const backoffMs = Math.min(
        POLL_RETRY_BACKOFF_BASE_MS *
          2 ** Math.min(consecutiveNetworkErrors - 1, 4),
        POLL_RETRY_BACKOFF_CAP_MS
      );
      await sleep(backoffMs);
      continue;
    }

    const parsed = pollResponseSchema.safeParse(
      tryParseJson(response.bodyText)
    );
    if (!parsed.success) {
      // Error envelopes (and anything else unparseable) end the poll: the
      // classifier maps front's `{error: {...}}` bodies to a typed error.
      throw errorFromResponse(
        `GET ${path}`,
        response.status,
        response.bodyText
      );
    }

    const poll = parsed.data;
    switch (poll.status) {
      case "pending": {
        if (Date.now() >= deadlineMs) {
          throw timeoutError(actionId, timeoutMs);
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      case "rejected":
        throw new ToolCallError(
          "rejected",
          `Action ${actionId} was rejected.`,
          { retryable: false }
        );
      case "success":
        return new ToolCallResult({
          content: poll.action.output ?? [],
          isError: poll.action.status === "errored",
          structuredContent: poll.action.structuredContent,
        });
      default: {
        const exhaustive: never = poll;
        throw new ToolCallError(
          "invalid_response",
          `Unexpected poll status: ${JSON.stringify(exhaustive)}`,
          { retryable: false }
        );
      }
    }
  }
}

export const tools = {
  /**
   * Call a workspace tool and wait for its result.
   *
   * @param server the tool server name, as listed by `dsbx tools` (e.g.
   *   "slack_personal").
   * @param tool the tool name on that server.
   * @param args the tool arguments as a plain JSON object, passed to the
   *   server verbatim — no stringification, no scalar coercion.
   * @throws ToolCallError on transport failures. A tool that ran and reported
   *   an error resolves normally with `isError: true`.
   */
  async call(
    server: string,
    tool: string,
    args?: Record<string, unknown>,
    options?: ToolCallOptions
  ): Promise<ToolCallResult> {
    const config: ToolsClientConfig = {
      baseUrl: requiredEnv(TOOLS_API_URL_ENV).replace(/\/+$/, ""),
      token: requiredEnv(TOOLS_SANDBOX_TOKEN_ENV),
    };
    const timeoutMs = options?.timeoutMs ?? POLL_MAX_DURATION_MS;
    const deadlineMs = Date.now() + timeoutMs;

    const serverViewId = await resolveServerViewId(config, server);
    const actionId = await postToolCall(config, {
      serverViewId,
      toolName: tool,
      args: args ?? {},
    });
    return pollActionResult(config, { actionId, deadlineMs, timeoutMs });
  },
};
