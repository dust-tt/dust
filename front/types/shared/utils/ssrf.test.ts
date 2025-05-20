import { describe, expect, it } from "vitest";

import { checkIpIsNotOK } from "./ssrf";

describe("SSRF Utils", () => {
  describe("checkIpIsPrivate", () => {
    // Test simple ranges (0.x.x.x, 127.x.x.x, 10.x.x.x, 192.168.x.x, 169.254.x.x)
    it("should identify simple private IP ranges", () => {
      expect(checkIpIsNotOK("0.0.0.0")).toBe(true);
      expect(checkIpIsNotOK("127.0.0.1")).toBe(true);
      expect(checkIpIsNotOK("10.0.0.1")).toBe(true);
      expect(checkIpIsNotOK("192.168.1.1")).toBe(true);
      expect(checkIpIsNotOK("169.254.1.1")).toBe(true);
    });

    // Test 172.16-31.x.x range
    it("should identify 172.16-31.x.x private IP range", () => {
      expect(checkIpIsNotOK("172.16.0.1")).toBe(true);
      expect(checkIpIsNotOK("172.20.0.1")).toBe(true);
      expect(checkIpIsNotOK("172.31.255.255")).toBe(true);

      // Not private
      expect(checkIpIsNotOK("172.15.0.1")).toBe(false);
      expect(checkIpIsNotOK("172.32.0.1")).toBe(false);
    });

    // Test 100.64-127.x.x range
    it("should identify 100.64-127.x.x private IP range", () => {
      expect(checkIpIsNotOK("100.64.0.1")).toBe(true);
      expect(checkIpIsNotOK("100.100.0.1")).toBe(true);
      expect(checkIpIsNotOK("100.127.255.255")).toBe(true);

      // Not private
      expect(checkIpIsNotOK("100.63.0.1")).toBe(false);
      expect(checkIpIsNotOK("100.128.0.1")).toBe(false);
    });

    // Test public IPs
    it("should identify public IPs as non-private", () => {
      expect(checkIpIsNotOK("8.8.8.8")).toBe(false);
      expect(checkIpIsNotOK("1.1.1.1")).toBe(false);
      expect(checkIpIsNotOK("208.67.222.222")).toBe(false);
    });

    // Test invalid IPs
    it("should handle invalid IP addresses", () => {
      expect(checkIpIsNotOK("invalid")).toBe(false);
      expect(checkIpIsNotOK("256.256.256.256")).toBe(false);
      expect(checkIpIsNotOK("1.2.3.4.5")).toBe(false);
    });
  });
});
