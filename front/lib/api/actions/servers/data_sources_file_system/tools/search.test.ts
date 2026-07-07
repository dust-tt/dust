import { getDataSourceSearchTimestampGtMs } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search_time_frame";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getDataSourceSearchTimestampGtMs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects documentTimeFrame when the feature flag is disabled", () => {
    const result = getDataSourceSearchTimestampGtMs({
      documentTimeFrame: "7d",
      isDocumentTimeFrameEnabled: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not enabled");
    }
  });

  it("uses documentTimeFrame over relativeTimeFrame when enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));

    const result = getDataSourceSearchTimestampGtMs({
      documentTimeFrame: "7d",
      relativeTimeFrame: "2y",
      isDocumentTimeFrameEnabled: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(Date.parse("2026-06-30T12:00:00.000Z"));
    }
  });

  it("keeps existing relativeTimeFrame behavior without documentTimeFrame", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));

    const result = getDataSourceSearchTimestampGtMs({
      relativeTimeFrame: "4w",
      isDocumentTimeFrameEnabled: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(Date.parse("2026-06-09T12:00:00.000Z"));
    }
  });
});
