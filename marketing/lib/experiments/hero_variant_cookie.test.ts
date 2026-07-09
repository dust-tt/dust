import { afterEach, describe, expect, it } from "vitest";

import {
  HERO_VARIANT_COOKIE,
  buildHeroVariantServerCookieString,
  readHeroVariantFromDocumentCookie,
} from "@marketing/lib/experiments/hero_variant_cookie";

// Expire anything jsdom retained between tests so cookie reads start clean.
afterEach(() => {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) {
      document.cookie = `${name}=; max-age=0`;
    }
  }
});

describe("hero_variant_cookie", () => {
  describe("buildHeroVariantServerCookieString", () => {
    it("scopes the cookie to .dust.tt on production hosts", () => {
      const cookie = buildHeroVariantServerCookieString(
        "collaboration",
        "dust.tt"
      );
      expect(cookie).toContain(`${HERO_VARIANT_COOKIE}=collaboration`);
      expect(cookie).toContain("domain=.dust.tt");
      expect(cookie).toContain("path=/");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");
    });

    it("shares the cookie across app/eu subdomains", () => {
      expect(
        buildHeroVariantServerCookieString("control", "app.dust.tt")
      ).toContain("domain=.dust.tt");
      expect(
        buildHeroVariantServerCookieString("control", "eu.dust.tt")
      ).toContain("domain=.dust.tt");
    });

    it("stays host-only on localhost / preview hosts (no domain attribute)", () => {
      expect(
        buildHeroVariantServerCookieString("control", "localhost:3000")
      ).not.toContain("domain=");
      expect(
        buildHeroVariantServerCookieString("control", undefined)
      ).not.toContain("domain=");
    });

    it("bounds the cookie to a 30-day attribution window", () => {
      const thirtyDaysSeconds = 60 * 60 * 24 * 30;
      expect(
        buildHeroVariantServerCookieString("control", "dust.tt")
      ).toContain(`max-age=${thirtyDaysSeconds}`);
    });
  });

  describe("readHeroVariantFromDocumentCookie", () => {
    it("reads back a valid variant", () => {
      document.cookie = `${HERO_VARIANT_COOKIE}=collaboration`;
      expect(readHeroVariantFromDocumentCookie()).toBe("collaboration");
    });

    it("returns null when the cookie is absent", () => {
      expect(readHeroVariantFromDocumentCookie()).toBeNull();
    });

    it("returns null for an unrecognized variant value", () => {
      // Guards against a stale/tampered cookie leaking a bogus variant into
      // conversion tracking.
      document.cookie = `${HERO_VARIANT_COOKIE}=bogus`;
      expect(readHeroVariantFromDocumentCookie()).toBeNull();
    });
  });
});
