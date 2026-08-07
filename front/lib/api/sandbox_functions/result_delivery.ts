import type { SandboxFunctionResultTimings } from "@app/lib/api/sandbox_functions/result_envelope";
import {
  extractResultEnvelopeTimings,
  type NormalizedSandboxFunctionOutcome,
  normalizeSandboxFunctionResult,
} from "@app/lib/api/sandbox_functions/result_envelope";

export interface ParsedStdoutResult {
  outcome: NormalizedSandboxFunctionOutcome;
  // Observational diagnostics from the envelope (runner kind), null when the
  // envelope carried none or could not be parsed. Never affects the outcome.
  timings: SandboxFunctionResultTimings | null;
}

/**
 * Parse a protocol v3 (or legacy) result envelope from dsbx stdout.
 * Uses the last non-empty line, matching other dsbx stdout parsers, and parses
 * it exactly once for both the outcome and the timing diagnostics.
 * Never throws: malformed output becomes an invocation_failed outcome.
 */
export function parseStdoutResultEnvelope(stdout: string): ParsedStdoutResult {
  const lastLine =
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? "";

  if (lastLine.length === 0) {
    return {
      outcome: {
        ok: false,
        error: {
          code: "invocation_failed",
          message: "Pod function produced no stdout result envelope.",
        },
      },
      timings: null,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(lastLine);
  } catch {
    return {
      outcome: {
        ok: false,
        error: {
          code: "invocation_failed",
          message: "Pod function stdout was not valid JSON.",
        },
      },
      timings: null,
    };
  }

  return {
    outcome: normalizeSandboxFunctionResult(json),
    timings: extractResultEnvelopeTimings(json),
  };
}
