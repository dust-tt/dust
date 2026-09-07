import { PokeConsumptionChart } from "@app/components/poke/analytics/PokeConsumptionChart";
import type { ConsumptionGranularity } from "@app/lib/analytics/consumption_period";
import type { ConsumptionTimeseriesMode } from "@app/lib/api/analytics/consumption/timeseries";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/swr";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

describe("PokeConsumptionChart", () => {
  it("requests the selected granularity in both chart modes", async () => {
    const fetcher = vi.fn();
    // Keep responses pending so the real controls and SWR request path are
    // exercised without needing a chart viewport in jsdom.
    const fetcherWithBody = vi
      .fn<FetcherWithBodyFn>()
      .mockImplementation(() => new Promise(() => {}));
    const swrConfig = { provider: () => new Map() };

    const chart = (granularity?: ConsumptionGranularity) => (
      <SWRConfig value={swrConfig}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <PokeConsumptionChart
            workspaceId="workspace-id"
            period={{ kind: "days", days: 90 }}
            granularity={granularity}
            dimension="agent"
          />
        </FetcherProvider>
      </SWRConfig>
    );
    const expectRequest = async (
      granularity: ConsumptionGranularity,
      mode: ConsumptionTimeseriesMode
    ) => {
      await waitFor(() => {
        expect(fetcherWithBody).toHaveBeenCalledWith(
          [
            "/api/poke/workspaces/workspace-id/analytics/consumption/timeseries",
            expect.objectContaining({ granularity, mode }),
            "POST",
          ],
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
      });
    };

    const { getByRole, rerender } = render(chart());
    expect(getByRole("tab", { name: "Daily", selected: true })).toBeVisible();
    await expectRequest("day", "period");

    rerender(chart("week"));
    expect(getByRole("tab", { name: "Weekly", selected: true })).toBeVisible();
    await expectRequest("week", "period");

    fireEvent.click(getByRole("tab", { name: "Cumulative" }));
    await expectRequest("week", "cumulative");

    rerender(chart("month"));
    expect(
      getByRole("tab", { name: "Monthly", selected: false })
    ).toBeVisible();
    await expectRequest("month", "cumulative");

    fireEvent.click(getByRole("tab", { name: "Monthly" }));
    await expectRequest("month", "period");
  });
});
