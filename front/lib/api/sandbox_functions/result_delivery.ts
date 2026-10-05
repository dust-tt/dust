import type { SandboxReadFileOptions } from "@app/lib/api/sandbox/provider";
import type {
  NormalizedSandboxFunctionOutcome,
  SandboxFunctionResultSpillPointer,
  SandboxFunctionResultTimings,
} from "@app/lib/api/sandbox_functions/result_envelope";
import {
  extractResultEnvelopeTimings,
  extractResultSpillPointer,
  normalizeSandboxFunctionResult,
  SANDBOX_FUNCTION_RESULT_MAX_BYTES,
  SANDBOX_FUNCTION_RESULT_SPILL_FILE_PATTERN,
} from "@app/lib/api/sandbox_functions/result_envelope";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";

interface ParsedStdoutResultBase {
  // Observational diagnostics from the envelope (runner kind), null when the
  // envelope carried none or could not be parsed. Never affects the outcome.
  timings: SandboxFunctionResultTimings | null;
}

export type ParsedStdoutResult =
  | (ParsedStdoutResultBase & {
      outcome: NormalizedSandboxFunctionOutcome;
      spill: null;
    })
  // The runner spilled an oversized result to a sandbox-local file instead of
  // inlining it: the caller must read the file back (resolveSpilledResult)
  // to obtain the outcome. Never emitted by older dsbx versions.
  | (ParsedStdoutResultBase & {
      outcome: null;
      spill: SandboxFunctionResultSpillPointer;
    });

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
          message: "Frame function produced no stdout result envelope.",
        },
      },
      timings: null,
      spill: null,
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
          message: "Frame function stdout was not valid JSON.",
        },
      },
      timings: null,
      spill: null,
    };
  }

  const timings = extractResultEnvelopeTimings(json);
  const spill = extractResultSpillPointer(json);
  if (spill !== null) {
    return { outcome: null, spill, timings };
  }

  return {
    outcome: normalizeSandboxFunctionResult(json),
    timings,
    spill: null,
  };
}

function spillReadFailure(
  spill: SandboxFunctionResultSpillPointer,
  reason: string
): NormalizedSandboxFunctionOutcome {
  logger.warn(
    { resultFile: spill.resultFile, resultBytes: spill.resultBytes, reason },
    "Failed to read back a spilled Frame function result"
  );
  return {
    ok: false,
    error: {
      code: "invocation_failed",
      message: `Frame function result could not be read back from ${spill.resultFile}: ${reason}`,
    },
  };
}

/**
 * Read back a spilled result and normalize its content, exactly as an inline
 * outcome would have been. `readFile` is the sandbox read (the caller binds
 * the provider, e.g. `(path, opts) => sandbox.readFile(auth, path, opts)`).
 * Never throws: any read or parse failure becomes an invocation_failed outcome
 * naming the file, so a spill failure is loud instead of silently losing the
 * result.
 */
/**
 * @cc [owner:fontanierh,label:security] spill-pointer-is-untrusted
 * The pointer rides the exec's stdout, which untrusted function code can also write to. The file
 * MUST only be read when its path matches the runner's `<uuid>.json` spill file pattern, MUST be
 * read as the workload user (`agent-proxied`) and MUST be bounded by the runner's hard result cap
 * (`SANDBOX_FUNCTION_RESULT_MAX_BYTES`), independently of the pointer's `resultBytes`.
 */
export async function resolveSpilledResult(
  spill: SandboxFunctionResultSpillPointer,
  readFile: (
    path: string,
    opts: SandboxReadFileOptions
  ) => Promise<Result<Buffer, Error>>
): Promise<NormalizedSandboxFunctionOutcome> {
  if (!SANDBOX_FUNCTION_RESULT_SPILL_FILE_PATTERN.test(spill.resultFile)) {
    return spillReadFailure(spill, "unexpected result file path");
  }

  const read = await readFile(spill.resultFile, {
    user: "agent-proxied",
    maxBytes: SANDBOX_FUNCTION_RESULT_MAX_BYTES,
  });
  if (read.isErr()) {
    return spillReadFailure(spill, read.error.message);
  }

  let json: unknown;
  try {
    json = JSON.parse(read.value.toString("utf8"));
  } catch {
    return spillReadFailure(spill, "file content is not valid JSON");
  }

  return normalizeSandboxFunctionResult(json);
}
