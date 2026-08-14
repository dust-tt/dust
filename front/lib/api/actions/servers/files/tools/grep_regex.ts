import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { RE2 } from "re2-wasm";

export const GREP_LINE_MAX_CHARS = 1024 * 1024;
export const GREP_PATTERN_MAX_CHARS = 4096;

export function compileGrepPattern(pattern: string): Result<RE2, Error> {
  if (pattern.length > GREP_PATTERN_MAX_CHARS) {
    return new Err(
      new Error(
        `Regular expressions cannot exceed ${GREP_PATTERN_MAX_CHARS} characters.`
      )
    );
  }

  try {
    // RE2 guarantees linear-time matching. The unicode flag is required by re2-wasm.
    return new Ok(new RE2(pattern, "mu"));
  } catch (err) {
    return new Err(
      new Error(
        `The pattern uses unsupported syntax or is invalid: ${normalizeError(err).message}`
      )
    );
  }
}

export function validateGrepLine(line: string): Error | null {
  if (line.length > GREP_LINE_MAX_CHARS) {
    return new Error(
      `Cannot search a line longer than ${GREP_LINE_MAX_CHARS} characters.`
    );
  }

  return null;
}
