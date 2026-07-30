import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "@app/types/api/sandbox_functions";
import { z } from "zod";

export const SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION = 3;

// Phase names are owned by the runner/CLI and grow over time (Workstream 6). Keep this a
// bounded record of non-negative millisecond values rather than a closed field list.
export type SandboxFunctionResultTimingsMs = Record<string, number>;

export type NormalizedSandboxFunctionOutcome = {
  timingsMs?: SandboxFunctionResultTimingsMs;
} & (
  | { ok: true; output: unknown }
  | { ok: false; error: SandboxFunctionCallError }
);

type JsonValue = null | boolean | number | string | object;
const DefinedJsonValueSchema = z.custom<JsonValue>((v) => v !== undefined);

const SandboxFunctionRunnerOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), output: DefinedJsonValueSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum(SANDBOX_FUNCTION_RUNNER_ERROR_CODES),
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

// One hour ceiling: runner phase timings above this are discarded as implausible rather than
// failing the whole envelope.
const MAX_TIMING_MS = 60 * 60 * 1000;
const MAX_TIMING_KEYS = 32;
const TIMING_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

const TimingsMsSchema = z
  .record(
    z.string().regex(TIMING_KEY_REGEX),
    z.number().finite().nonnegative().max(MAX_TIMING_MS)
  )
  .refine((value) => Object.keys(value).length <= MAX_TIMING_KEYS, {
    message: `timingsMs may contain at most ${MAX_TIMING_KEYS} keys`,
  });

// Deliberately not `.strict()`: the wrapper is a forward-compatibility seam, so a field added by
// a newer dsbx must not fail the parse. Inner outcome schemas stay `.strict()`.
// `delivery` is accepted as an opaque string until a consumer reads it; closing it to an enum
// would break a future dsbx that adds a mode (e.g. spool) before front knows about it.
const ResultEnvelopeV3Schema = z.object({
  protocolVersion: z.literal(SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION),
  delivery: z.string().min(1),
  outcome: z.unknown(),
  timingsMs: z.unknown().optional(),
});

const ProtocolVersionProbeSchema = z.object({
  protocolVersion: z.number().int(),
});

function invalidResultEnvelope(): NormalizedSandboxFunctionOutcome {
  return {
    ok: false,
    error: {
      code: "invocation_failed",
      message: "Sandbox function returned an invalid result envelope.",
    },
  };
}

function parseTimingsMs(
  value: unknown
): SandboxFunctionResultTimingsMs | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = TimingsMsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function normalizeRunnerOutcome(
  result: unknown
): NormalizedSandboxFunctionOutcome {
  const current = SandboxFunctionRunnerOutputSchema.safeParse(result);
  if (current.success) {
    return current.data;
  }

  const legacy = LegacySandboxFunctionRunnerOutputSchema.safeParse(result);
  if (!legacy.success) {
    return invalidResultEnvelope();
  }

  if (!legacy.data.ok) {
    return {
      ok: false,
      error: {
        code: legacy.data.error.kind,
        message: legacy.data.error.message,
      },
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

/**
 * Normalize a Pod function result payload from either the HTTP callback body or a future
 * worker-owned stdout envelope into one classified outcome.
 */
export function normalizeSandboxFunctionResult(
  result: unknown
): NormalizedSandboxFunctionOutcome {
  const versionProbe = ProtocolVersionProbeSchema.safeParse(result);
  if (versionProbe.success) {
    if (
      versionProbe.data.protocolVersion !==
      SANDBOX_FUNCTION_RESULT_PROTOCOL_VERSION
    ) {
      return {
        ok: false,
        error: {
          code: "invocation_failed",
          message: `Unsupported Pod function result protocol version ${versionProbe.data.protocolVersion}.`,
        },
      };
    }

    const v3 = ResultEnvelopeV3Schema.safeParse(result);
    if (!v3.success) {
      return invalidResultEnvelope();
    }

    const outcome = normalizeRunnerOutcome(v3.data.outcome);
    const timingsMs = parseTimingsMs(v3.data.timingsMs);
    return timingsMs === undefined ? outcome : { ...outcome, timingsMs };
  }

  return normalizeRunnerOutcome(result);
}
