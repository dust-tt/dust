import {
  type NormalizedSandboxFunctionOutcome,
  normalizeSandboxFunctionResult,
} from "@app/lib/api/sandbox_functions/result_envelope";

/**
 * Parse a protocol v3 (or legacy) result envelope from dsbx stdout.
 * Uses the last non-empty line, matching other dsbx stdout parsers.
 * Never throws: malformed output becomes an invocation_failed outcome.
 */
export function parseStdoutResultEnvelope(
  stdout: string
): NormalizedSandboxFunctionOutcome {
  const lastLine =
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? "";

  if (lastLine.length === 0) {
    return {
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Pod function produced no stdout result envelope.",
      },
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(lastLine);
  } catch {
    return {
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Pod function stdout was not valid JSON.",
      },
    };
  }

  return normalizeSandboxFunctionResult(json);
}
