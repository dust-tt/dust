import {
  CHART_HEIGHT,
  COST_PALETTE,
  OTHER_LABEL,
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import {
  getIndexedColor,
  getSourceColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { formatPeriod } from "@app/components/workspace/ProgrammaticCostChart";
import type {
  AwuUsageGroupByType,
  GetAwuUsageResponse,
} from "@app/lib/api/analytics/awu_usage";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { useAwuUsage } from "@app/lib/swr/workspaces";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

interface AwuUsageChartProps {
  workspaceId: string;
  billingCycleStartDay: number;
}

type DisplayMode = "cumulative" | "daily";

type ChartDataPoint = {
  timestamp: number;
  totalCredits?: number;
  [key: string]: string | number | undefined;
};

// All values are AWU credits — never USD/microUsd.
function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

const GROUP_BY_OPTIONS: {
  value: AwuUsageGroupByType;
  label: string;
}[] = [
  { value: "usage_type", label: "By usage type" },
  { value: "user", label: "By User" },
  { value: "agent", label: "By Agent" },
  { value: "api_key", label: "By API Key" },
  { value: "model", label: "By Model" },
  { value: "origin", label: "By Source" },
  { value: "tool_category", label: "By category (LLM & tools)" },
];

const TOP_K_OPTIONS = [
  { value: 5, label: "Top 5" },
  { value: 10, label: "Top 10" },
  { value: 15, label: "Top 15" },
  { value: 20, label: "Top 20" },
  { value: 30, label: "Top 30" },
];

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "cumulative", label: "Cumulative" },
  { value: "daily", label: "Daily" },
];

function getColorClassName(
  groupBy: AwuUsageGroupByType | undefined,
  groupName: string,
  groups: string[]
): string {
  if (!groupBy) {
    return COST_PALETTE.costMicroUsd;
  }
  if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
    return getSourceColor(groupName);
  }
  return getIndexedColor(groupName, groups);
}

function UsageTooltip(
  props: TooltipContentProps<number, string>,
  groupBy: AwuUsageGroupByType | undefined,
  availableGroups: { groupKey: string; groupLabel: string }[],
  displayMode: DisplayMode,
  shouldShowTotalCredits: boolean
): JSX.Element | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }

  const rows = payload
    .filter(
      (p) =>
        p.dataKey !== "totalCredits" &&
        p.value != null &&
        typeof p.value === "number" &&
        p.value > 0
    )
    .map((p) => {
      const groupKey = p.name;
      let label;
      if (groupBy === "origin" && isUserMessageOrigin(groupKey)) {
        label = USER_MESSAGE_ORIGIN_LABELS[groupKey].label;
      } else {
        label =
          availableGroups.find((g) => g.groupKey === groupKey)?.groupLabel ??
          "";
      }

      return {
        label,
        value: `${formatCredits(p.value)} credits`,
        colorClassName: getColorClassName(
          groupBy,
          groupKey,
          availableGroups.map((g) => g.groupKey)
        ),
      };
    });

  if (shouldShowTotalCredits) {
    rows.push({
      label: "Total credits",
      value: `${formatCredits(data.totalCredits)} credits`,
      colorClassName: COST_PALETTE.totalCredits,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  const date = new Date(data.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: displayMode === "cumulative" ? "numeric" : undefined,
  });
  return <ChartTooltipCard title={date} rows={rows} />;
}

export function AwuUsageChart({
  workspaceId,
  billingCycleStartDay,
}: AwuUsageChartProps) {
  // Default view is split by usage type (programmatic / user / free).
  const [groupBy, setGroupBy] = useState<AwuUsageGroupByType | undefined>(
    "usage_type"
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cumulative");
  const [filter, setFilter] = useState<
    Partial<Record<AwuUsageGroupByType, string[]>>
  >({});

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const currentBillingCycle = getBillingCycleFromDay(
      billingCycleStartDay,
      new Date(),
      true
    );
    return formatPeriod(currentBillingCycle.cycleStart);
  });

  const { awuUsageData, isAwuUsageLoading, isAwuUsageError } = useAwuUsage({
    workspaceId,
    selectedPeriod,
    billingCycleStartDay,
    groupBy,
    groupByCount,
    windowSize: displayMode === "cumulative" ? "HOUR" : "DAY",
  });

  return (
    <BaseAwuUsageChart
      awuUsageData={awuUsageData}
      isLoading={isAwuUsageLoading}
      isError={!!isAwuUsageError}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      groupByCount={groupByCount}
      setGroupByCount={setGroupByCount}
      filter={filter}
      setFilter={setFilter}
      selectedPeriod={selectedPeriod}
      setSelectedPeriod={setSelectedPeriod}
      billingCycleStartDay={billingCycleStartDay}
      displayMode={displayMode}
      setDisplayMode={setDisplayMode}
    />
  );
}

interface BaseAwuUsageChartProps {
  awuUsageData: GetAwuUsageResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  groupBy: AwuUsageGroupByType | undefined;
  setGroupBy: (v: AwuUsageGroupByType | undefined) => void;
  groupByCount: number;
  setGroupByCount: (v: number) => void;
  filter: Partial<Record<AwuUsageGroupByType, string[]>>;
  setFilter: (v: Partial<Record<AwuUsageGroupByType, string[]>>) => void;
  selectedPeriod: string;
  setSelectedPeriod: (v: string) => void;
  billingCycleStartDay: number;
  displayMode: DisplayMode;
  setDisplayMode: (v: DisplayMode) => void;
}

export function BaseAwuUsageChart({
  awuUsageData,
  isLoading,
  isError,
  groupBy,
  setGroupBy,
  groupByCount,
  setGroupByCount,
  filter,
  setFilter,
  selectedPeriod,
  setSelectedPeriod,
  billingCycleStartDay,
  displayMode,
  setDisplayMode,
}: BaseAwuUsageChartProps) {
  const [nowMs] = useState(() => Date.now());
  // Cache labels per groupBy dimension so filter chips keep readable labels
  // even after switching to a different groupBy.
  const [labelCache, setLabelCache] =
    useState<Partial<Record<AwuUsageGroupByType, Record<string, string>>>>();

  const [year, month] = selectedPeriod.split("-").map(Number);
  const currentDate = new Date(Date.UTC(year, month - 1, billingCycleStartDay));

  const billingCycle = getBillingCycleFromDay(
    billingCycleStartDay,
    currentDate,
    true
  );

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

  const inclusiveEndDate = new Date(billingCycle.cycleEnd);
  inclusiveEndDate.setUTCDate(inclusiveEndDate.getUTCDate() - 1);
  const periodLabel = `${formatDate(billingCycle.cycleStart)} → ${formatDate(inclusiveEndDate)}`;

  const nextPeriodDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 1)
  );
  const previousPeriodDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 1, 1)
  );
  const canGoNext = billingCycle.cycleEnd.getTime() <= nowMs;

  const availableGroupsArray = useMemo(
    () => awuUsageData?.availableGroups ?? [],
    [awuUsageData]
  );

  const points = useMemo(() => awuUsageData?.points ?? [], [awuUsageData]);

  const allGroupKeys = useMemo(
    () => availableGroupsArray.map((g) => g.groupKey),
    [availableGroupsArray]
  );

  const visibleGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const point of points) {
      for (const g of point.groups) {
        keys.add(g.groupKey);
      }
    }
    return keys;
  }, [points]);

  const maxCumulatedValue = useMemo(() => {
    return points.reduce((max, point) => {
      return Math.max(
        max,
        point.groups.reduce(
          (sum, group) => sum + (group.cumulatedValueCredits ?? 0),
          0
        )
      );
    }, 0);
  }, [points]);

  const shouldShowTotalCredits = useMemo(() => {
    if (displayMode !== "cumulative") {
      return false;
    }
    const futurePoints = points.filter((p) => p.timestamp > nowMs);
    return !futurePoints.every(
      (p) => p.totalInitialCredits > 4 * maxCumulatedValue
    );
  }, [points, maxCumulatedValue, nowMs, displayMode]);

  const enabledGroupKeys = groupBy ? filter[groupBy] : undefined;

  useEffect(() => {
    if (!groupBy || availableGroupsArray.length === 0) {
      return;
    }
    const entries: Record<string, string> = {};
    for (const group of availableGroupsArray) {
      if (group.groupKey === "others") {
        entries[group.groupKey] = OTHER_LABEL.label;
      } else if (groupBy === "origin" && isUserMessageOrigin(group.groupKey)) {
        entries[group.groupKey] =
          USER_MESSAGE_ORIGIN_LABELS[group.groupKey].label;
      } else {
        entries[group.groupKey] = group.groupLabel;
      }
    }
    setLabelCache((prev) => ({ ...prev, [groupBy]: entries }));
  }, [groupBy, availableGroupsArray]);

  const getFilterLabel = useCallback(
    (type: AwuUsageGroupByType, key: string) =>
      labelCache?.[type]?.[key] ?? key,
    [labelCache]
  );

  const handleFilterChange = useCallback(
    (groupKey: string) => {
      if (!groupBy) {
        return;
      }
      const current = filter[groupBy] ?? [];
      const isCurrentlyEnabled = current.includes(groupKey);
      if (isCurrentlyEnabled) {
        const newEnabled = current.filter((k) => k !== groupKey);
        setFilter({
          ...filter,
          [groupBy]: newEnabled.length === 0 ? undefined : newEnabled,
        });
      } else {
        const newEnabled = [...current, groupKey];
        const allKeys = availableGroupsArray
          .map((g) => g.groupKey)
          .filter((k) => !["total", "others"].includes(k));
        setFilter({
          ...filter,
          [groupBy]:
            newEnabled.length === allKeys.length ? undefined : newEnabled,
        });
      }
    },
    [groupBy, availableGroupsArray, filter, setFilter]
  );

  const handleRemoveFilter = useCallback(
    (type: AwuUsageGroupByType, filterKey: string) => {
      const current = filter[type] ?? [];
      const newFilter = current.filter((k) => k !== filterKey);
      setFilter({
        ...filter,
        [type]: newFilter.length === 0 ? undefined : newFilter,
      });
    },
    [filter, setFilter]
  );

  const activeFilterChips = useMemo(() => {
    return GROUP_BY_OPTIONS.flatMap(({ value: type }) =>
      (filter[type] ?? []).map((key) => ({
        groupByType: type,
        filterKey: key,
        label: getFilterLabel(type, key),
      }))
    );
  }, [filter, getFilterLabel]);

  const legendItems: LegendItem[] = useMemo(() => {
    const items: LegendItem[] = availableGroupsArray.map((group) => {
      const colorClassName = getColorClassName(
        groupBy,
        group.groupKey,
        allGroupKeys
      );
      let label = group.groupLabel;
      if (group.groupKey === "others") {
        label = OTHER_LABEL.label;
      } else if (groupBy === "origin" && isUserMessageOrigin(group.groupKey)) {
        label = USER_MESSAGE_ORIGIN_LABELS[group.groupKey].label;
      }
      const isVisible = visibleGroupKeys.has(group.groupKey);
      const canFilter =
        groupBy && !["total", "others"].includes(group.groupKey);
      const isActive =
        !enabledGroupKeys || enabledGroupKeys.includes(group.groupKey);
      return {
        key: group.groupKey,
        label,
        colorClassName: !isVisible ? OTHER_LABEL.color : colorClassName,
        onClick: canFilter
          ? () => handleFilterChange(group.groupKey)
          : undefined,
        isActive,
      };
    });

    if (shouldShowTotalCredits) {
      items.push({
        key: "totalCredits",
        label: "Total credits",
        colorClassName: COST_PALETTE.totalCredits,
        isActive: true,
      });
    }

    return items;
  }, [
    availableGroupsArray,
    allGroupKeys,
    groupBy,
    visibleGroupKeys,
    shouldShowTotalCredits,
    enabledGroupKeys,
    handleFilterChange,
  ]);

  const chartData = useMemo(() => {
    if (displayMode === "cumulative") {
      return points.map((point) => {
        const dataPoint: ChartDataPoint = { timestamp: point.timestamp };
        dataPoint.totalCredits = point.totalInitialCredits;
        for (const g of point.groups) {
          dataPoint[g.groupKey] = g.cumulatedValueCredits;
        }
        return dataPoint;
      });
    }
    return points.map((point) => {
      const dataPoint: ChartDataPoint = { timestamp: point.timestamp };
      for (const g of point.groups) {
        dataPoint[g.groupKey] = g.valueCredits;
      }
      return dataPoint;
    });
  }, [points, displayMode]);

  const ChartComponent =
    displayMode === "daily" ? BarChart : groupBy ? AreaChart : LineChart;

  const midnightTicks = useMemo(() => {
    return chartData
      .map((p) => p.timestamp)
      .filter((ts) => new Date(ts).getUTCHours() === 0);
  }, [chartData]);

  return (
    <ChartContainer
      title={
        <div className="flex items-center gap-2">
          <span>Usage</span>
          <Button
            icon={ChevronLeftIcon}
            size="xs"
            variant="ghost"
            onClick={() => setSelectedPeriod(formatPeriod(previousPeriodDate))}
            tooltip="Previous period"
          />
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {periodLabel}
          </span>
          {canGoNext && (
            <Button
              icon={ChevronRightIcon}
              size="xs"
              variant="ghost"
              onClick={() => setSelectedPeriod(formatPeriod(nextPeriodDate))}
              tooltip="Next period"
            />
          )}
        </div>
      }
      isLoading={isLoading}
      errorMessage={isError ? "Failed to load usage data." : undefined}
      emptyMessage={
        chartData.length === 0 ? "No usage data for this period." : undefined
      }
      additionalControls={
        <div className="flex items-center gap-2">
          {activeFilterChips.length > 0 && (
            <Button
              label="Clear filters"
              size="xs"
              variant="ghost"
              onClick={() => setFilter({})}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  DISPLAY_MODE_OPTIONS.find((o) => o.value === displayMode)
                    ?.label ?? "Cumulative"
                }
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DISPLAY_MODE_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  label={o.label}
                  onClick={() => setDisplayMode(o.value)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ??
                  "By usage type"
                }
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {GROUP_BY_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  label={o.label}
                  onClick={() => setGroupBy(o.value)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {groupBy && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={
                    TOP_K_OPTIONS.find((o) => o.value === groupByCount)
                      ?.label ?? "Top 5"
                  }
                  size="xs"
                  variant="outline"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TOP_K_OPTIONS.map((o) => (
                  <DropdownMenuItem
                    key={o.value}
                    label={o.label}
                    onClick={() => setGroupByCount(o.value)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
      bottomControls={
        activeFilterChips.length > 0 ? (
          <div className="flex items-center gap-2">
            {activeFilterChips.map((chip) => (
              <Chip
                key={`${chip.groupByType}:${chip.filterKey}`}
                label={`${chip.groupByType}: ${chip.label}`}
                size="xs"
                onRemove={() =>
                  handleRemoveFilter(chip.groupByType, chip.filterKey)
                }
                className="capitalize"
              />
            ))}
          </div>
        ) : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      isAllowFullScreen
    >
      <ChartComponent
        data={chartData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="timestamp"
          type="category"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={true}
          axisLine={false}
          tickMargin={8}
          minTickGap={8}
          ticks={midnightTicks}
          tickFormatter={(value) =>
            new Date(value).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => formatCredits(value)}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) =>
            UsageTooltip(
              props,
              groupBy,
              availableGroupsArray,
              displayMode,
              shouldShowTotalCredits
            )
          }
          cursor={false}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {allGroupKeys
          .filter(
            (key) =>
              ["total", "others"].includes(key) ||
              !enabledGroupKeys ||
              enabledGroupKeys.includes(key)
          )
          .map((groupKey) => {
            const colorClassName = getColorClassName(
              groupBy,
              groupKey,
              allGroupKeys
            );
            if (displayMode === "daily") {
              return (
                <Bar
                  key={groupKey}
                  dataKey={groupKey}
                  stackId={groupBy ? "usage" : undefined}
                  fill="currentColor"
                  className={colorClassName}
                />
              );
            }
            return groupBy ? (
              <Area
                key={groupKey}
                type="monotone"
                dataKey={groupKey}
                stackId="usage"
                stroke="currentColor"
                fill="currentColor"
                fillOpacity={0.6}
                strokeWidth={2}
                className={colorClassName}
              />
            ) : (
              <Line
                key={groupKey}
                type="monotone"
                className={colorClassName}
                dataKey={groupKey}
                name={groupKey}
                stroke="currentColor"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            );
          })}
        {shouldShowTotalCredits && (
          <Line
            type="monotone"
            dataKey="totalCredits"
            name="Total credits"
            stroke="currentColor"
            strokeWidth={2}
            className={COST_PALETTE.totalCredits}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 5 }}
          />
        )}
      </ChartComponent>
    </ChartContainer>
  );
}
