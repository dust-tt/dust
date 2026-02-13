import { describe, expect, it } from "vitest";

import { isValidSnowflakeAccount } from "./lib";

describe("isValidSnowflakeAccount", () => {
  it("should accept valid account identifiers", () => {
    // Legacy locator format
    expect(isValidSnowflakeAccount("abc123")).toBe(true);
    expect(isValidSnowflakeAccount("xy12345")).toBe(true);

    // Locator with region
    expect(isValidSnowflakeAccount("abc123.us-east-1")).toBe(true);
    expect(isValidSnowflakeAccount("th19603.us-east4.gcp")).toBe(true);
    expect(isValidSnowflakeAccount("abc123.eu-west-1.aws")).toBe(true);

    // Organization name format
    expect(isValidSnowflakeAccount("myorg-myaccount")).toBe(true);
    expect(isValidSnowflakeAccount("company_name-prod")).toBe(true);

    // Privatelink format
    expect(isValidSnowflakeAccount("myorg-myaccount.privatelink")).toBe(true);
  });

  it("should reject invalid account identifiers", () => {
    // Empty or whitespace
    expect(isValidSnowflakeAccount("")).toBe(false);
    expect(isValidSnowflakeAccount("   ")).toBe(false);

    // Non-string types
    expect(isValidSnowflakeAccount(null)).toBe(false);
    expect(isValidSnowflakeAccount(undefined)).toBe(false);
    expect(isValidSnowflakeAccount(123)).toBe(false);
    expect(isValidSnowflakeAccount({})).toBe(false);

    // Too loose / likely noise (no digit, no hyphen)
    expect(isValidSnowflakeAccount("sdasd")).toBe(false);

    // Invalid characters
    expect(isValidSnowflakeAccount("account@name")).toBe(false);
    expect(isValidSnowflakeAccount("account/name")).toBe(false);
    expect(isValidSnowflakeAccount("account:name")).toBe(false);

    // Hostname/URL pasted instead of identifier
    expect(isValidSnowflakeAccount("abc123.snowflakecomputing.com")).toBe(
      false
    );
    expect(
      isValidSnowflakeAccount("https://abc123.snowflakecomputing.com")
    ).toBe(false);

    // Dots that look like hostnames / typos
    expect(isValidSnowflakeAccount("abc..us-east-1")).toBe(false);

    // Starting/ending with special chars
    expect(isValidSnowflakeAccount("-abc")).toBe(false);
    expect(isValidSnowflakeAccount("abc-")).toBe(false);
    expect(isValidSnowflakeAccount(".abc")).toBe(false);
    expect(isValidSnowflakeAccount("abc.")).toBe(false);
  });

  it("should handle edge cases", () => {
    // Single character (might be valid, but our regex requires 2+)
    expect(isValidSnowflakeAccount("a")).toBe(false);

    // Two characters (minimum valid)
    expect(isValidSnowflakeAccount("ab")).toBe(false);

    // With whitespace (should be trimmed internally)
    expect(isValidSnowflakeAccount(" abc123 ")).toBe(true);
  });
});
