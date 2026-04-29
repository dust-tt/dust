import { Err, Ok, type Result } from "@app/types/shared/result";

export const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MAX_VALUE_BYTES = 32 * 1024;
export const MAX_VARS_PER_WORKSPACE = 50;

const RESERVED_EXACT_NAMES = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "TERM",
  "LANG",
  "LC_ALL",
  "HOSTNAME",
  "TMPDIR",
]);

const RESERVED_PREFIXES = [
  "LD_",
  "DUST_",
  "SANDBOX_",
  "E2B_",
  "DD_",
  "CONVERSATION_",
  "WORKSPACE_",
];

export function isReservedEnvVarName(name: string): boolean {
  return (
    name.startsWith("_") ||
    RESERVED_EXACT_NAMES.has(name) ||
    RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export function validateEnvVarName(name: string): Result<void, string> {
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    return new Err(
      "Environment variable names must match /^[A-Z][A-Z0-9_]{0,63}$/."
    );
  }

  if (isReservedEnvVarName(name)) {
    return new Err(
      "This environment variable name is reserved for the sandbox runtime."
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
