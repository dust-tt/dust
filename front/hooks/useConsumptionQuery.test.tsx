import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import { PERSONAL_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { act, render, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

describe("getConsumptionAnalyticsUrl", () => {
  it("builds the workspace consumption URL by default", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        endpoint: "overview",
      })
    ).toBe("/api/w/workspace-id/analytics/consumption/overview");
  });

  it("builds the personal consumption URL", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        analyticsScope: PERSONAL_CONSUMPTION_ANALYTICS_SCOPE,
        endpoint: "overview",
      })
    ).toBe("/api/w/workspace-id/me/analytics/consumption/overview");
  });

  it("builds the agent-scoped consumption URL", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        analyticsScope: { kind: "agent", agentId: "agent-id" },
        endpoint: "overview",
      })
    ).toBe(
      "/api/w/workspace-id/assistant/agent_configurations/agent-id/analytics/consumption/overview"
    );
  });
});

describe("useConsumptionQuery", () => {
  it("keeps a request alive when the widget remounts while it is in flight", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    const fetcherWithBody = vi.fn<FetcherWithBodyFn>(
      (_args, init) =>
        new Promise((resolve, reject) => {
          resolveRequest = resolve;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    // Rendered through a probe component rather than renderHook so both
    // mounts share one SWRConfig, as in the app. Separate renderHook calls
    // get separate SWR caches and would never dedupe.
    const latest: {
      current: ReturnType<
        typeof useConsumptionQuery<{ days: number }, { ok: boolean }>
      > | null;
    } = { current: null };
    function Probe() {
      latest.current = useConsumptionQuery<{ days: number }, { ok: boolean }>({
        url: "/api/w/workspace-id/analytics/consumption/overview",
        body: { days: 30 },
      });
      return null;
    }
    const tree = (probeKey: string) => (
      <SWRConfig value={{ provider: () => new Map() }}>
        <FetcherProvider fetcher={vi.fn()} fetcherWithBody={fetcherWithBody}>
          <Probe key={probeKey} />
        </FetcherProvider>
      </SWRConfig>
    );

    const { rerender } = render(tree("first"));
    await waitFor(() => expect(fetcherWithBody).toHaveBeenCalledTimes(1));

    // Remount the widget under the same SWR cache in one commit, as a resize
    // across the mobile breakpoint does. SWR dedupes the new mount onto the
    // in-flight request, so that request must survive the unmount.
    rerender(tree("second"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ ok: true });
    });

    await waitFor(() => expect(latest.current?.data).toEqual({ ok: true }));
    expect(latest.current?.error).toBeUndefined();
  });
});
