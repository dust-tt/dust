import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { formatConsumptionDate } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { useConsumptionTimeseries } from "@app/hooks/useConsumptionTimeseries";
import type { ConsumptionTimeseriesGroup } from "@app/lib/api/analytics/consumption/series";
import { DEFAULT_CONSUMPTION_BREAKDOWN_COUNT } from "@app/lib/api/analytics/consumption/series";
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

// The bucket in progress is drawn faded across every series: its total is still
// growing, and at full strength it reads as a real drop in consumption.
const PARTIAL_BAR_OPACITY = "opacity-40";

interface ConsumptionChartDatum {
  timestamp: number;
  isPartial: boolean;
  values: Record<string, number>;
}

function isConsumptionChartDatum(data: unknown): data is ConsumptionChartDatum {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    "isPartial" in data &&
    "values" in data
  );
}

function formatCredits(credits: number): string {
  return credits.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

interface ConsumptionChartTooltipProps
  extends TooltipContentProps<number, string> {
  groups: ConsumptionTimeseriesGroup[];
  colorByGroupKey: Map<string, string>;
}

function ConsumptionChartTooltip({
  active,
  payload,
  groups,
  colorByGroupKey,
}: ConsumptionChartTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (!active || !isConsumptionChartDatum(datum)) {
    return null;
  }

  // Only the series that actually consumed something on this day, largest
  // first: with ten agents, listing the zeroes buries the ones that matter.
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
        datum.isPartial
          ? `${formatCredits(totalCredits)} so far today`
          : `${formatCredits(totalCredits)} total`
      }
    />
  );
}

interface ConsumptionChartProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function ConsumptionChart({
  workspaceId,
  period,
}: ConsumptionChartProps) {
  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      mode: "daily",
      // Per-agent is the view that answers "where are the credits going".
      // Becomes selectable once the attribution table can drive the chart.
      breakdownBy: "agent",
      breakdownCount: DEFAULT_CONSUMPTION_BREAKDOWN_COUNT,
    });

  const groups = timeseries?.groups ?? [];

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

  const chartData = useMemo<ConsumptionChartDatum[]>(
    () =>
      (timeseries?.points ?? []).map((point) => ({
        timestamp: point.timestamp,
        isPartial: point.isPartial,
        values: point.values,
      })),
    [timeseries]
  );

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ConsumptionChartTooltip
        {...props}
        groups={groups}
        colorByGroupKey={colorByGroupKey}
      />
    ),
    [groups, colorByGroupKey]
  );

  const legendItems: LegendItem[] = groups.map((group) => ({
    key: group.groupKey,
    label: group.name,
    colorClassName: colorByGroupKey.get(group.groupKey) ?? "",
  }));

  const partialTimestamp = chartData.find(
    (datum) => datum.isPartial
  )?.timestamp;
  const hasConsumption = chartData.some((datum) =>
    Object.values(datum.values).some((credits) => credits > 0)
  );

  return (
    <ChartContainer
      title="Daily credits by agent"
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
          // Buckets run to the end of the cycle, so a cycle-length axis would
          // label every empty future day without this.
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
            // The endpoint zero-fills every group on every point, so this
            // accessor never has to cope with a missing series.
            dataKey={(datum: ConsumptionChartDatum) =>
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
                  datum.isPartial && PARTIAL_BAR_OPACITY
                )}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
