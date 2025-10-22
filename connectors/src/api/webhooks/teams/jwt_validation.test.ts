import { describe, expect, it } from "vitest";

import { extractBearerToken } from "./jwt_validation";

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
});
