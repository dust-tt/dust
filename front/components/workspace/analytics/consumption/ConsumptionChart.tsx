import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CHART_HEIGHT, CHART_MARGIN } from "@app/components/charts/constants";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import { useConsumptionTimeseries } from "@app/hooks/useConsumptionTimeseries";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  consumptionGranularityLabel,
  DEFAULT_CONSUMPTION_GRANULARITY,
  findPartialTimestamp,
  formatConsumptionDate,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type {
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesMode,
  ConsumptionTimeseriesPoint,
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import { ButtonsSwitch, ButtonsSwitchList, cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { Props as RechartsLabelProps } from "recharts/types/component/Label";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { ConsumptionBurnUpChart } from "./ConsumptionBurnUpChart";
import type { ConsumptionDimension } from "./consumptionDimensions";

const CURRENT_BUCKET_LABELS: Record<ConsumptionGranularity, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

// Renders the reference line's label as a pill with the same fill as the
// line itself, since the default text-only label has no background.
function PartialLabel({ viewBox, value }: RechartsLabelProps) {
  const textRef = useRef<SVGTextElement>(null);
  const [textWidth, setTextWidth] = useState(0);

  useLayoutEffect(() => {
    if (value !== undefined && textRef.current) {
      setTextWidth(textRef.current.getComputedTextLength());
    }
  }, [value]);

  if (!viewBox || !("x" in viewBox)) {
    return null;
  }

  const { x = 0, y = 0 } = viewBox;
  const paddingX = 6;
  const paddingY = 6;
  const fontSize = 11;
  const rectWidth = textWidth + paddingX * 2;
  const rectHeight = fontSize + paddingY * 2;
  const rectY = y - rectHeight + 16;

  return (
    <g>
      {textWidth > 0 && (
        <rect
          x={x - rectWidth / 2}
          y={rectY}
          width={rectWidth}
          height={rectHeight}
          rx={4}
          className="fill-muted-foreground"
        />
      )}
      <text
        ref={textRef}
        x={x}
        y={rectY + rectHeight / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-background text-xs"
      >
        {value}
      </text>
    </g>
  );
}

// The bucket in progress is drawn faded across every series.
const PARTIAL_BAR_OPACITY = "opacity-40";

const CONSUMPTION_CHART_COLORS = [
  "text-blue-900",
  "text-blue-700",
  "text-blue-500",
  "text-blue-300",
  "text-blue-100",
  "text-blue-50",
] as const;

// Request the top five categories, leaving the sixth shade available when the
// endpoint adds an aggregate "Others" category.
export const CONSUMPTION_CHART_BREAKDOWN_COUNT =
  CONSUMPTION_CHART_COLORS.length - 1;

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

interface ConsumptionDailyTooltipProps
  extends TooltipContentProps<number, string> {
  groups: ConsumptionTimeseriesGroup[];
  colorByGroupKey: Map<string, string>;
  partialTimestamp: number | undefined;
  currentBucketLabel: string;
}

function ConsumptionDailyTooltip({
  active,
  payload,
  groups,
  colorByGroupKey,
  partialTimestamp,
  currentBucketLabel,
}: ConsumptionDailyTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (!active || !isConsumptionTimeseriesPoint(datum)) {
    return null;
  }

  // The partialTimestamp points to the bucket in progress. Every bucket after
  // that is in the future and expected to be empty,
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
          ? `${formatCredits(totalCredits)} so far ${currentBucketLabel.toLowerCase()}`
          : `${formatCredits(totalCredits)} total`
      }
    />
  );
}

interface ConsumptionDailyChartProps {
  timeseries: GetConsumptionTimeseriesResponse | null;
  isTimeseriesLoading: boolean;
  isTimeseriesError: boolean;
  emptyMessage: string;
  additionalControls?: ReactNode;
}

export function ConsumptionDailyChart({
  timeseries,
  isTimeseriesLoading,
  isTimeseriesError,
  emptyMessage,
  additionalControls,
}: ConsumptionDailyChartProps) {
  const groups = useMemo(() => timeseries?.groups ?? [], [timeseries]);
  const chartData = useMemo(() => timeseries?.points ?? [], [timeseries]);

  const orderedGroups = useMemo(() => {
    const totalByGroupKey = new Map<string, number>();
    for (const datum of chartData) {
      for (const [groupKey, credits] of Object.entries(datum.values)) {
        totalByGroupKey.set(
          groupKey,
          (totalByGroupKey.get(groupKey) ?? 0) + credits
        );
      }
    }

    return [...groups].sort(
      (a, b) =>
        (totalByGroupKey.get(b.groupKey) ?? 0) -
        (totalByGroupKey.get(a.groupKey) ?? 0)
    );
  }, [chartData, groups]);

  // Colors are assigned darkest-to-lightest by total consumption, including
  // the aggregate "Others" category.
  const colorByGroupKey = useMemo(() => {
    return new Map(
      orderedGroups.map((group, index) => [
        group.groupKey,
        getConsumptionChartColor(index),
      ])
    );
  }, [orderedGroups]);

  const partialTimestamp = useMemo(
    () => findPartialTimestamp(chartData),
    [chartData]
  );
  const currentBucketLabel =
    CURRENT_BUCKET_LABELS[
      timeseries?.granularity ?? DEFAULT_CONSUMPTION_GRANULARITY
    ];

  const renderTooltip = useCallback(
    (props: TooltipContentProps<number, string>) => (
      <ConsumptionDailyTooltip
        {...props}
        groups={orderedGroups}
        colorByGroupKey={colorByGroupKey}
        partialTimestamp={partialTimestamp}
        currentBucketLabel={currentBucketLabel}
      />
    ),
    [orderedGroups, colorByGroupKey, partialTimestamp, currentBucketLabel]
  );

  const legendItems: LegendItem[] = orderedGroups.map((group) => ({
    key: group.groupKey,
    label: group.name,
    colorClassName: colorByGroupKey.get(group.groupKey) ?? "",
  }));

  const hasConsumption = chartData.some((datum) =>
    Object.values(datum.values).some((credits) => credits > 0)
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
      <BarChart data={chartData} margin={{ ...CHART_MARGIN, top: 24 }}>
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
          content={renderTooltip}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
        />
        {orderedGroups.map((group, rank) => {
          const colorClassName = getConsumptionChartColor(rank);

          return (
            <Bar
              // Recharts keeps each mounted Bar in its original stack slot, so
              // identify bars by color rank rather than the group occupying it.
              key={colorClassName}
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
                    colorClassName,
                    datum.timestamp === partialTimestamp && PARTIAL_BAR_OPACITY
                  )}
                />
              ))}
            </Bar>
          );
        })}
        {partialTimestamp !== undefined && (
          <ReferenceLine
            x={partialTimestamp}
            stroke="var(--color-primary)"
            strokeDasharray="5 5"
            label={{
              position: "top",
              value: `${currentBucketLabel} (partial)`,
              content: PartialLabel,
            }}
            ifOverflow="extendDomain"
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}

export interface ConsumptionChartProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  granularity?: ConsumptionGranularity;
  dimension: ConsumptionDimension;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
  onModeChange?: (mode: ConsumptionTimeseriesMode) => void;
}

function WorkspaceConsumptionDailyChart({
  workspaceId,
  period,
  granularity = DEFAULT_CONSUMPTION_GRANULARITY,
  dimension,
  filter,
  analyticsScope,
  disabled,
}: ConsumptionChartProps) {
  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      granularity,
      mode: "period",
      breakdownBy: dimension,
      breakdownCount: CONSUMPTION_CHART_BREAKDOWN_COUNT,
      filter,
      analyticsScope,
      disabled,
    });

  return (
    <ConsumptionDailyChart
      timeseries={timeseries}
      isTimeseriesLoading={isTimeseriesLoading}
      isTimeseriesError={Boolean(isTimeseriesError)}
      emptyMessage="No consumption over this period."
    />
  );
}

interface WorkspaceConsumptionBurnUpChartProps
  extends Omit<ConsumptionChartProps, "dimension"> {}

function WorkspaceConsumptionBurnUpChart({
  workspaceId,
  period,
  granularity = DEFAULT_CONSUMPTION_GRANULARITY,
  filter,
  analyticsScope,
  disabled,
}: WorkspaceConsumptionBurnUpChartProps) {
  const { overview } = useConsumptionOverview({
    workspaceId,
    period,
    filter,
    analyticsScope,
    disabled,
  });
  const isFiltered = Object.values(filter ?? {}).some(
    (values) => values.length > 0
  );
  const capCredits =
    period.kind === "cycle" && !isFiltered
      ? (overview?.creditUsage?.capCredits ?? null)
      : null;

  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    useConsumptionTimeseries({
      workspaceId,
      period,
      granularity,
      mode: "cumulative",
      filter,
      analyticsScope,
      disabled,
    });

  return (
    <ConsumptionBurnUpChart
      timeseries={timeseries}
      capCredits={capCredits}
      isTimeseriesLoading={isTimeseriesLoading}
      isTimeseriesError={Boolean(isTimeseriesError)}
      emptyMessage="No consumption over this period."
    />
  );
}

export function ConsumptionChart({
  workspaceId,
  period,
  granularity = DEFAULT_CONSUMPTION_GRANULARITY,
  dimension,
  filter,
  analyticsScope,
  disabled,
  onModeChange,
}: ConsumptionChartProps) {
  const [mode, setMode] = useState<ConsumptionTimeseriesMode>("period");

  const handleModeChange = (nextMode: ConsumptionTimeseriesMode) => {
    onModeChange?.(nextMode);
    setMode(nextMode);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Consumption</h2>
        <ButtonsSwitchList value={mode} size="xs">
          <ButtonsSwitch
            value="period"
            label={consumptionGranularityLabel(granularity)}
            onClick={() => handleModeChange("period")}
          />
          <ButtonsSwitch
            value="cumulative"
            label="Cumulative"
            onClick={() => handleModeChange("cumulative")}
          />
        </ButtonsSwitchList>
      </div>
      {mode === "cumulative" ? (
        <WorkspaceConsumptionBurnUpChart
          workspaceId={workspaceId}
          period={period}
          granularity={granularity}
          filter={filter}
          analyticsScope={analyticsScope}
          disabled={disabled}
        />
      ) : (
        <WorkspaceConsumptionDailyChart
          workspaceId={workspaceId}
          period={period}
          granularity={granularity}
          dimension={dimension}
          filter={filter}
          analyticsScope={analyticsScope}
          disabled={disabled}
        />
      )}
    </div>
  );
}
