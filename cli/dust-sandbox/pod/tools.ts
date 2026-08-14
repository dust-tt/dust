// Typed client for calling workspace tools (MCP servers) from pod function
// code.
//
// `tools.call(server, tool, args)` delegates to the dsbx CLI: it spawns
// `dsbx tools --json --args-json - <server> <tool>` and parses the stdout
// contract. The POST+poll transport, its retry policy, and offloaded-output
// resolution are implemented exactly once, in dsbx (src/api/client.rs and
// src/commands/tools/); this file only owns process plumbing. The spawn is
// fully async (awaiting the child never blocks the event loop), so a resident
// worker serving concurrent invocations is never stalled on a tool call.
// Arguments travel over stdin as one JSON object (`--args-json -`): no argv
// size limits, no scalar coercion.
//
// Auth and routing come from the invocation environment (DUST_API_URL is
// workspace-scoped, DUST_SANDBOX_TOKEN is minted per invocation), read through
// podEnv() and passed explicitly to the child, so concurrent invocations in
// one process stay isolated even though the child inherits the rest of
// process.env.
//
// Tool outputs above front's offload threshold are resolved by dsbx itself
// under `--json`: blocks arrive with their full archived content already
// substituted, never the truncated snippet.

import { z } from "zod";

import { podEnv } from "./context.ts";

export const TOOLS_API_URL_ENV = "DUST_API_URL";
export const TOOLS_SANDBOX_TOKEN_ENV = "DUST_SANDBOX_TOKEN";

/**
 * Override of the dsbx executable path, for tests and local use. Production
 * pods resolve the default absolute path baked into the sandbox image.
 */
export const DSBX_PATH_ENV = "DUST_DSBX_PATH";

const DEFAULT_DSBX_PATH = "/opt/bin/dsbx";

// Default wait cap, matching dsbx's own 10-minute poll ceiling
// (src/api/client.rs). dsbx enforces its cap internally; this local deadline
// only fires if the child process itself wedges.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const STDERR_TAIL_MAX_CHARS = 2000;

/**
 * Error codes thrown by tools.call().
 *
 * Most values mirror the dsbx `tools --json` error envelope
 * (`ApiErrorCode::as_str` and `OffloadResolutionError` in the CLI); that
 * contract is append-only, and an envelope code this client does not know yet
 * is surfaced as `unknown` with the envelope's message and retryable flag
 * intact. The rest (`missing_env`, `exec_error`, `invalid_response`,
 * `timeout`) are local to this client's process plumbing.
 */
export type ToolCallErrorCode =
  | "invalid_sandbox_token"
  | "fast_function_called_tools"
  | "invalid_request"
  | "rate_limited"
  | "server_error"
  | "tool_output_unavailable"
  | "unknown"
  | "missing_env"
  | "exec_error"
  | "invalid_response"
  | "timeout";

const ENVELOPE_ERROR_CODES: readonly ToolCallErrorCode[] = [
  "invalid_sandbox_token",
  "fast_function_called_tools",
  "invalid_request",
  "rate_limited",
  "server_error",
  "tool_output_unavailable",
  "unknown",
];

/**
 * Transport-level failure of a tool call. Tool-level failures (the tool ran
 * and reported an error) are NOT thrown: they come back as a ToolCallResult
 * with `isError: true`.
 *
 * `retryable` means "issuing the same tools.call() again is safe and has a
 * chance of succeeding". For envelope-carried failures it is dsbx's own
 * classification; local failures are never retryable except where noted.
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
   * Cap on the total time spent waiting for the tool result. Defaults to
   * dsbx's own 10-minute ceiling; values above it never fire because dsbx
   * gives up first. The invocation's own execution deadline is typically
   * tighter.
   */
  timeoutMs?: number;
}

// The two stdout shapes of `dsbx tools --json`: a CallToolResult on
// completion (exit 0, or 1 when the tool reported an error), an error
// envelope on transport failure. Both are append-only contracts.
const resultSchema = z.object({
  content: z.array(z.unknown()),
  isError: z.boolean(),
  structuredContent: z.unknown().optional(),
});

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    status: z.number().optional(),
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

/** Map an envelope code onto the known union; future dsbx codes degrade to
 * `unknown` (message and retryable flag still carried verbatim). */
function classifyEnvelopeCode(code: string): ToolCallErrorCode {
  return ENVELOPE_ERROR_CODES.find((known) => known === code) ?? "unknown";
}

function stderrTail(stderr: string): string {
  const trimmed = stderr.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return `; stderr: ${trimmed.slice(-STDERR_TAIL_MAX_CHARS)}`;
}

interface DsbxRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

interface DsbxSpawnParams {
  dsbxPath: string;
  argv: string[];
  env: Record<string, string | undefined>;
  stdinBody: string;
}

/**
 * Bun.spawn throws synchronously when the executable cannot be started
 * (missing binary, permission denied); that surfaces as `exec_error`.
 */
function spawnDsbx({ dsbxPath, argv, env, stdinBody }: DsbxSpawnParams) {
  try {
    return Bun.spawn([dsbxPath, ...argv], {
      env,
      stdin: new TextEncoder().encode(stdinBody),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    throw new ToolCallError(
      "exec_error",
      `Failed to spawn dsbx at ${dsbxPath}: ${errorMessageOf(err)}`,
      { retryable: false }
    );
  }
}

/** Spawn dsbx and wait for it to exit, killing it past `timeoutMs`. */
async function runDsbx({
  timeoutMs,
  ...spawnParams
}: DsbxSpawnParams & { timeoutMs: number }): Promise<DsbxRun> {
  const proc = spawnDsbx(spawnParams);

  // Start draining both pipes before awaiting exit so a chatty child can
  // never fill a pipe buffer and deadlock against us waiting on exited. A
  // read failure degrades to an empty capture rather than masking the exit
  // outcome.
  const stdoutPromise = new Response(proc.stdout).text().catch(() => "");
  const stderrPromise = new Response(proc.stderr).text().catch(() => "");

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, timeoutMs);

  try {
    const exitCode = await proc.exited;
    if (timedOut) {
      // The pipes can be held open past the kill by processes the child
      // spawned; the output is discarded anyway, so don't wait for EOF.
      return { exitCode, stdout: "", stderr: "", timedOut };
    }
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    return { exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
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
    const apiUrl = requiredEnv(TOOLS_API_URL_ENV);
    const token = requiredEnv(TOOLS_SANDBOX_TOKEN_ENV);
    const dsbxPath = podEnv(DSBX_PATH_ENV) ?? DEFAULT_DSBX_PATH;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const run = await runDsbx({
      dsbxPath,
      argv: ["tools", "--json", "--args-json", "-", server, tool],
      // The invocation's credentials override whatever the process env holds:
      // in a resident worker, process.env is scrubbed of tokens and each
      // invocation carries its own.
      env: {
        ...process.env,
        [TOOLS_API_URL_ENV]: apiUrl,
        [TOOLS_SANDBOX_TOKEN_ENV]: token,
      },
      stdinBody: JSON.stringify(args ?? {}),
      timeoutMs,
    });

    if (run.timedOut) {
      // The underlying action may still complete server-side; retrying would
      // start a duplicate tool call on top of it.
      throw new ToolCallError(
        "timeout",
        `Tool call ${server}.${tool} timed out after ${timeoutMs} ms.`,
        { retryable: false }
      );
    }

    const parsed = tryParseJson(run.stdout);

    const envelope = errorEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
      const { code, message, retryable, status } = envelope.data.error;
      throw new ToolCallError(classifyEnvelopeCode(code), message, {
        retryable,
        status,
      });
    }

    const result = resultSchema.safeParse(parsed);
    if (result.success) {
      // Exit code 1 with a result payload is a tool-level error, already
      // carried by isError; any other exit code cannot produce this shape.
      return new ToolCallResult({
        content: result.data.content,
        isError: result.data.isError,
        structuredContent: result.data.structuredContent,
      });
    }

    if (run.exitCode === 0) {
      throw new ToolCallError(
        "invalid_response",
        `dsbx exited 0 but its output is not a tool result: ` +
          `${run.stdout.slice(0, 500)}${stderrTail(run.stderr)}`,
        { retryable: false }
      );
    }
    throw new ToolCallError(
      "exec_error",
      `dsbx exited ${run.exitCode} without a machine-readable ` +
        `error${stderrTail(run.stderr)}`,
      { retryable: false }
    );
  },
};
