import { describe, expect, it } from "vitest";

import {
  DUST_ANONYMOUS_ID_COOKIE,
  buildDustAidServerCookieString,
  readAnonymousIdFromCookies,
  serverCookieDomainForHost,
} from "@marketing/lib/utils/anonymous_id";

describe("anonymous_id", () => {
  describe("serverCookieDomainForHost", () => {
    it("returns .dust.tt for the apex and its subdomains", () => {
      expect(serverCookieDomainForHost("dust.tt")).toBe(".dust.tt");
      expect(serverCookieDomainForHost("app.dust.tt")).toBe(".dust.tt");
      expect(serverCookieDomainForHost("eu.dust.tt")).toBe(".dust.tt");
    });

    it("ignores the port when matching the host", () => {
      expect(serverCookieDomainForHost("dust.tt:443")).toBe(".dust.tt");
    });

    it("returns null (host-only) for localhost and preview hosts", () => {
      expect(serverCookieDomainForHost("localhost:3000")).toBeNull();
      expect(serverCookieDomainForHost("some-preview.vercel.app")).toBeNull();
      expect(serverCookieDomainForHost(undefined)).toBeNull();
    });

    it("does not match look-alike suffixes", () => {
      // `notdust.tt` ends with "dust.tt" as a string but is a different domain;
      // only "dust.tt" or a real ".dust.tt" subdomain should share the cookie.
      expect(serverCookieDomainForHost("notdust.tt")).toBeNull();
    });
  });

  describe("buildDustAidServerCookieString", () => {
    it("produces a cookie the client-side parser reads back identically", () => {
      const cookie = buildDustAidServerCookieString("abc-123", "dust.tt");
      expect(cookie).toContain(`${DUST_ANONYMOUS_ID_COOKIE}=abc-123`);
      expect(cookie).toContain("domain=.dust.tt");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");
    });

    it("omits the domain attribute on host-only hosts", () => {
      expect(
        buildDustAidServerCookieString("abc-123", "localhost:3000")
      ).not.toContain("domain=");
    });
  });

  describe("readAnonymousIdFromCookies", () => {
    it("extracts the id from a Cookie header among other cookies", () => {
      const header = `foo=bar; ${DUST_ANONYMOUS_ID_COOKIE}=abc-123; baz=qux`;
      expect(readAnonymousIdFromCookies(header)).toBe("abc-123");
    });

    it("returns null when the id cookie or header is absent", () => {
      expect(readAnonymousIdFromCookies("foo=bar")).toBeNull();
      expect(readAnonymousIdFromCookies(undefined)).toBeNull();
    });
  });
});
