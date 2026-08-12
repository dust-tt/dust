import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CHART_HEIGHT, CHART_MARGIN } from "@app/components/charts/constants";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import { useConsumptionTimeseries } from "@app/hooks/useConsumptionTimeseries";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesMode,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/timeseries";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { ButtonsSwitch, ButtonsSwitchList, cn } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { ConsumptionDimension } from "./consumptionDimensions";

// The bucket in progress (if mapped to today) is drawn faded across every series.
const PARTIAL_BAR_OPACITY = "opacity-40";

const ACTUAL_COLOR = "text-blue-500";
const TARGET_COLOR = "text-stone-300";

const CONSUMPTION_CHART_COLORS = [
  "text-blue-900",
  "text-blue-800",
  "text-blue-700",
  "text-blue-600",
  "text-blue-500",
  "text-blue-400",
  "text-blue-300",
  "text-blue-200",
  "text-blue-100",
  "text-blue-50",
] as const;

// Reserve the final color for the optional "Others" series.
const CONSUMPTION_CHART_BREAKDOWN_COUNT = CONSUMPTION_CHART_COLORS.length - 1;

function getConsumptionChartColor(index: number): string {
  return CONSUMPTION_CHART_COLORS[
    Math.min(index, CONSUMPTION_CHART_COLORS.length - 1)
  ];
}

// Recharts hands the tooltip its datum as `unknown`; the points go into the
// chart unchanged, so this narrows back to what the endpoint returned.
function isConsumptionTimeseriesPoint(
  data: unknown
): data is ConsumptionTimeseriesPoint {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    "values" in data
  );
}

// The endpoint buckets the whole period, so the tail of the series is the part
// of the cycle still to come. The bucket holding the present is the last one
// that has started, which is all it takes to tell the two apart.
function findPartialTimestamp(
  points: { timestamp: number }[]
): number | undefined {
  const nowMs = Date.now();
  return points.findLast((point) => point.timestamp <= nowMs)?.timestamp;
}

interface ConsumptionDailyTooltipProps
  extends TooltipContentProps<number, string> {
  groups: ConsumptionTimeseriesGroup[];
  colorByGroupKey: Map<string, string>;
  partialTimestamp: number | undefined;
}

function ConsumptionDailyTooltip({
  active,
  payload,
  groups,
  colorByGroupKey,
  partialTimestamp,
}: ConsumptionDailyTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (!active || !isConsumptionTimeseriesPoint(datum)) {
    return null;
  }

  // The partialTimestamp points to the bucket in progress (if mapped to today).
  // So every buckets after that are in the future, and are expected to be empty,
  // hence nothing to show.
  if (partialTimestamp !== undefined && datum.timestamp > partialTimestamp) {
    return null;
  }

  // Only the series that actually consumed something on this day, largest
  // first.
  const rows = groups
    .map((group) => ({
      key: group.groupKey,
      label: group.name,
      credits: datum.values[group.groupKey] ?? 0,
      colorClassName: colorByGroupKey.get(group.groupKey),
    }))
    .filter((row) => row.credits > 0)
    .sort((a, b) => b.credits - a.credits);

  const totalCredits = rows.reduce((sum, row) => sum + row.credits, 0);
  const isPartial = datum.timestamp === partialTimestamp;

  return (
    <ChartTooltipCard
      title={formatConsumptionDate(datum.timestamp)}
      rows={rows.map((row) => ({
        key: row.key,
        label: row.label,
        value: formatCredits(row.credits),
        colorClassName: row.colorClassName,
      }))}
      footer={
        isPartial
          ? `${formatCredits(totalCredits)} so far today`
          : `${formatCredits(totalCredits)} total`
      }
    />
  );
}

interface ConsumptionDailyChartProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  dimension: ConsumptionDimension;
  filter?: ConsumptionScopeFilter;
}

function ConsumptionDailyChart({
  workspaceId,
  period,
  dimension,
  filter,
}: ConsumptionDailyChartProps) {
  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      mode: "daily",
      breakdownBy: dimension,
      breakdownCount: CONSUMPTION_CHART_BREAKDOWN_COUNT,
      filter,
    });

  const groups = useMemo(() => timeseries?.groups ?? [], [timeseries]);

  // Colors are assigned darkest-to-lightest by rank, so the biggest consumer
  // keeps the strongest color as long as it stays on top.
  const colorByGroupKey = useMemo(() => {
    return new Map(
      groups.map((group, index) => [
        group.groupKey,
        getConsumptionChartColor(index),
      ])
    );
  }, [groups]);

  const chartData = useMemo(() => timeseries?.points ?? [], [timeseries]);

  const partialTimestamp = useMemo(
    () => findPartialTimestamp(chartData),
    [chartData]
  );

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ConsumptionDailyTooltip
        {...props}
        groups={groups}
        colorByGroupKey={colorByGroupKey}
        partialTimestamp={partialTimestamp}
      />
    ),
    [groups, colorByGroupKey, partialTimestamp]
  );

  const legendItems: LegendItem[] = groups.map((group) => ({
    key: group.groupKey,
    label: group.name,
    colorClassName: colorByGroupKey.get(group.groupKey) ?? "",
  }));

  const hasConsumption = chartData.some((datum) =>
    Object.values(datum.values).some((credits) => credits > 0)
  );

  return (
    <ChartContainer
      title="Daily credits"
      isLoading={isTimeseriesLoading}
      errorMessage={
        isTimeseriesError ? "Failed to load consumption." : undefined
      }
      emptyMessage={
        !isTimeseriesLoading && !hasConsumption
          ? "No consumption over this period."
          : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <BarChart data={chartData} margin={{ ...CHART_MARGIN, top: 24 }}>
        <CartesianGrid vertical={false} className="stroke-border" />
        <XAxis
          dataKey="timestamp"
          className="text-xs text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(timestamp: number) =>
            formatConsumptionDate(timestamp)
          }
        />
        <YAxis
          className="text-xs text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatCreditsCompact}
        />
        <Tooltip
          cursor={false}
          content={renderTooltip}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
        />
        {partialTimestamp !== undefined && (
          <ReferenceLine
            x={partialTimestamp}
            stroke="hsl(var(--primary))"
            strokeDasharray="5 5"
            label={{ value: "Today (partial)", position: "top", fontSize: 11 }}
            ifOverflow="extendDomain"
          />
        )}
        {groups.map((group) => (
          <Bar
            key={group.groupKey}
            dataKey={(datum: ConsumptionTimeseriesPoint) =>
              datum.values[group.groupKey] ?? 0
            }
            name={group.name}
            stackId="credits"
            isAnimationActive={false}
          >
            {chartData.map((datum) => (
              <Cell
                key={datum.timestamp}
                fill="currentColor"
                className={cn(
                  colorByGroupKey.get(group.groupKey),
                  datum.timestamp === partialTimestamp && PARTIAL_BAR_OPACITY
                )}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

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

function isBurnUpPoint(data: unknown): data is BurnUpPoint {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    BURNUP_ACTUAL_KEY in data
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
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

function ConsumptionBurnUpChart({
  workspaceId,
  period,
  filter,
}: ConsumptionBurnUpChartProps) {
  const { overview } = useConsumptionOverview({ workspaceId, period, filter });
  const capCredits =
    period.kind === "cycle"
      ? (overview?.creditUsage?.capCredits ?? null)
      : null;

  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      mode: "cumulative",
      filter,
    });

  const chartData = useMemo<BurnUpPoint[]>(() => {
    const points = timeseries?.points ?? [];
    const partialTimestamp = findPartialTimestamp(points);
    const bucketTarget =
      capCredits === null ? null : capCredits / points.length;

    return points.map((point, index) => ({
      timestamp: point.timestamp,
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
            label: `Target consumption`,
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
      title="Cumulative credits"
      isLoading={isTimeseriesLoading}
      errorMessage={
        isTimeseriesError ? "Failed to load consumption." : undefined
      }
      emptyMessage={
        !isTimeseriesLoading && !hasConsumption
          ? "No consumption over this period."
          : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <LineChart data={chartData} margin={{ ...CHART_MARGIN, top: 24 }}>
        <CartesianGrid vertical={false} className="stroke-border" />
        <XAxis
          dataKey="timestamp"
          className="text-xs text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(timestamp: number) =>
            formatConsumptionDate(timestamp)
          }
        />
        <YAxis
          className="text-xs text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatCreditsCompact}
        />
        <Tooltip
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

interface ConsumptionChartProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  dimension: ConsumptionDimension;
  filter?: ConsumptionScopeFilter;
}

export function ConsumptionChart({
  workspaceId,
  period,
  dimension,
  filter,
}: ConsumptionChartProps) {
  const [mode, setMode] = useState<ConsumptionTimeseriesMode>("daily");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Consumption</h2>
        <ButtonsSwitchList value={mode} size="sm">
          <ButtonsSwitch
            value="daily"
            label="Daily"
            onClick={() => setMode("daily")}
          />
          <ButtonsSwitch
            value="cumulative"
            label="Cumulative"
            onClick={() => setMode("cumulative")}
          />
        </ButtonsSwitchList>
      </div>
      {mode === "cumulative" ? (
        <ConsumptionBurnUpChart
          workspaceId={workspaceId}
          period={period}
          filter={filter}
        />
      ) : (
        <ConsumptionDailyChart
          workspaceId={workspaceId}
          period={period}
          dimension={dimension}
          filter={filter}
        />
      )}
    </div>
  );
}
