import {
  ElasticsearchError,
  formatDateFromMillis,
} from "@app/lib/api/elasticsearch";
import { describe, expect, it } from "vitest";

describe("formatDateFromMillis", () => {
  // 2026-06-09T15:00:00Z is local midnight 2026-06-10 in Asia/Tokyo (UTC+9):
  // the kind of date_histogram bucket key that was mis-rendered as 2026-06-09.
  const ms = Date.parse("2026-06-09T15:00:00Z");

  it("formats the day in UTC", () => {
    expect(formatDateFromMillis(ms, "UTC")).toBe("2026-06-09");
  });

  it("rolls to the local day for a positive-offset timezone", () => {
    expect(formatDateFromMillis(ms, "Asia/Tokyo")).toBe("2026-06-10");
  });

  it("keeps the local day for a negative-offset timezone", () => {
    expect(formatDateFromMillis(ms, "America/New_York")).toBe("2026-06-09");
  });
});

describe("ElasticsearchError", () => {
  it.each([
    ["connection_error", undefined, true],
    ["query_error", 408, true],
    ["query_error", 429, true],
    ["query_error", 500, true],
    ["query_error", 400, false],
    ["query_error", undefined, false],
    ["unknown_error", undefined, false],
  ] as const)("classifies %s with status %s as retryable=%s", (type, statusCode, expected) => {
    expect(
      new ElasticsearchError(type, "Elasticsearch failure", statusCode)
        .isRetryable
    ).toBe(expected);
  });
});
