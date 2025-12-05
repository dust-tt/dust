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
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  COST_PALETTE,
  OTHER_LABEL,
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import type { LegendItem } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import {
  getIndexedColor,
  getSourceColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import type {
  AvailableGroup,
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { useWorkspaceProgrammaticCost } from "@app/lib/swr/workspaces";

interface ProgrammaticCostChartProps {
  workspaceId: string;
  billingCycleStartDay: number;
}

interface BaseProgrammaticCostChartProps {
  programmaticCostData: GetWorkspaceProgrammaticCostResponse | undefined;
  isProgrammaticCostLoading: boolean;
  isProgrammaticCostError: boolean;
  groupBy: GroupByType | undefined;
  setGroupBy: (groupBy: GroupByType | undefined) => void;
  filter: Partial<Record<GroupByType, string[]>>;
  setFilter: React.Dispatch<
    React.SetStateAction<Partial<Record<GroupByType, string[]>>>
  >;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  billingCycleStartDay: number;
}

type ChartDataPoint = {
  timestamp: number;
  totalInitialCreditsMicroUsd?: number;
  [key: string]: string | number | undefined;
};

const GROUP_BY_TYPE_OPTIONS: {
  value: GroupByType;
  label: string;
}[] = [
  { value: "agent", label: "By Agent" },
  { value: "origin", label: "By Source" },
  { value: "apiKey", label: "By Api Key" },
];

const GROUP_BY_OPTIONS: {
  value: "global" | GroupByType;
  label: string;
}[] = [{ value: "global", label: "Global" }, ...GROUP_BY_TYPE_OPTIONS];

function getColorClassName(
  groupBy: GroupByType | undefined,
  groupName: string,
  groups: string[]
): string {
  if (!groupBy) {
    return COST_PALETTE.costMicroUsd;
  } else if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
    return getSourceColor(groupName);
  } else {
    return getIndexedColor(groupName, groups);
  }
}

// Custom tooltip for grouped view
function GroupedTooltip(
  props: TooltipContentProps<number, string>,
  groupBy: GroupByType | undefined,
  availableGroupsArray: { groupKey: string; groupLabel: string }[]
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
        p.dataKey !== "totalInitialCreditsMicroUsd" &&
        p.value != null &&
        typeof p.value === "number"
    )
    .map((p) => {
      const groupKey = p.name;

      let label;
      if (groupBy === "origin" && isUserMessageOrigin(groupKey)) {
        label = USER_MESSAGE_ORIGIN_LABELS[groupKey].label;
      } else {
        label =
          availableGroupsArray.find((g) => g.groupKey === groupKey)
            ?.groupLabel ?? "";
      }

      const colorClassName = getColorClassName(
        groupBy,
        groupKey,
        availableGroupsArray.map((g) => g.groupKey)
      );

      return {
        label,
        value: `$${(p.value / 1_000_000).toFixed(2)}`,
        colorClassName,
      };
    });

  // Add credits row
  rows.push({
    label: "Total Credits",
    value: `$${(data.totalInitialCreditsMicroUsd / 1_000_000).toFixed(2)}`,
    colorClassName: COST_PALETTE.totalCredits,
  });
  const date = new Date(data.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
  return <ChartTooltipCard title={date} rows={rows} />;
}

export function formatMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Base chart component that renders the programmatic cost chart.
 * This component is agnostic of how the data is fetched.
 */
export function BaseProgrammaticCostChart({
  programmaticCostData,
  isProgrammaticCostLoading,
  isProgrammaticCostError,
  groupBy,
  setGroupBy,
  filter,
  setFilter,
  selectedMonth,
  setSelectedMonth,
  billingCycleStartDay,
}: BaseProgrammaticCostChartProps) {
  // Cache labels for each groupBy type so they persist when switching modes
  const [labelCache, setLabelCache] = useState<
    Partial<Record<GroupByType, Record<string, string>>>
  >({});

  const now = new Date();
  // selectedMonth is "YYYY-MM", so new Date(selectedMonth) creates day 1 of that month.
  // To get the correct billing cycle, we need a date within that cycle, so we set
  // the day to billingCycleStartDay.
  const currentDate = new Date(selectedMonth);
  currentDate.setDate(billingCycleStartDay);

  // Calculate the billing cycle for the selected month
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
    });

  // Format period label based on billing cycle
  // cycleEnd is exclusive (first day of next cycle), so we subtract 1 day for display
  const inclusiveEndDate = new Date(billingCycle.cycleEnd);
  inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);
  const periodLabel = `${formatDate(billingCycle.cycleStart)} → ${formatDate(inclusiveEndDate)}`;

  // Calculate next and previous period dates
  const nextPeriodDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 1)
  );
  const previousPeriodDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 1, 1)
  );

  // Check if we can go to next period (not in the future)
  const canGoNext = billingCycle.cycleEnd.getTime() <= now.getTime();

  // Navigate to next period
  const handleNextPeriod = () => {
    setSelectedMonth(formatMonth(nextPeriodDate));
  };

  // Navigate to previous period
  const handlePreviousPeriod = () => {
    setSelectedMonth(formatMonth(previousPeriodDate));
  };

  // Group by change
  const handleGroupByChange = (newGroupBy: GroupByType | undefined) => {
    setGroupBy(newGroupBy);
  };

  // Getting list of all available groups.
  const availableGroupsArray = useMemo(
    () => programmaticCostData?.availableGroups ?? [],
    [programmaticCostData]
  );
  const allGroupKeys = availableGroupsArray.map((g) => g.groupKey);

  // Filter change
  const handleFilterChange = (group: AvailableGroup) => {
    if (groupBy) {
      setFilter((prev) => {
        const currentFilter = prev[groupBy] ?? [];
        const isCurrentlySelected = currentFilter.includes(group.groupKey);
        if (isCurrentlySelected) {
          // Disable: remove from filter
          const newEnabled = currentFilter.filter((k) => k !== group.groupKey);
          // If all groups are disabled (only one was enabled), enable all
          if (newEnabled.length === 0) {
            return {
              ...prev,
              [groupBy]: undefined,
            };
          }
          return {
            ...prev,
            [groupBy]: newEnabled,
          };
        } else {
          // Enable: add to filter
          const newEnabled = [...currentFilter, group.groupKey];
          // If all groups are now enabled, remove filter
          if (newEnabled.length === allGroupKeys.length) {
            return {
              ...prev,
              [groupBy]: undefined,
            };
          }
          return {
            ...prev,
            [groupBy]: newEnabled,
          };
        }
      });
    }
  };

  const handleClearFilters = () => {
    setFilter({});
  };

  // Cache labels when availableGroupsArray changes
  // Otherwise, labels would be lost when switching groupBy types, and would display raw keys instead
  useEffect(() => {
    if (groupBy && availableGroupsArray.length > 0) {
      const newLabels: Record<string, string> = {};
      for (const group of availableGroupsArray) {
        newLabels[group.groupKey] = group.groupLabel;
      }
      setLabelCache((prev) => ({
        ...prev,
        [groupBy]: { ...prev[groupBy], ...newLabels },
      }));
    }
  }, [groupBy, availableGroupsArray]);

  // Extract visible group keys from filtered data.
  const visibleGroupKeys = new Set<string>();
  const points = programmaticCostData?.points ?? [];
  points.forEach((point) => {
    point.groups.forEach((g) => {
      visibleGroupKeys.add(g.groupKey);
    });
  });

  const enabledGroupKeys = groupBy ? filter[groupBy] : undefined;

  const groupKeys = availableGroupsArray.map((g) => g.groupKey);

  const legendItems: LegendItem[] = availableGroupsArray.map((group) => {
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

    // A group is active if no filter is set (all enabled) OR it's in the enabled list
    const isActive =
      !enabledGroupKeys || enabledGroupKeys.includes(group.groupKey);
    const isVisible = visibleGroupKeys.has(group.groupKey);
    const canFilter = !["total", "others", "unknown"].includes(group.groupKey);

    return {
      key: group.groupKey,
      label,
      colorClassName:
        !isVisible && isActive ? OTHER_LABEL.color : colorClassName,
      onClick: canFilter ? () => handleFilterChange(group) : undefined,
      isActive,
    };
  });

  // Compute maximum cumulated cost among all groups.
  const maxCumulatedCost = useMemo(() => {
    return programmaticCostData?.points.reduce((max, point) => {
      return Math.max(
        max,
        point.groups.reduce((max, group) => {
          return Math.max(max, group.cumulatedCostMicroUsd ?? 0);
        }, 0)
      );
    }, 0);
  }, [programmaticCostData]);

  const shouldShowTotalCredits = useMemo(() => {
    // if all points in the future have total credits higher to twice the max cumulated cost, don't show total credits.
    const futurePoints = points.filter((point) => point.timestamp > Date.now());
    return !futurePoints.every(
      (point) => point.totalInitialCreditsMicroUsd > 2 * (maxCumulatedCost ?? 0)
    );
  }, [maxCumulatedCost]);

  // Add Total Credits to legend (not clickable)
  if (shouldShowTotalCredits) {
    legendItems.push({
      key: "totalCredits",
      label: "Total Credits",
      colorClassName: COST_PALETTE.totalCredits,
      isActive: true,
    });
  }

  // Transform points into chart data using labels from availableGroups
  const chartData = points.map((point) => {
    const dataPoint: ChartDataPoint = {
      timestamp: point.timestamp,
    };

    if (shouldShowTotalCredits) {
      dataPoint.totalInitialCreditsMicroUsd = point.totalInitialCreditsMicroUsd;
    }
    // Add each group's cumulative cost to the data point using labels from availableGroups
    // Keep undefined values as-is so Recharts doesn't render those points
    point.groups.forEach((g) => {
      dataPoint[g.groupKey] = g.cumulatedCostMicroUsd;
    });

    return dataPoint;
  });

  const ChartComponent = groupBy ? AreaChart : LineChart;

  // Filter to only show ticks for midnight dates
  const midnightTicks = useMemo(() => {
    return chartData
      .map((point) => point.timestamp)
      .filter((timestamp) => new Date(timestamp).getUTCHours() === 0);
  }, [chartData]);

  // Check if any filters are applied
  const hasFilters = useMemo(() => {
    return Object.values(filter).some(
      (filterArray) => filterArray && filterArray.length > 0
    );
  }, [filter]);

  // Util function to get label for a filter key based on type
  const getFilterLabel = useCallback(
    (type: GroupByType, key: string): string => {
      if (key === "others") {
        return OTHER_LABEL.label;
      }
      if (type === "origin" && isUserMessageOrigin(key)) {
        return USER_MESSAGE_ORIGIN_LABELS[key].label;
      }
      // Fallback to cached label if present, else original key
      return labelCache[type]?.[key] ?? key;
    },
    [labelCache]
  );

  // Build active filter chips for all groupBy types
  const activeFilterChips = useMemo(() => {
    return GROUP_BY_TYPE_OPTIONS.flatMap(({ value: type }) => {
      const filterKeys = filter[type];
      if (!filterKeys) {
        return [];
      }
      return filterKeys.map((key) => ({
        groupByType: type,
        filterKey: key,
        label: getFilterLabel(type, key),
      }));
    });
  }, [filter, getFilterLabel]);

  // Remove a specific filter
  const handleRemoveFilter = useCallback(
    (groupByType: GroupByType, filterKey: string) => {
      setFilter((prev) => {
        const currentFilter = prev[groupByType] ?? [];
        const newFilter = currentFilter.filter((k) => k !== filterKey);
        if (newFilter.length === 0) {
          return {
            ...prev,
            [groupByType]: undefined,
          };
        }
        return {
          ...prev,
          [groupByType]: newFilter,
        };
      });
    },
    [setFilter]
  );

  return (
    <ChartContainer
      title={
        <div className="flex items-center gap-2">
          <span>Usage Graph</span>
          <Button
            icon={ChevronLeftIcon}
            size="xs"
            variant="ghost"
            onClick={handlePreviousPeriod}
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
              onClick={handleNextPeriod}
              tooltip="Next period"
            />
          )}
        </div>
      }
      description="Total cost accumulated. Filter by clicking on legend items."
      isLoading={isProgrammaticCostLoading}
      errorMessage={
        isProgrammaticCostError
          ? "Failed to load programmatic cost data."
          : undefined
      }
      emptyMessage={
        chartData.length === 0 ? "No cost data for this month." : undefined
      }
      additionalControls={
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button
              label="Clear filters"
              size="xs"
              variant="ghost"
              onClick={handleClearFilters}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  groupBy
                    ? GROUP_BY_OPTIONS.find((opt) => opt.value === groupBy)
                        ?.label
                    : "Global"
                }
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {GROUP_BY_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  label={option.label}
                  onClick={() =>
                    handleGroupByChange(
                      option.value === "global" ? undefined : option.value
                    )
                  }
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          tickFormatter={(value) => `$${(value / 1_000_000).toFixed(0)}`}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) =>
            GroupedTooltip(props, groupBy, availableGroupsArray)
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
        <Line
          type="monotone"
          dataKey="totalInitialCreditsMicroUsd"
          name="Total Credits"
          stroke="currentColor"
          strokeWidth={2}
          className="text-green-500"
          strokeDasharray="5 5"
          dot={false}
          activeDot={{ r: 5 }}
        />
        {groupKeys.map((groupKey) => {
          const colorClassName = getColorClassName(
            groupBy,
            groupKey,
            allGroupKeys
          );

          return groupBy ? (
            <Area
              key={groupKey}
              type="monotone"
              dataKey={groupKey}
              stackId="cost"
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
      </ChartComponent>
    </ChartContainer>
  );
}

/**
 * Workspace-specific wrapper component that handles data fetching
 * using the workspace API endpoint.
 */
export function ProgrammaticCostChart({
  workspaceId,
  billingCycleStartDay,
}: ProgrammaticCostChartProps) {
  const [groupBy, setGroupBy] = useState<GroupByType | undefined>(undefined);
  const [filter, setFilter] = useState<Partial<Record<GroupByType, string[]>>>(
    {}
  );

  // Initialize selectedMonth to a date within the current billing cycle.
  // Using just formatMonth(now) would create a date on the 1st of the month,
  // which may fall in the previous billing cycle if billingCycleStartDay > 1.
  // By using the billing cycle's start date, we ensure we're in the correct cycle.
  const now = new Date();
  const currentBillingCycle = getBillingCycleFromDay(
    billingCycleStartDay,
    now,
    false
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    formatMonth(currentBillingCycle.cycleStart)
  );

  const {
    programmaticCostData,
    isProgrammaticCostLoading,
    isProgrammaticCostError,
  } = useWorkspaceProgrammaticCost({
    workspaceId,
    selectedMonth,
    billingCycleStartDay,
    groupBy,
    filter,
  });

  return (
    <BaseProgrammaticCostChart
      programmaticCostData={programmaticCostData}
      isProgrammaticCostLoading={isProgrammaticCostLoading}
      isProgrammaticCostError={!!isProgrammaticCostError}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      filter={filter}
      setFilter={setFilter}
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      billingCycleStartDay={billingCycleStartDay}
    />
  );
}
