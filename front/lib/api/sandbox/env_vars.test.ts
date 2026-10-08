import {
  normalizeAllowedDomainsForKind,
  normalizeHttpsSecretAllowedDomains,
  parseSandboxEnvVarNameForKind,
  validateEnvVarName,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import { describe, expect, it } from "vitest";

describe("validateEnvVarName (suffix-only)", () => {
  it("accepts well-formed suffixes", () => {
    expect(validateEnvVarName("API_TOKEN").isOk()).toBe(true);
    expect(validateEnvVarName("A").isOk()).toBe(true);
    expect(validateEnvVarName("A_123").isOk()).toBe(true);
    // Suffixes that contain a substring that looks like a prefix are fine
    // (we strip at most one prefix in parseSandboxEnvVarNameForKind).
    expect(validateEnvVarName("DST_LEGACY").isOk()).toBe(true);
  });

  it("rejects names that don't match the suffix pattern", () => {
    for (const name of [
      "_FOO",
      "foo",
      "1FOO",
      "API-TOKEN",
      "",
      "A".repeat(65),
    ]) {
      expect(validateEnvVarName(name).isErr()).toBe(true);
    }
  });
});

describe("parseSandboxEnvVarNameForKind", () => {
  it("accepts the prefixed form for the matching kind and strips it", () => {
    const config = parseSandboxEnvVarNameForKind({
      kind: "config",
      name: "DST_FOO",
    });
    expect(config.isOk()).toBe(true);
    if (config.isOk()) {
      expect(config.value).toBe("FOO");
    }

    const secret = parseSandboxEnvVarNameForKind({
      kind: "https_secret",
      name: "DSEC_FOO",
    });
    expect(secret.isOk()).toBe(true);
    if (secret.isOk()) {
      expect(secret.value).toBe("FOO");
    }
  });

  it("accepts the suffix-only form", () => {
    const config = parseSandboxEnvVarNameForKind({
      kind: "config",
      name: "FOO",
    });
    expect(config.isOk()).toBe(true);
    if (config.isOk()) {
      expect(config.value).toBe("FOO");
    }
  });

  it("rejects cross-prefix mismatches", () => {
    expect(
      parseSandboxEnvVarNameForKind({
        kind: "config",
        name: "DSEC_FOO",
      }).isErr()
    ).toBe(true);
    expect(
      parseSandboxEnvVarNameForKind({
        kind: "https_secret",
        name: "DST_FOO",
      }).isErr()
    ).toBe(true);
  });

  it("strips at most one prefix layer (suffix containing DST_ survives)", () => {
    const result = parseSandboxEnvVarNameForKind({
      kind: "config",
      name: "DST_DST_LEGACY",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("DST_LEGACY");
    }
  });

  it("rejects bad inputs that don't validate as suffix or prefixed-suffix", () => {
    for (const name of [
      "DST_",
      "DST_lower",
      "api-token",
      "DST_API-TOKEN",
      `DST_${"A".repeat(65)}`,
    ]) {
      expect(
        parseSandboxEnvVarNameForKind({
          kind: "config",
          name,
        }).isErr()
      ).toBe(true);
    }
  });
});

describe("validateEnvVarValueForKind", () => {
  it("config: allows multiline values up to the cap", () => {
    expect(
      validateEnvVarValueForKind({ kind: "config", value: "" }).isErr()
    ).toBe(true);
    expect(
      validateEnvVarValueForKind({
        kind: "config",
        value: "line 1\nline 2",
      }).isOk()
    ).toBe(true);
    expect(
      validateEnvVarValueForKind({
        kind: "config",
        value: "abc\u0000def",
      }).isErr()
    ).toBe(true);
    expect(
      validateEnvVarValueForKind({
        kind: "config",
        value: "a".repeat(32 * 1_024 + 1),
      }).isErr()
    ).toBe(true);
  });

  it("https_secret: rejects control bytes and caps at 4 KiB", () => {
    expect(
      validateEnvVarValueForKind({
        kind: "https_secret",
        value: "ok-token-1234",
      }).isOk()
    ).toBe(true);
    for (const value of [
      "",
      "line 1\nline 2",
      "carriage\rreturn",
      "abc\u0000def",
      "a".repeat(4 * 1_024 + 1),
    ]) {
      expect(
        validateEnvVarValueForKind({ kind: "https_secret", value }).isErr()
      ).toBe(true);
    }
  });
});

describe("normalizeHttpsSecretAllowedDomains", () => {
  it("accepts exact domains with two labels and wildcards", () => {
    expect(
      normalizeHttpsSecretAllowedDomains(["API.GitHub.COM.", "*.mistral.ai"])
    ).toMatchObject({ value: ["api.github.com", "*.mistral.ai"] });
  });

  it("rejects single-label exact domains, as dsbx does", () => {
    for (const domain of ["localhost", "intranet", "LOCALHOST."]) {
      const result = normalizeHttpsSecretAllowedDomains([
        "api.github.com",
        domain,
      ]);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("https_secret_single_label");
        expect(result.error.message).toContain("at least two DNS labels");
      }
    }
  });

  it("applies to https_secret rows through the kind-aware normalizer", () => {
    expect(
      normalizeAllowedDomainsForKind({
        kind: "https_secret",
        allowedDomains: ["localhost"],
        requiredForSecret: true,
      }).isErr()
    ).toBe(true);
    expect(
      normalizeAllowedDomainsForKind({
        kind: "https_secret",
        allowedDomains: ["api.github.com"],
        requiredForSecret: true,
      })
    ).toMatchObject({ value: ["api.github.com"] });
  });
});
