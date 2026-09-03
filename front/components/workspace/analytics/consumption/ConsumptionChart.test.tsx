import { ConsumptionBurnUpChart } from "@app/components/workspace/analytics/consumption/ConsumptionBurnUpChart";
import {
  ConsumptionChart,
  ConsumptionDailyChart,
} from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseConsumptionTimeseries } = vi.hoisted(() => ({
  mockUseConsumptionTimeseries: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTimeseries", () => ({
  useConsumptionTimeseries: mockUseConsumptionTimeseries,
}));

vi.mock("recharts", async (importOriginal) => {
  const recharts = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");

  return {
    ...recharts,
    // ResponsiveContainer cannot measure a jsdom element. Give the real chart
    // components a stable viewport so this test exercises their rendered SVG.
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ height?: number; width?: number }>,
        { height: 260, width: 800 }
      ),
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const START_MS = Date.UTC(2026, 8, 1);
let getComputedTextLengthDescriptor: PropertyDescriptor | undefined;

function timeseries(
  mode: GetConsumptionTimeseriesResponse["mode"]
): GetConsumptionTimeseriesResponse {
  return {
    period: {
      startDate: new Date(START_MS).toISOString(),
      endDate: new Date(START_MS + 3 * DAY_MS).toISOString(),
    },
    granularity: "day",
    mode,
    metric: "credit_micro",
    timezone: "UTC",
    breakdownBy: null,
    groups: [{ groupKey: "total", name: "Total" }],
    points: [
      {
        timestamp: START_MS,
        activeUsers: 2,
        values: { total: 500_000 },
      },
      {
        timestamp: START_MS + DAY_MS,
        activeUsers: 8,
        values: { total: 1_000_000 },
      },
      {
        timestamp: START_MS + 2 * DAY_MS,
        activeUsers: 0,
        values: { total: 0 },
      },
    ],
  };
}

function expectActiveUsersOverlay(container: HTMLElement) {
  const axes = container.querySelectorAll(".recharts-yAxis");
  expect(axes).toHaveLength(2);
  expect(
    Array.from(container.querySelectorAll("text"))
      .map((label) => label.textContent)
      .filter((label) => label === "Credits" || label === "Active users")
  ).toEqual(["Credits", "Active users"]);
  const activeUsersLabel = Array.from(container.querySelectorAll("text")).find(
    (label) => label.textContent === "Active users"
  );
  expect(activeUsersLabel).toHaveAttribute("text-anchor", "middle");

  const leftTick = axes[0].querySelector("text");
  const rightTick = axes[1].querySelector("text");
  expect(Number(rightTick?.getAttribute("x"))).toBeGreaterThan(
    Number(leftTick?.getAttribute("x"))
  );
  const activeUserTicks = Array.from(
    axes[1].querySelectorAll(".recharts-cartesian-axis-tick-value")
  ).map((tick) => Number(tick.textContent));
  expect(Math.max(...activeUserTicks)).toBe(10);
  const activeUserTickYs = Array.from(
    axes[1].querySelectorAll(".recharts-cartesian-axis-tick-value")
  ).map((tick) => Number(tick.getAttribute("y")));
  expect(Number(activeUsersLabel?.getAttribute("y"))).toBeCloseTo(
    (Math.min(...activeUserTickYs) + Math.max(...activeUserTickYs)) / 2
  );

  const activeUsersSeries = container.querySelector(
    ".recharts-line.text-golden-500"
  );
  expect(activeUsersSeries).not.toBeNull();

  const legendLabels = Array.from(
    container.querySelectorAll("span.text-sm.text-muted-foreground")
  );
  const totalLegendLabel = legendLabels.find(
    (label) => label.textContent === "Total"
  );
  const activeUsersLegendLabel = legendLabels.find(
    (label) => label.textContent === "Active users"
  );
  const totalLegendItem = totalLegendLabel?.parentElement;
  const activeUsersLegendItem = activeUsersLegendLabel?.parentElement;
  const mainLegendGroup = totalLegendItem?.parentElement;
  const activeUsersLegendGroup = activeUsersLegendItem?.parentElement;
  const legend = mainLegendGroup?.parentElement;

  expect(activeUsersLegendLabel).toBeDefined();
  expect(activeUsersLegendGroup?.parentElement).toBe(legend);
  expect(legend?.children).toHaveLength(5);
  expect(
    Array.from(legend?.children ?? []).filter((child) =>
      child.classList.contains("flex-1")
    )
  ).toHaveLength(3);
  expect(mainLegendGroup).toHaveClass("gap-x-6");

  const curvePath = activeUsersSeries?.querySelector(".recharts-line-curve");
  const path = curvePath?.getAttribute("d") ?? "";
  expect(path).toContain("L");
  expect(path).not.toContain("C");

  const dots = Array.from(activeUsersSeries?.querySelectorAll("circle") ?? []);
  expect(dots).toHaveLength(2);
  const [firstY, secondY] = dots.map((dot) => Number(dot.getAttribute("cy")));
  // Credits are several orders of magnitude larger than the user counts. A
  // meaningful vertical separation proves the line uses its own Y scale.
  expect(Math.abs(firstY - secondY)).toBeGreaterThan(50);
}

describe("consumption active users overlay", () => {
  beforeEach(() => {
    mockUseConsumptionTimeseries.mockReset().mockReturnValue({
      timeseries: null,
      isTimeseriesLoading: true,
      isTimeseriesError: undefined,
      isTimeseriesValidating: false,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(START_MS + DAY_MS + 12 * 60 * 60 * 1000));
    getComputedTextLengthDescriptor = Object.getOwnPropertyDescriptor(
      SVGElement.prototype,
      "getComputedTextLength"
    );
    Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
      configurable: true,
      value: () => 24,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (getComputedTextLengthDescriptor) {
      Object.defineProperty(
        SVGElement.prototype,
        "getComputedTextLength",
        getComputedTextLengthDescriptor
      );
    } else {
      Reflect.deleteProperty(SVGElement.prototype, "getComputedTextLength");
    }
  });

  it("renders exact active-user points on a right-side linear scale", () => {
    const { container } = render(
      <ConsumptionDailyChart
        timeseries={timeseries("period")}
        isTimeseriesLoading={false}
        isTimeseriesError={false}
        emptyMessage="No consumption."
        showActiveUsers
      />
    );

    expect(container.querySelector(".recharts-bar")).not.toBeNull();
    expectActiveUsersOverlay(container);

    const activeUsersDot = container.querySelector(
      ".recharts-line.text-golden-500 circle"
    );
    const chart = container.querySelector<HTMLElement>(".recharts-wrapper");
    expect(chart).not.toBeNull();
    Object.defineProperties(chart!, {
      offsetWidth: { configurable: true, value: 800 },
      offsetHeight: { configurable: true, value: 260 },
    });
    vi.spyOn(chart!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 260,
      left: 0,
      width: 800,
      height: 260,
      toJSON: () => undefined,
    });
    fireEvent.mouseMove(chart!, {
      clientX: Number(activeUsersDot?.getAttribute("cx")),
      clientY: Number(activeUsersDot?.getAttribute("cy")),
    });

    const activeDot = container.querySelector(".recharts-active-dot circle");
    expect(activeDot).toHaveClass("text-golden-500");
    expect(activeDot).toHaveClass("animate-in");
    expect(activeDot).toHaveClass("zoom-in-90");
    expect(activeDot).toHaveClass("duration-75");
    expect(activeDot).toHaveClass("motion-reduce:animate-none");
    expect(activeDot).toHaveAttribute("r", "3.75");
    expect(activeDot).toHaveAttribute("fill", "white");
    expect(activeDot).toHaveAttribute("stroke", "currentColor");
    expect(activeDot).toHaveAttribute("stroke-width", "1.5");
  });

  it("hides the active-user overlay for a single-user filter", () => {
    mockUseConsumptionTimeseries.mockReturnValue({
      timeseries: timeseries("period"),
      isTimeseriesLoading: false,
      isTimeseriesError: undefined,
      isTimeseriesValidating: false,
    });

    const { container } = render(
      <ConsumptionChart
        workspaceId="workspace-id"
        period={{ kind: "days", days: 30 }}
        dimension="agent"
        filter={{ users: ["user-id"] }}
      />
    );

    expect(container.querySelectorAll(".recharts-yAxis")).toHaveLength(1);
    expect(
      container.querySelector(".recharts-line.text-golden-500")
    ).toBeNull();
    expect(
      Array.from(
        container.querySelectorAll("span.text-sm.text-muted-foreground")
      ).some((label) => label.textContent === "Active users")
    ).toBe(false);
  });

  it("hides the active-user overlay in cumulative mode", () => {
    const { container } = render(
      <ConsumptionBurnUpChart
        timeseries={timeseries("cumulative")}
        capCredits={null}
        isTimeseriesLoading={false}
        isTimeseriesError={false}
        emptyMessage="No consumption."
      />
    );

    expect(container.querySelectorAll(".recharts-yAxis")).toHaveLength(1);
    expect(
      container.querySelector(".recharts-line.text-golden-500")
    ).toBeNull();
    expect(
      Array.from(container.querySelectorAll("text")).some(
        (label) => label.textContent === "Active users"
      )
    ).toBe(false);
  });

  it("refreshes the shared timeseries when period and granularity change", () => {
    const { rerender } = render(
      <ConsumptionChart
        workspaceId="workspace-id"
        period={{ kind: "days", days: 30 }}
        granularity="day"
        dimension="agent"
      />
    );

    expect(mockUseConsumptionTimeseries).toHaveBeenLastCalledWith(
      expect.objectContaining({
        period: { kind: "days", days: 30 },
        granularity: "day",
        mode: "period",
      })
    );

    rerender(
      <ConsumptionChart
        workspaceId="workspace-id"
        period={{ kind: "days", days: 90 }}
        granularity="month"
        dimension="agent"
      />
    );

    expect(mockUseConsumptionTimeseries).toHaveBeenLastCalledWith(
      expect.objectContaining({
        period: { kind: "days", days: 90 },
        granularity: "month",
        mode: "period",
      })
    );
  });
});
