// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { reportBundleSizes } from "./lib/bundle-metrics";

describe("reportBundleSizes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("submits each bundle size as a gauge", async () => {
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportBundleSizes({
      bundleSizes: [
        { name: "server", bytes: 1_234 },
        { name: "migrate", bytes: 567 },
      ],
      env: {
        DATADOG_API_KEY: "test-api-key",
        NEXT_PUBLIC_DATADOG_SERVICE: "front",
        REPORT_BUNDLE_METRICS: "true",
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.datadoghq.eu/api/v2/series",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "DD-API-KEY": "test-api-key",
        },
      })
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      series: [
        {
          metric: "dust.build.bundle.size_bytes",
          type: 3,
          points: [{ timestamp: 1_789_732_800, value: 1_234 }],
          tags: ["service:front-api", "bundle:server"],
        },
        {
          metric: "dust.build.bundle.size_bytes",
          type: 3,
          points: [{ timestamp: 1_789_732_800, value: 567 }],
          tags: ["service:front-api", "bundle:migrate"],
        },
      ],
    });
  });

  it("does nothing unless bundle reporting is enabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await reportBundleSizes({
      bundleSizes: [{ name: "server", bytes: 1_234 }],
      env: {},
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fail the build when Datadog is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      reportBundleSizes({
        bundleSizes: [{ name: "server", bytes: 1_234 }],
        env: {
          DATADOG_API_KEY: "test-api-key",
          NEXT_PUBLIC_DATADOG_SERVICE: "front",
          REPORT_BUNDLE_METRICS: "true",
        },
      })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "Failed to submit bundle metrics to Datadog.",
      expect.any(Error)
    );
  });
});
