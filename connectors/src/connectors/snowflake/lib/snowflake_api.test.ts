import { describe, expect, it } from "vitest";

import {
  quoteSnowflakeIdentifier,
  quoteSnowflakeIdentifierPath,
} from "./snowflake_api";

describe("quoteSnowflakeIdentifier", () => {
  it("leaves simple Snowflake identifiers unquoted", () => {
    expect(quoteSnowflakeIdentifier("warehouse_1$")).toBe("warehouse_1$");
  });

  it("quotes identifiers containing SQL metacharacters", () => {
    expect(quoteSnowflakeIdentifier('warehouse; USE ROLE accountadmin')).toBe(
      '"warehouse; USE ROLE accountadmin"'
    );
  });

  it("escapes embedded double quotes", () => {
    expect(quoteSnowflakeIdentifier('warehouse"; DROP TABLE users; --')).toBe(
      '"warehouse""; DROP TABLE users; --"'
    );
  });
});

describe("quoteSnowflakeIdentifierPath", () => {
  it("quotes each segment of a qualified database role", () => {
    expect(quoteSnowflakeIdentifierPath("db.role")).toBe("db.role");
    expect(quoteSnowflakeIdentifierPath("db;DROP.role\";DROP")).toBe(
      '"db;DROP"."role"";DROP"'
    );
  });
});
