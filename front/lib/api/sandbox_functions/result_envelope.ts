import logger from "@app/logger/logger";
import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "@app/types/api/sandbox_functions";
import { truncate } from "@app/types/shared/utils/string_utils";
import { z } from "zod";

// Current wire version dsbx emits. Parsing accepts the supported set below so a future bump
// does not instantly fail long-lived baked pod images still on an older version.
export const SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION = 3;

export const SUPPORTED_SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSIONS = [
  SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION,
] as const;

// Cap on the rejected-payload snippet included in logs.
const REJECTED_ENVELOPE_LOG_SNIPPET_MAX_CHARS = 512;

// Cap on error messages delivered to callers and frames. Thrown errors can embed entire tool
// stderr dumps, and frames render `message` on user-facing error cards. The full text stays
// available for debugging: execute() logs the raw runner stdout/stderr on every failure, and
// `inspect_invocations` reads the persisted invocation record.
export const SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS = 1_000;

/**
 * Bound a call error's message for delivery. Callers hand the returned error to frames and
 * tool outputs; the original, unbounded text belongs in logs only.
 */
export function boundSandboxFunctionCallError(
  error: SandboxFunctionCallError
): SandboxFunctionCallError {
  return {
    ...error,
    message: truncate(
      error.message,
      SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS
    ),
  };
}

export type NormalizedSandboxFunctionOutcome =
  | { ok: true; output: unknown }
  | { ok: false; error: SandboxFunctionCallError };

type JsonValue = null | boolean | number | string | object;
const DefinedJsonValueSchema = z.custom<JsonValue>((v) => v !== undefined);

const SandboxFunctionRunnerOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), output: DefinedJsonValueSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          // Accept runner codes and front/dsbx-minted codes (e.g. invocation_failed).
          // Stored paths already treat code as an opaque string for the same reason.
          code: z.union([
            z.enum(SANDBOX_FUNCTION_RUNNER_ERROR_CODES),
            z.enum(["invocation_failed", "transport_error", "not_supported"]),
          ]),
          message: z.string(),
          status: z.number().int().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const LegacySandboxFunctionRunnerOutputSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      response: z
        .object({
          status: z.number().int(),
          headers: z.record(z.string(), z.string()),
          body: z.string().nullable(),
          encoding: z.enum(["utf8", "base64"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          kind: z.enum(["bad_input", "import_failed", "threw", "bad_return"]),
          message: z.string(),
          stack: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

// Mirrors ResultEnvelope in cli/dust-sandbox/src/commands/function/envelope.rs.
// Deliberately not `.strict()`: the wrapper is a forward-compatibility seam, so a field added by
// a newer dsbx must not fail the parse. Inner outcome schemas stay `.strict()`.
// `delivery` is optional and opaque until a consumer reads it.
const ResultEnvelopeV3Schema = z.object({
  protocolVersion: z.literal(SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION),
  delivery: z.string().min(1).optional(),
  outcome: z.unknown(),
  timingsMs: z.unknown().optional(),
});

const ProtocolVersionProbeSchema = z.object({
  protocolVersion: z.number(),
});

// Lenient by design: timings are diagnostics from whatever dsbx version runs in the sandbox, and
// absence or new shapes must never affect result handling. Only the consumed field is modeled.
const ResultTimingsSchema = z.object({
  runnerKind: z.enum(["warm", "cold"]).optional(),
});

export type SandboxFunctionResultTimings = z.infer<typeof ResultTimingsSchema>;

/**
 * Extract the timings block from an already-parsed stdout envelope value. Purely observational:
 * used to tag latency metrics with the runner kind (warm server vs cold spawn); never affects the
 * outcome, and never throws.
 */
export function extractResultEnvelopeTimings(
  parsedEnvelope: unknown
): SandboxFunctionResultTimings | null {
  const envelope = ResultEnvelopeV3Schema.safeParse(parsedEnvelope);
  if (!envelope.success) {
    return null;
  }
  const timings = ResultTimingsSchema.safeParse(envelope.data.timingsMs);
  return timings.success ? timings.data : null;
}

function invalidResultEnvelope(
  reason: string,
  details?: Record<string, unknown>
): NormalizedSandboxFunctionOutcome {
  logger.warn({ reason, ...details }, "Rejected Pod function result envelope");
  return {
    ok: false,
    error: {
      code: "invocation_failed",
      message: "Sandbox function returned an invalid result envelope.",
    },
  };
}

function normalizeRunnerOutcome(
  result: unknown
): NormalizedSandboxFunctionOutcome {
  const current = SandboxFunctionRunnerOutputSchema.safeParse(result);
  if (current.success) {
    const outcome = current.data;
    // `threw` is the only code whose message is authored by the function itself (the thrown
    // error's message), which in practice embeds whole tool stderr dumps. Bound it before it is
    // persisted and delivered; runner-minted messages on the other codes are short prose.
    if (!outcome.ok && outcome.error.code === "threw") {
      return { ok: false, error: boundSandboxFunctionCallError(outcome.error) };
    }
    return outcome;
  }

  const legacy = LegacySandboxFunctionRunnerOutputSchema.safeParse(result);
  if (!legacy.success) {
    return invalidResultEnvelope("unrecognized_runner_outcome", {
      resultSnippet: truncate(
        JSON.stringify(result) ?? "undefined",
        REJECTED_ENVELOPE_LOG_SNIPPET_MAX_CHARS
      ),
    });
  }

  if (!legacy.data.ok) {
    const error = {
      code: legacy.data.error.kind,
      message: legacy.data.error.message,
    };
    return {
      ok: false,
      error:
        legacy.data.error.kind === "threw"
          ? boundSandboxFunctionCallError(error)
          : error,
    };
  }

  const { response } = legacy.data;
  const body =
    response.body === null
      ? ""
      : Buffer.from(response.body, response.encoding).toString("utf8");
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: {
        code: "http_error",
        message: `Function returned HTTP ${response.status}${body ? `: ${body}` : "."}`,
        status: response.status,
      },
    };
  }

  try {
    return { ok: true, output: JSON.parse(body) };
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid_output",
        message: "Function response body is not valid JSON.",
      },
    };
  }
}

function isSupportedProtocolVersion(version: number): boolean {
  return (
    Number.isInteger(version) &&
    (
      SUPPORTED_SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSIONS as readonly number[]
    ).includes(version)
  );
}

/**
 * Normalize a Pod function result payload from either the HTTP callback body or a
 * worker-owned stdout envelope into one classified outcome.
 */
export function normalizeSandboxFunctionResult(
  result: unknown
): NormalizedSandboxFunctionOutcome {
  const versionProbe = ProtocolVersionProbeSchema.safeParse(result);
  if (versionProbe.success) {
    const { protocolVersion } = versionProbe.data;
    if (!Number.isInteger(protocolVersion)) {
      return invalidResultEnvelope("non_integer_protocol_version", {
        protocolVersion,
      });
    }
    if (!isSupportedProtocolVersion(protocolVersion)) {
      logger.warn(
        { reason: "unsupported_protocol_version", protocolVersion },
        "Rejected Pod function result envelope"
      );
      return {
        ok: false,
        error: {
          code: "invocation_failed",
          message: `Unsupported Pod function result protocol version ${protocolVersion}.`,
        },
      };
    }

    const v3 = ResultEnvelopeV3Schema.safeParse(result);
    if (!v3.success) {
      return invalidResultEnvelope("malformed_v3_envelope", {
        protocolVersion,
        resultSnippet: truncate(
          JSON.stringify(result) ?? "undefined",
          REJECTED_ENVELOPE_LOG_SNIPPET_MAX_CHARS
        ),
      });
    }

    // timingsMs is not consumed here: extractResultEnvelopeTimings reads it for metrics.
    return normalizeRunnerOutcome(v3.data.outcome);
  }

  return normalizeRunnerOutcome(result);
}
