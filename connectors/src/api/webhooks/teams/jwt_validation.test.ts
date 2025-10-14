import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  generateTeamsRateLimitKey,
} from "./jwt_validation";

describe("JWT Validation Utils", () => {
  describe("extractBearerToken", () => {
    it("should extract token from valid Bearer header", () => {
      const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.test.signature";
      const authHeader = `Bearer ${token}`;

      const result = extractBearerToken(authHeader);

      expect(result).toBe(token);
    });

    it("should return null for missing header", () => {
      const result = extractBearerToken(undefined);
      expect(result).toBeNull();
    });

    it("should return null for malformed header", () => {
      const result = extractBearerToken("NotBearer token");
      expect(result).toBeNull();
    });

    it("should handle case insensitive Bearer", () => {
      const token = "test-token";
      const authHeader = `bearer ${token}`;

      const result = extractBearerToken(authHeader);
      expect(result).toBe(token);
    });
  });

  describe("generateTeamsRateLimitKey", () => {
    it("should generate consistent keys for same inputs", () => {
      const appId = "test-app-id";
      const serviceUrl = "https://smba.trafficmanager.net/test";
      const clientIp = "192.168.1.1";

      const key1 = generateTeamsRateLimitKey(appId, serviceUrl, clientIp);
      const key2 = generateTeamsRateLimitKey(appId, serviceUrl, clientIp);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^teams_webhook:[a-f0-9]{16}$/);
    });

    it("should generate different keys for different inputs", () => {
      const baseAppId = "test-app-id";
      const baseServiceUrl = "https://smba.trafficmanager.net/test";
      const baseClientIp = "192.168.1.1";

      const key1 = generateTeamsRateLimitKey(
        baseAppId,
        baseServiceUrl,
        baseClientIp
      );
      const key2 = generateTeamsRateLimitKey(
        "different-app",
        baseServiceUrl,
        baseClientIp
      );
      const key3 = generateTeamsRateLimitKey(
        baseAppId,
        "https://different.url",
        baseClientIp
      );

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });
});
