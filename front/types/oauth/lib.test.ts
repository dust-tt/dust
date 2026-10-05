import { describe, expect, it } from "vitest";

import {
  isValidSalesforceDomain,
  isValidShopifyStoreDomain,
  isValidSnowflakeAccount,
  isValidSnowflakeRole,
  normalizeShopifyStoreDomain,
  snowflakeRoleToOAuthScope,
} from "./lib";

describe("Shopify store domain", () => {
  it("accepts and normalizes permanent myshopify.com domains", () => {
    expect(isValidShopifyStoreDomain("my-store.myshopify.com")).toBe(true);
    expect(normalizeShopifyStoreDomain(" MY-STORE.MYSHOPIFY.COM ")).toBe(
      "my-store.myshopify.com"
    );
  });

  it("rejects custom domains and invalid hostnames", () => {
    expect(isValidShopifyStoreDomain("shop.example.com")).toBe(false);
    expect(isValidShopifyStoreDomain("evil.myshopify.com.example.com")).toBe(
      false
    );
    expect(isValidShopifyStoreDomain("https://my-store.myshopify.com")).toBe(
      false
    );
  });
});

describe("isValidSalesforceDomain", () => {
  it("accepts bare https Salesforce origins", () => {
    expect(isValidSalesforceDomain("https://my-org.salesforce.com")).toBe(true);
    expect(isValidSalesforceDomain("https://my-org.my.salesforce.com")).toBe(
      true
    );
  });

  it("rejects hosts that only end with .salesforce.com as a string", () => {
    expect(
      isValidSalesforceDomain("https://evil.example/x.salesforce.com")
    ).toBe(false);
    expect(
      isValidSalesforceDomain("https://evil.example?.salesforce.com")
    ).toBe(false);
    expect(
      isValidSalesforceDomain("https://evil.example#.salesforce.com")
    ).toBe(false);
    expect(
      isValidSalesforceDomain("https://user@evil.example/.salesforce.com")
    ).toBe(false);
  });

  it("rejects non-https, paths, ports, uppercase hosts and non-strings", () => {
    expect(isValidSalesforceDomain("http://my-org.salesforce.com")).toBe(false);
    expect(isValidSalesforceDomain("https://my-org.salesforce.com/")).toBe(
      false
    );
    expect(isValidSalesforceDomain("https://my-org.salesforce.com/api")).toBe(
      false
    );
    expect(isValidSalesforceDomain("https://my-org.salesforce.com:443")).toBe(
      false
    );
    expect(isValidSalesforceDomain("https://my-org.salesforce.com:8443")).toBe(
      false
    );
    expect(isValidSalesforceDomain("https://MY-ORG.salesforce.com")).toBe(
      false
    );
    expect(isValidSalesforceDomain("https://salesforce.com")).toBe(false);
    expect(isValidSalesforceDomain(undefined)).toBe(false);
  });
});

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

describe("isValidSnowflakeRole", () => {
  it("accepts unquoted and quoted-identifier role names", () => {
    expect(isValidSnowflakeRole("ANALYST")).toBe(true);
    expect(isValidSnowflakeRole("dev_role")).toBe(true);
    expect(isValidSnowflakeRole("test@example.com")).toBe(true);
    expect(isValidSnowflakeRole('"My Role"')).toBe(true);
    expect(isValidSnowflakeRole("data-team")).toBe(true);
  });

  it("rejects empty, oversized and non-string values", () => {
    expect(isValidSnowflakeRole("")).toBe(false);
    expect(isValidSnowflakeRole("   ")).toBe(false);
    expect(isValidSnowflakeRole('""')).toBe(false);
    expect(isValidSnowflakeRole("a".repeat(256))).toBe(false);
    expect(isValidSnowflakeRole(null)).toBe(false);
    expect(isValidSnowflakeRole(123)).toBe(false);
  });
});

describe("snowflakeRoleToOAuthScope", () => {
  it("uppercases unquoted identifiers", () => {
    expect(snowflakeRoleToOAuthScope(" analyst ")).toBe("session:role:ANALYST");
    expect(snowflakeRoleToOAuthScope("DEV_ROLE$1")).toBe(
      "session:role:DEV_ROLE$1"
    );
  });

  it("preserves case and URL-encodes other role names", () => {
    expect(snowflakeRoleToOAuthScope("test@example.com")).toBe(
      "session:role-encoded:test%40example.com"
    );
    expect(snowflakeRoleToOAuthScope("AUTH SNOWFLAKE")).toBe(
      "session:role-encoded:AUTH%20SNOWFLAKE"
    );
  });

  it("treats double-quoted names as exact, case-sensitive identifiers", () => {
    expect(snowflakeRoleToOAuthScope('"analyst"')).toBe(
      "session:role-encoded:analyst"
    );
    expect(snowflakeRoleToOAuthScope('"say ""hi"""')).toBe(
      "session:role-encoded:say%20%22hi%22"
    );
  });
});
