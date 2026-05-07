import type { WorkspaceSandboxEnvVarKind } from "@app/types/sandbox/env_var";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const SANDBOX_ENV_VAR_PREFIX = "DST_";
export const SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX = "DSEC_";
// Suffix max length is 64 — the wire form is `<prefix><suffix>` (e.g. "DSEC_FOO"),
// so the rendered name fits comfortably under typical 128-char env-var limits
// even with our longest prefix.
export const ENV_VAR_NAME_SUFFIX_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;
export const ENV_VAR_NAME_REGEX = ENV_VAR_NAME_SUFFIX_REGEX;
export const MAX_VALUE_BYTES = 32 * 1_024;
// Tighter than MAX_VALUE_BYTES because https_secret values are substituted
// into HTTP header lines on the wire — most upstreams cap header lines
// around 8-16 KiB. We pick well below the low end to leave headroom for the
// rest of the request line + other headers.
export const MAX_HTTPS_SECRET_VALUE_BYTES = 4 * 1_024;
export const MAX_VARS_PER_WORKSPACE = 50;

const ENV_VAR_PREFIX_BY_KIND: Record<WorkspaceSandboxEnvVarKind, string> = {
  config: SANDBOX_ENV_VAR_PREFIX,
  https_secret: SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX,
};

export function validateEnvVarName(name: string): Result<void, string> {
  if (!ENV_VAR_NAME_REGEX.test(name)) {
    return new Err(
      "Environment variable names must start with A-Z and contain only A-Z, digits or underscores (up to 64 characters)."
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
    return new Err(
      `Environment variable values cannot exceed ${MAX_VALUE_BYTES / 1_024} KiB.`
    );
  }

  return new Ok(undefined);
}

// Stricter than validateEnvVarValue because https_secret values are
// substituted into HTTP header lines on the wire — embedded CR/LF/NUL/control
// bytes would let an admin smuggle headers via the substituted value.
function validateHttpsSecretValue(value: string): Result<void, string> {
  if (value.length === 0) {
    return new Err("HTTPS secret values cannot be empty.");
  }

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return new Err("HTTPS secret values cannot contain ASCII control bytes.");
  }

  if (Buffer.byteLength(value, "utf8") > MAX_HTTPS_SECRET_VALUE_BYTES) {
    return new Err(
      `HTTPS secret values cannot exceed ${MAX_HTTPS_SECRET_VALUE_BYTES / 1_024} KiB.`
    );
  }

  return new Ok(undefined);
}

export function validateEnvVarValueForKind({
  kind,
  value,
}: {
  kind: WorkspaceSandboxEnvVarKind;
  value: string;
}): Result<void, string> {
  switch (kind) {
    case "config":
      return validateEnvVarValue(value);
    case "https_secret":
      return validateHttpsSecretValue(value);
    default:
      assertNever(kind);
  }
}

export function envVarPrefixForKind(kind: WorkspaceSandboxEnvVarKind): string {
  return ENV_VAR_PREFIX_BY_KIND[kind];
}

// Format used both as the agent-visible env var (DSEC_*) for HTTPS secrets
// and as the placeholder field of /run/dust/egress-secrets.json that dsbx
// scans for at MITM time. Both call sites must agree byte-for-byte.
export function renderEgressSecretPlaceholder(nonce: Buffer): string {
  return `__DSEC_${nonce.toString("hex")}__`;
}

export function renderWorkspaceSandboxEnvVarName({
  kind,
  name,
}: {
  kind: WorkspaceSandboxEnvVarKind;
  name: string;
}): string {
  return `${envVarPrefixForKind(kind)}${name}`;
}

// Accepts both prefixed (e.g. "DST_FOO") and suffix-only (e.g. "FOO") inputs.
// - If the input starts with a known prefix, it must match the expected
//   prefix for `kind` (cross-prefix mismatch is rejected).
// - Otherwise the input is validated as a bare suffix and returned as-is.
//   This bare-suffix branch is what lets new-style API clients POST
//   suffix-only names without knowing the prefix convention.
export function parseWorkspaceSandboxEnvVarNameForKind({
  kind,
  name,
}: {
  kind: WorkspaceSandboxEnvVarKind;
  name: string;
}): Result<string, string> {
  const expectedPrefix = envVarPrefixForKind(kind);

  for (const prefix of Object.values(ENV_VAR_PREFIX_BY_KIND)) {
    if (name.startsWith(prefix)) {
      if (prefix !== expectedPrefix) {
        return new Err(
          `Environment variable name ${name} has prefix ${prefix}, expected ${expectedPrefix}.`
        );
      }

      const suffix = name.slice(prefix.length);
      const suffixValidation = validateEnvVarName(suffix);
      if (suffixValidation.isErr()) {
        return suffixValidation;
      }

      return new Ok(suffix);
    }
  }

  // Bare-suffix branch: no recognized prefix, validate the raw input as a
  // suffix and return it.
  const validation = validateEnvVarName(name);
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(name);
}
