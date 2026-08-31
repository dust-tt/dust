import type { GenericRecord } from "@app/lib/api/actions/servers/servicenow/client";
import {
  renderPaginationFooter,
  renderRecord,
  validateWritableFields,
} from "@app/lib/api/actions/servers/servicenow/helpers";
import { describe, expect, it } from "vitest";

describe("validateWritableFields", () => {
  it("accepts flat scalar values for valid field names, standard or custom", () => {
    const result = validateWritableFields({
      short_description: "Something broke",
      priority: "1 - Critical",
      u_custom_field: "value",
      x_acme_score: 42,
      u_is_vip: true,
      u_optional: null,
    });

    expect(result.isOk()).toBe(true);
  });

  it("defaults to an empty object when omitted", () => {
    const result = validateWritableFields(undefined);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({});
  });

  it("rejects field names that aren't valid ServiceNow identifiers", () => {
    const result = validateWritableFields({ "not a field!": "value" });

    expect(result.isErr()).toBe(true);
  });

  it("rejects system-managed field names", () => {
    for (const name of ["sys_id", "sys_created_on", "number"]) {
      const result = validateWritableFields({ [name]: "value" });
      expect(result.isErr(), name).toBe(true);
    }
  });
});

describe("renderRecord", () => {
  it("renders sys_id and number first, then the remaining fields sorted", () => {
    const record: GenericRecord = {
      sys_id: "a".repeat(32),
      number: "PRB0000123",
      short_description: "Something broke",
      state: "1",
    };

    const text = renderRecord(record);
    const lines = text.split("\n");

    expect(lines[0]).toContain("PRB0000123");
    expect(lines[1]).toContain("a".repeat(32));
    expect(text).toContain("short_description: Something broke");
    expect(text).toContain("state: 1");
  });
});

describe("renderPaginationFooter", () => {
  it("mentions the cursor when more results are available", () => {
    const footer = renderPaginationFooter({
      hasMore: true,
      nextCursor: "b".repeat(32),
      returnedCount: 25,
    });

    expect(footer).toContain("25 returned");
    expect(footer).toContain("b".repeat(32));
    expect(footer).not.toContain("total");
  });

  it("reports no more results when the page is the last one", () => {
    const footer = renderPaginationFooter({
      hasMore: false,
      nextCursor: null,
      returnedCount: 3,
      totalCount: 3,
    });

    expect(footer).toContain("3 total");
    expect(footer).toContain("no more results");
  });
});
