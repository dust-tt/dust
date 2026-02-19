import { describe, expect, it } from "vitest";

import { isHostUnderDomain, isIpAddress } from "./url_utils";

describe("isIpAddress", () => {
  describe("IPv4 addresses", () => {
    it("should accept valid IPv4 addresses", () => {
      expect(isIpAddress("192.168.1.1")).toBe(true);
      expect(isIpAddress("10.0.0.1")).toBe(true);
      expect(isIpAddress("0.0.0.0")).toBe(true);
      expect(isIpAddress("255.255.255.255")).toBe(true);
      expect(isIpAddress("127.0.0.1")).toBe(true);
      expect(isIpAddress("1.1.1.1")).toBe(true);
    });

    it("should reject invalid IPv4 addresses", () => {
      // Octets out of range
      expect(isIpAddress("256.1.1.1")).toBe(false);
      expect(isIpAddress("1.256.1.1")).toBe(false);
      expect(isIpAddress("1.1.256.1")).toBe(false);
      expect(isIpAddress("1.1.1.256")).toBe(false);
      expect(isIpAddress("999.999.999.999")).toBe(false);

      // Wrong number of octets
      expect(isIpAddress("1.2.3")).toBe(false);
      expect(isIpAddress("1.2")).toBe(false);
      expect(isIpAddress("1")).toBe(false);
      expect(isIpAddress("1.2.3.4.5")).toBe(false);

      // Invalid formats
      expect(isIpAddress("")).toBe(false);
      expect(isIpAddress("...")).toBe(false);
      expect(isIpAddress("1...1")).toBe(false);
      expect(isIpAddress(".1.1.1.1")).toBe(false);
      expect(isIpAddress("1.1.1.1.")).toBe(false);
    });
  });

  describe("IPv6 addresses", () => {
    it("should accept valid IPv6 addresses with brackets", () => {
      expect(isIpAddress("[::1]")).toBe(true);
      expect(isIpAddress("[2001:db8::1]")).toBe(true);
      expect(isIpAddress("[::ffff:192.168.1.1]")).toBe(true);
      expect(isIpAddress("[2001:0db8:85a3:0000:0000:8a2e:0370:7334]")).toBe(
        true
      );
      expect(isIpAddress("[fe80::1]")).toBe(true);
    });

    it("should accept valid raw IPv6 addresses without brackets", () => {
      expect(isIpAddress("::1")).toBe(true);
      expect(isIpAddress("2001:db8::1")).toBe(true);
      expect(isIpAddress("fe80::1")).toBe(true);
      expect(isIpAddress("::ffff:192.168.1.1")).toBe(true);
    });

    it("should reject invalid IPv6 addresses", () => {
      expect(isIpAddress("[invalid]")).toBe(false);
      expect(isIpAddress("[::gggg]")).toBe(false);
      expect(isIpAddress("[]")).toBe(false);
      expect(isIpAddress("[")).toBe(false);
      expect(isIpAddress("]")).toBe(false);
    });
  });

  describe("non-IP hostnames", () => {
    it("should reject domain names", () => {
      expect(isIpAddress("example.com")).toBe(false);
      expect(isIpAddress("sub.example.com")).toBe(false);
      expect(isIpAddress("localhost")).toBe(false);
      expect(isIpAddress("my-server.local")).toBe(false);
    });

    it("should reject mixed/invalid formats", () => {
      expect(isIpAddress("192.168.1.1:8080")).toBe(false);
      expect(isIpAddress("http://192.168.1.1")).toBe(false);
      expect(isIpAddress("192.168.1.1/24")).toBe(false);
      expect(isIpAddress("abc123")).toBe(false);
      expect(isIpAddress("0")).toBe(false);
    });
  });
});

describe("isHostUnderDomain", () => {
  describe("exact matches", () => {
    it("should match identical domains", () => {
      expect(isHostUnderDomain("example.com", "example.com")).toBe(true);
      expect(isHostUnderDomain("sub.example.com", "sub.example.com")).toBe(
        true
      );
    });

    it("should match case-insensitively", () => {
      expect(isHostUnderDomain("EXAMPLE.COM", "example.com")).toBe(true);
      expect(isHostUnderDomain("example.com", "EXAMPLE.COM")).toBe(true);
      expect(isHostUnderDomain("Example.Com", "example.com")).toBe(true);
    });

    it("should handle trailing dots", () => {
      expect(isHostUnderDomain("example.com.", "example.com")).toBe(true);
      expect(isHostUnderDomain("example.com", "example.com.")).toBe(true);
      expect(isHostUnderDomain("example.com.", "example.com.")).toBe(true);
    });
  });

  describe("subdomain matches", () => {
    it("should match subdomains", () => {
      expect(isHostUnderDomain("sub.example.com", "example.com")).toBe(true);
      expect(isHostUnderDomain("deep.sub.example.com", "example.com")).toBe(
        true
      );
      expect(isHostUnderDomain("a.b.c.example.com", "example.com")).toBe(true);
    });

    it("should match subdomains case-insensitively", () => {
      expect(isHostUnderDomain("SUB.EXAMPLE.COM", "example.com")).toBe(true);
      expect(isHostUnderDomain("sub.example.com", "EXAMPLE.COM")).toBe(true);
    });

    it("should match subdomains with trailing dots", () => {
      expect(isHostUnderDomain("sub.example.com.", "example.com")).toBe(true);
      expect(isHostUnderDomain("sub.example.com", "example.com.")).toBe(true);
    });
  });

  describe("non-matches", () => {
    it("should not match unrelated domains", () => {
      expect(isHostUnderDomain("other.com", "example.com")).toBe(false);
      expect(isHostUnderDomain("example.org", "example.com")).toBe(false);
    });

    it("should not match partial suffix matches", () => {
      // "notexample.com" ends with "example.com" but is not a subdomain
      expect(isHostUnderDomain("notexample.com", "example.com")).toBe(false);
      expect(isHostUnderDomain("fakeexample.com", "example.com")).toBe(false);
      expect(isHostUnderDomain("myexample.com", "example.com")).toBe(false);
    });

    it("should not match when host is shorter than domain", () => {
      expect(isHostUnderDomain("com", "example.com")).toBe(false);
      expect(isHostUnderDomain("example", "example.com")).toBe(false);
    });

    it("should not match reversed relationship", () => {
      expect(isHostUnderDomain("example.com", "sub.example.com")).toBe(false);
    });
  });
});
