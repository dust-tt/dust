import { describe, expect, it } from "vitest";

import { isTrustedNavigationHostname } from "@viz/app/lib/trustedNavigationDomains";

describe("isTrustedNavigationHostname", () => {
  const trustedDomains = ["dust.tt", "eu.dust.tt"];

  it("allows exact trusted domains", () => {
    expect(isTrustedNavigationHostname("dust.tt", trustedDomains)).toBe(true);
    expect(isTrustedNavigationHostname("eu.dust.tt", trustedDomains)).toBe(
      true
    );
  });

  it("allows subdomains of trusted domains", () => {
    expect(isTrustedNavigationHostname("app.dust.tt", trustedDomains)).toBe(
      true
    );
    expect(
      isTrustedNavigationHostname("foo.eu.dust.tt", trustedDomains)
    ).toBe(true);
  });

  it("rejects hostnames that only end with the trusted domain string", () => {
    expect(isTrustedNavigationHostname("evildust.tt", trustedDomains)).toBe(
      false
    );
    expect(
      isTrustedNavigationHostname("evil-eu.dust.tt", ["eu.dust.tt"])
    ).toBe(false);
  });

  it("rejects hostnames that append an untrusted suffix after a trusted domain", () => {
    expect(
      isTrustedNavigationHostname("dust.tt.evil.com", trustedDomains)
    ).toBe(false);
    expect(
      isTrustedNavigationHostname("eu.dust.tt.evil.com", trustedDomains)
    ).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isTrustedNavigationHostname("APP.DUST.TT", trustedDomains)).toBe(
      true
    );
  });
});
