import {
  isReservedEnvVarName,
  validateEnvVarName,
  validateEnvVarValue,
} from "@app/lib/api/sandbox/env_vars";
import { describe, expect, it } from "vitest";

describe("sandbox env var validation", () => {
  it("accepts valid POSIX-style names", () => {
    expect(validateEnvVarName("API_TOKEN").isOk()).toBe(true);
    expect(validateEnvVarName("A").isOk()).toBe(true);
    expect(validateEnvVarName("A_123").isOk()).toBe(true);
  });

  it("rejects names outside the allowed pattern", () => {
    expect(validateEnvVarName("api_token").isErr()).toBe(true);
    expect(validateEnvVarName("1_API_TOKEN").isErr()).toBe(true);
    expect(validateEnvVarName("API-TOKEN").isErr()).toBe(true);
    expect(validateEnvVarName("A".repeat(65)).isErr()).toBe(true);
  });

  it("rejects exact reserved names, prefixes, and leading underscores", () => {
    for (const name of [
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
      "_PRIVATE",
      "LD_PRELOAD",
      "DUST_API_KEY",
      "SANDBOX_TOKEN",
      "E2B_API_KEY",
      "DD_API_KEY",
      "CONVERSATION_ID",
      "WORKSPACE_ID",
    ]) {
      expect(validateEnvVarName(name).isErr()).toBe(true);
      expect(isReservedEnvVarName(name)).toBe(true);
    }
  });

  it("validates value constraints while allowing multiline values", () => {
    expect(validateEnvVarValue("").isErr()).toBe(true);
    expect(validateEnvVarValue("abc\u0000def").isErr()).toBe(true);
    expect(validateEnvVarValue("line 1\nline 2").isOk()).toBe(true);
    expect(validateEnvVarValue("a".repeat(32 * 1024 + 1)).isErr()).toBe(true);
  });
});
