import { parseWorkOSJwtPayload } from "@app/lib/api/workos";
import { describe, expect, it } from "vitest";

describe("parseWorkOSJwtPayload", () => {
  it("accepts a valid payload with required fields", () => {
    const payload = {
      sub: "user_123",
      exp: 1_700_000_000,
    };

    const result = parseWorkOSJwtPayload(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sub).toBe("user_123");
      expect(result.value.exp).toBe(1_700_000_000);
    }
  });

  it("accepts optional string and number claims", () => {
    const payload = {
      sub: "user_123",
      exp: 1_700_000_000,
      org_id: "org_abc",
      iat: 1_699_999_000,
    };

    const result = parseWorkOSJwtPayload(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.org_id).toBe("org_abc");
      expect(result.value.iat).toBe(1_699_999_000);
    }
  });

  it("rejects a payload missing sub", () => {
    const result = parseWorkOSJwtPayload({
      exp: 1_700_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Invalid token payload.");
    }
  });

  it("rejects a payload missing exp", () => {
    const result = parseWorkOSJwtPayload({
      sub: "user_123",
    });

    expect(result.isErr()).toBe(true);
  });

  it("rejects a payload with invalid claim types", () => {
    const result = parseWorkOSJwtPayload({
      sub: "user_123",
      exp: 1_700_000_000,
      org_id: { nested: "object" },
    });

    expect(result.isErr()).toBe(true);
  });
});
