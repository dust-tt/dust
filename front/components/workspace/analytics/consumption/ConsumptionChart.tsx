import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useConsumptionTimeseries } from "@app/hooks/useConsumptionTimeseries";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type {
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/timeseries";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { cn } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  type ConsumptionDimension,
} from "./consumptionDimensions";

// The bucket in progress (if mapped to today) is drawn faded across every series.
const PARTIAL_BAR_OPACITY = "opacity-40";

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
  points: ConsumptionTimeseriesPoint[]
): number | undefined {
  const nowMs = Date.now();
  return points.findLast((point) => point.timestamp <= nowMs)?.timestamp;
}

interface ConsumptionChartTooltipProps
  extends TooltipContentProps<number, string> {
  groups: ConsumptionTimeseriesGroup[];
  colorByGroupKey: Map<string, string>;
  partialTimestamp: number | undefined;
}

function ConsumptionChartTooltip({
  active,
  payload,
  groups,
  colorByGroupKey,
  partialTimestamp,
}: ConsumptionChartTooltipProps) {
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

interface ConsumptionChartProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  dimension: ConsumptionDimension;
}

export function ConsumptionChart({
  workspaceId,
  period,
  dimension,
}: ConsumptionChartProps) {
  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      mode: "daily",
      breakdownBy: dimension,
    });

  const groups = useMemo(() => timeseries?.groups ?? [], [timeseries]);

  // Colors are assigned by rank, so the biggest consumer keeps its color as
  // long as it stays on top. "Others" is special-cased by getIndexedColor.
  const colorByGroupKey = useMemo(() => {
    const names = groups.map((group) => group.name);
    return new Map(
      groups.map((group) => [
        group.groupKey,
        getIndexedColor(group.name, names),
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
      <ConsumptionChartTooltip
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
      title={`Daily credits by ${CONSUMPTION_DIMENSION_CONFIG[dimension].breakdownLabel}`}
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
      <BarChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
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
