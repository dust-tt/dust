import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CHART_HEIGHT, CHART_MARGIN } from "@app/components/charts/constants";
import {
  findPartialTimestamp,
  formatConsumptionDate,
} from "@app/lib/analytics/consumption_period";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

const ACTUAL_COLOR = "text-blue-500";
const TARGET_COLOR = "text-stone-300";

const BURNUP_ACTUAL_KEY = "actual";
const BURNUP_TARGET_KEY = "target";

// What the workspace has actually spent so far against what an evenly spread cap
// allows by then. `actual` stops at the bucket in progress, `target` runs to the
// end of the cycle, and the gap between the two is the headroom (or the
// overshoot).
type BurnUpPoint = {
  timestamp: number;
  [BURNUP_ACTUAL_KEY]: number | null;
  [BURNUP_TARGET_KEY]: number | null;
};

// Recharts hands the tooltip its datum as `unknown`; the points go into the
// chart unchanged, so this narrows back to what was built below.
function isBurnUpPoint(data: unknown): data is BurnUpPoint {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    BURNUP_ACTUAL_KEY in data &&
    BURNUP_TARGET_KEY in data
  );
}

function ConsumptionBurnUpTooltip({
  active,
  payload,
}: TooltipContentProps<number, string>) {
  const datum = payload?.[0]?.payload;
  if (!active || !isBurnUpPoint(datum) || datum.actual === null) {
    return null;
  }

  const rows = [
    {
      key: BURNUP_ACTUAL_KEY,
      label: "Actual consumption",
      value: formatCredits(datum.actual),
      colorClassName: ACTUAL_COLOR,
    },
    ...(datum.target !== null
      ? [
          {
            key: BURNUP_TARGET_KEY,
            label: "Target consumption",
            value: formatCredits(datum.target),
            colorClassName: TARGET_COLOR,
          },
        ]
      : []),
  ];

  const delta = datum.target !== null ? datum.actual - datum.target : null;

  return (
    <ChartTooltipCard
      title={formatConsumptionDate(datum.timestamp)}
      rows={rows}
      footer={
        delta !== null
          ? `${formatCredits(Math.abs(delta))} ${delta > 0 ? "ahead of" : "behind"} target`
          : undefined
      }
    />
  );
}

interface ConsumptionBurnUpChartProps {
  timeseries: GetConsumptionTimeseriesResponse | null;
  capCredits: number | null;
  isTimeseriesLoading: boolean;
  isTimeseriesError: boolean;
  emptyMessage: string;
  additionalControls?: ReactNode;
}

export function ConsumptionBurnUpChart({
  timeseries,
  capCredits,
  isTimeseriesLoading,
  isTimeseriesError,
  emptyMessage,
  additionalControls,
}: ConsumptionBurnUpChartProps) {
  const chartData = useMemo<BurnUpPoint[]>(() => {
    const points = timeseries?.points ?? [];
    const partialTimestamp = findPartialTimestamp(points);
    const bucketTarget =
      capCredits === null ? null : capCredits / points.length;

    return points.map((point, index) => ({
      timestamp: point.timestamp,
      // Buckets that have not started yet come back zeroed, which would drag the
      // actual line back down to the axis instead of ending it at today.
      [BURNUP_ACTUAL_KEY]:
        partialTimestamp !== undefined && point.timestamp > partialTimestamp
          ? null
          : Object.values(point.values).reduce(
              (sum, credits) => sum + credits,
              0
            ),
      [BURNUP_TARGET_KEY]:
        bucketTarget === null ? null : bucketTarget * (index + 1),
    }));
  }, [timeseries, capCredits]);

  const legendItems: LegendItem[] = [
    {
      key: BURNUP_ACTUAL_KEY,
      label: "Actual consumption",
      colorClassName: ACTUAL_COLOR,
    },
    ...(capCredits !== null
      ? [
          {
            key: BURNUP_TARGET_KEY,
            label: "Target consumption",
            colorClassName: TARGET_COLOR,
          },
        ]
      : []),
  ];

  const hasConsumption = chartData.some(
    (point) => point.actual !== null && point.actual > 0
  );

  return (
    <ChartContainer
      title="Credits over time"
      additionalControls={additionalControls}
      isLoading={isTimeseriesLoading}
      errorMessage={
        isTimeseriesError ? "Failed to load consumption." : undefined
      }
      emptyMessage={
        !isTimeseriesLoading && !hasConsumption ? emptyMessage : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      legendAlignment="center"
      showHeaderDivider
    >
      <LineChart data={chartData} margin={{ ...CHART_MARGIN, top: 24 }}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="4 4"
          className="stroke-border"
        />
        <XAxis
          dataKey="timestamp"
          className="text-xs text-faint"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(timestamp: number) =>
            formatConsumptionDate(timestamp)
          }
        />
        <YAxis
          className="text-xs text-faint"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatCreditsCompact}
        />
        <Tooltip
          cursor={false}
          content={ConsumptionBurnUpTooltip}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
        />
        {capCredits !== null && (
          <Line
            dataKey={BURNUP_TARGET_KEY}
            name="Target consumption"
            className={TARGET_COLOR}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 4"
            strokeLinecap="round"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          dataKey={BURNUP_ACTUAL_KEY}
          name="Actual consumption"
          className={ACTUAL_COLOR}
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
