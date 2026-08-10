import type {
  NormalizedSandboxFunctionOutcome,
  SandboxFunctionResultTimings,
} from "@app/lib/api/sandbox_functions/result_envelope";
import { truncate } from "@app/types/shared/utils/string_utils";

// Head of the runner's stderr folded into the error the agent sees when stdout carried no
// envelope at all. Small on purpose: it stands in for a cause, the full output goes to the logs.
const STDERR_DETAIL_MAX_CHARS = 2_048;

function withStderrDetail(message: string, stderr: string): string {
  const detail = truncate(stderr, STDERR_DETAIL_MAX_CHARS).trim();
  return detail ? `${message}\n${detail}` : message;
}

import {
  extractResultEnvelopeTimings,
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
 *
 * `stderr` is only read when stdout carried nothing usable, where it is the sole
 * remaining clue as to why (a runner that never started, a dsbx that does not know
 * the flag). Without it the agent gets an error that names no cause.
 */
export function parseStdoutResultEnvelope(
  stdout: string,
  { stderr = "" }: { stderr?: string } = {}
): ParsedStdoutResult {
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
          message: withStderrDetail(
            "Pod function produced no stdout result envelope.",
            stderr
          ),
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
          message: withStderrDetail(
            "Pod function stdout was not valid JSON.",
            stderr
          ),
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
