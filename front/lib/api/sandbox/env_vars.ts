import { Err, Ok, type Result } from "@app/types/shared/result";

export const SANDBOX_ENV_VAR_PREFIX = "DST_";
// 64 char total budget - 4 prefix chars - 1 leading-letter char = 59 trailing chars.
export const ENV_VAR_NAME_REGEX = /^DST_[A-Z][A-Z0-9_]{0,59}$/;
export const ENV_VAR_NAME_SUFFIX_REGEX = /^[A-Z][A-Z0-9_]{0,59}$/;
export const MAX_VALUE_BYTES = 32 * 1024;
export const MAX_VARS_PER_WORKSPACE = 50;

export function validateEnvVarName(name: string): Result<void, string> {
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    return new Err(
      "Environment variable names must start with DST_ followed by A-Z, digits or underscores (up to 64 characters total)."
    );
  }
  return new Ok(undefined);
}

export function validateEnvVarValue(value: string): Result<void, string> {
  if (value.length === 0) {
    return new Err("Environment variable values cannot be empty.");
  }

  if (value.includes("\u0000")) {
    return new Err("Environment variable values cannot contain NUL bytes.");
  }

  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    return new Err("Environment variable values cannot exceed 32 KiB.");
  }

  return new Ok(undefined);
}
