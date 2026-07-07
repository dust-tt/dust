import { getDataSourceSearchTimestampGtMs } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search_time_frame";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getDataSourceSearchTimestampGtMs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects maxAgeSeconds when the feature flag is disabled", () => {
    const result = getDataSourceSearchTimestampGtMs({
      maxAgeSeconds: 604800,
      isMaxAgeEnabled: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not enabled");
    }
  });

  it("uses maxAgeSeconds over relativeTimeFrame when enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));

    const result = getDataSourceSearchTimestampGtMs({
      maxAgeSeconds: 604800,
      relativeTimeFrame: "2y",
      isMaxAgeEnabled: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(Date.parse("2026-06-30T12:00:00.000Z"));
    }
  });

  it("keeps existing relativeTimeFrame behavior without maxAgeSeconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));

    const result = getDataSourceSearchTimestampGtMs({
      relativeTimeFrame: "4w",
      isMaxAgeEnabled: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(Date.parse("2026-06-09T12:00:00.000Z"));
    }
  });
});
