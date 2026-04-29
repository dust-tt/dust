import { describe, expect, it } from "vitest";

import {
  domainMatchesAllowlist,
  EMPTY_EGRESS_POLICY,
  normalizeEgressPolicyDomain,
  normalizeEgressPolicyDomains,
  parseEgressPolicy,
} from "./egress_policy";

describe("egress policy domain validation", () => {
  it("normalizes exact and wildcard domains", () => {
    expect(normalizeEgressPolicyDomain("API.GitHub.COM.")).toMatchObject({
      value: "api.github.com",
    });
    expect(normalizeEgressPolicyDomain(" *.GitHub.COM. ")).toMatchObject({
      value: "*.github.com",
    });
  });

  it("deduplicates domains while preserving order", () => {
    const result = normalizeEgressPolicyDomains([
      "api.github.com",
      "API.GitHub.COM.",
      "*.github.com",
    ]);

    expect(result).toMatchObject({
      value: ["api.github.com", "*.github.com"],
    });
  });

  it("rejects IP literals and malformed wildcard entries", () => {
    for (const domain of [
      "127.0.0.1",
      "::1",
      "[::1]",
      "*.com",
      "*.*.github.com",
      "*github.com",
      "bad domain",
      "github..com",
      "127.0.0",
      "192.168",
      "10",
    ]) {
      expect(normalizeEgressPolicyDomain(domain).isErr()).toBe(true);
    }
  });

  it("returns a clear message for IP literals", () => {
    for (const domain of ["127.0.0.1", "::1", "[::1]"]) {
      const result = normalizeEgressPolicyDomain(domain);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("IP addresses are not supported.");
      }
    }
  });

  it("parses and normalizes policy objects", () => {
    const result = parseEgressPolicy({
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    });

    expect(result).toMatchObject({
      value: {
        allowedDomains: ["api.github.com", "*.github.com"],
      },
    });
  });

  it("matches exact and wildcard allowlist entries like the Rust proxy", () => {
    expect(domainMatchesAllowlist("api.github.com", ["*.github.com"])).toBe(
      true,
    );
    expect(domainMatchesAllowlist("a.b.github.com", ["*.github.com"])).toBe(
      true,
    );
    expect(domainMatchesAllowlist("github.com", ["*.github.com"])).toBe(false);
    expect(domainMatchesAllowlist("notgithub.com", ["*.github.com"])).toBe(
      false,
    );
    expect(domainMatchesAllowlist("API.GITHUB.COM.", ["*.github.com"])).toBe(
      true,
    );
    expect(domainMatchesAllowlist("github.com", ["github.com"])).toBe(true);
    expect(domainMatchesAllowlist("api.github.com", ["github.com"])).toBe(
      false,
    );
  });

  it("keeps non-ASCII DNS label handling aligned with the Rust proxy", () => {
    expect(domainMatchesAllowlist("éxample.com", ["éxample.com"])).toBe(false);
    expect(
      domainMatchesAllowlist("xn--xample-9ua.com", ["xn--xample-9ua.com"]),
    ).toBe(true);
  });

  it("keeps the empty policy singleton immutable", () => {
    expect(Object.isFrozen(EMPTY_EGRESS_POLICY)).toBe(true);
    expect(Object.isFrozen(EMPTY_EGRESS_POLICY.allowedDomains)).toBe(true);
  });
});
