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

// The only directory a result-spill pointer may name. The runner writes spilled results there
// (cli/dust-sandbox/functions-runner) and the pointer rides the exec's stdout, which untrusted
// function code can also write to: restricting read-back to this scratch directory keeps a forged
// pointer from making front read an arbitrary sandbox file.
export const SANDBOX_FUNCTION_RESULT_SPILL_DIR = "/tmp/dust-fn-results/";

// A result too large to inline on stdout: the runner writes the full envelope JSON to a
// sandbox-local scratch file and emits this pointer instead. Deliberately not `.strict()`: a
// field added by a newer dsbx must not turn a pointer into an invalid-envelope failure.
const ResultSpillPointerSchema = z.object({
  ok: z.literal(true),
  resultFile: z.string().min(1),
  resultBytes: z.number().int().nonnegative(),
});

export type SandboxFunctionResultSpillPointer = z.infer<
  typeof ResultSpillPointerSchema
>;

/**
 * Extract a result-spill pointer from a parsed stdout value (a protocol v3 envelope or a bare
 * runner outcome). Returns null for inline outcomes and for anything an older dsbx emits.
 */
export function extractResultSpillPointer(
  parsedEnvelope: unknown
): SandboxFunctionResultSpillPointer | null {
  const envelope = ResultEnvelopeV3Schema.safeParse(parsedEnvelope);
  const outcome = envelope.success ? envelope.data.outcome : parsedEnvelope;
  const pointer = ResultSpillPointerSchema.safeParse(outcome);
  return pointer.success ? pointer.data : null;
}

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
  if (!current.success) {
    return invalidResultEnvelope("unrecognized_runner_outcome", {
      resultSnippet: truncate(
        JSON.stringify(result) ?? "undefined",
        REJECTED_ENVELOPE_LOG_SNIPPET_MAX_CHARS
      ),
    });
  }

  return current.data;
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
 * Normalize a Pod function result payload from a worker-owned stdout envelope into one
 * classified outcome.
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
