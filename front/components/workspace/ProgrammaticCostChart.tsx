import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
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
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import {
  getIndexedColor,
  getSourceColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import { useWorkspaceProgrammaticCost } from "@app/lib/swr/workspaces";
import type { GroupByType } from "@app/pages/api/w/[wId]/analytics/programmatic-cost";

interface ProgrammaticCostChartProps {
  workspaceId: string;
}

type ChartDataPoint = {
  date: string;
  timestamp: number;
  totalInitialCreditsCents: number;
  programmaticCostCents?: number;
  [key: string]: string | number | undefined;
};

const GROUP_BY_OPTIONS: {
  value: "global" | GroupByType;
  label: string;
}[] = [
  { value: "global", label: "Global" },
  { value: "agent", label: "By Agent" },
  { value: "origin", label: "By Source" },
  { value: "apiKey", label: "By Api Key" },
];

function getColorClassName(
  groupBy: GroupByType | undefined,
  groupName: string,
  groups: string[]
): string {
  if (!groupBy) {
    return COST_PALETTE.costCents;
  } else if (groupName === "others") {
    return OTHER_LABEL.color;
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
        p.dataKey !== "totalInitialCreditsCents" &&
        p.value != null &&
        typeof p.value === "number"
    )
    .map((p) => {
      const groupKey = p.name;

      let label = "";
      if (groupKey === "others") {
        label = OTHER_LABEL.label;
      } else if (groupBy === "origin" && isUserMessageOrigin(groupKey)) {
        label = USER_MESSAGE_ORIGIN_LABELS[groupKey].label;
      } else {
        label = availableGroupsArray.find(
          (g) => g.groupKey === groupKey
        )?.groupLabel;
      }

      const colorClassName = getColorClassName(
        groupBy,
        groupKey,
        availableGroupsArray.map((g) => g.groupKey)
      );

      return {
        label,
        value: `$${(p.value / 100).toFixed(2)}`,
        colorClassName,
      };
    });

  // Add credits row
  rows.push({
    label: "Total Credits",
    value: `$${(data.totalInitialCreditsCents / 100).toFixed(2)}`,
    colorClassName: COST_PALETTE.totalCredits,
  });

  return <ChartTooltipCard title={data.date} rows={rows} />;
}

function formatMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ProgrammaticCostChart({
  workspaceId,
}: ProgrammaticCostChartProps) {
  const [groupBy, setGroupBy] = useState<GroupByType | undefined>(undefined);
  const [filter, setFilter] = useState<Partial<Record<GroupByType, string[]>>>(
    {}
  );

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(formatMonth(now));

  const {
    programmaticCostData,
    isProgrammaticCostLoading,
    isProgrammaticCostError,
  } = useWorkspaceProgrammaticCost({
    workspaceId,
    selectedMonth,
    groupBy,
    filter,
  });

  const currentDate = new Date(selectedMonth);

  // Get current month name
  const currentMonth = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Calculate next and previous month dates
  const nextMonthDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 1)
  );
  const previousMonthDate = new Date(
    Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 1, 1)
  );

  // Check if we can go to next month (not in the future)
  const canGoNext = nextMonthDate.getTime() <= now.getTime();

  // Navigate to next month
  const handleNextMonth = () => {
    setSelectedMonth(formatMonth(nextMonthDate));
  };

  // Navigate to previous month
  const handlePreviousMonth = () => {
    setSelectedMonth(formatMonth(previousMonthDate));
  };

  // Process data based on groupBy
  const availableGroupsArray = programmaticCostData?.availableGroups ?? [];
  const points = programmaticCostData?.points ?? [];
  const allGroupKeys = availableGroupsArray.map((g) => g.groupKey);

  // Build map from groupKey to groupLabel from availableGroups (always use labels from availableGroups)
  const groupKeyToLabel = new Map<string, string>();
  availableGroupsArray.forEach((group) => {
    groupKeyToLabel.set(group.groupKey, group.groupLabel);
  });

  // Extract visible group keys from filtered data
  const visibleGroupKeys = new Set<string>();
  points.forEach((point) => {
    point.groups.forEach((g) => {
      visibleGroupKeys.add(g.groupKey);
    });
  });

  const enabledGroupKeys = groupBy ? filter[groupBy] : undefined;

  const groupKeys = availableGroupsArray
    .map((g) => g.groupKey)
    .filter((key) => visibleGroupKeys.has(key));

  // Add others group key if it exists at the end of the array
  if (visibleGroupKeys.has("others")) {
    groupKeys.push("others");
  }

  const legendItems: {
    key: string;
    label: string;
    colorClassName: string;
    onClick?: () => void;
    isActive?: boolean;
  }[] = [];

  availableGroupsArray.forEach((group) => {
    const colorClassName = getColorClassName(
      groupBy,
      group.groupKey,
      allGroupKeys
    );

    let label = group.groupLabel;
    if (groupBy === "origin" && isUserMessageOrigin(group.groupKey)) {
      label = USER_MESSAGE_ORIGIN_LABELS[group.groupKey].label;
    }

    // A group is active if no filter is set (all enabled) OR it's in the enabled list
    const isActive =
      !enabledGroupKeys || enabledGroupKeys.includes(group.groupKey);

    legendItems.push({
      key: group.groupKey,
      label,
      colorClassName,
      onClick: groupBy
        ? () => {
            setFilter((prev) => {
              const currentFilter = prev[groupBy] ?? [];
              const isCurrentlySelected = currentFilter.includes(
                group.groupKey
              );
              if (isCurrentlySelected) {
                // Disable: remove from filter
                const newEnabled = currentFilter.filter(
                  (k) => k !== group.groupKey
                );
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
        : undefined,
      isActive,
    });
  });

  // Add Total Credits to legend (not clickable)
  legendItems.push({
    key: "totalCredits",
    label: "Total Credits",
    colorClassName: COST_PALETTE.totalCredits,
    isActive: true,
  });

  // Transform points into chart data using labels from availableGroups
  const chartData = points.map((point) => {
    const date = new Date(point.timestamp);
    const dataPoint: ChartDataPoint = {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      timestamp: point.timestamp,
      totalInitialCreditsCents: point.totalInitialCreditsCents,
    };

    // Add each group's cumulative cost to the data point using labels from availableGroups
    // Keep undefined values as-is so Recharts doesn't render those points
    point.groups.forEach((g) => {
      dataPoint[g.groupKey] = g.programmaticCostCents;
    });

    return dataPoint;
  });

  const ChartComponent = groupBy ? AreaChart : LineChart;

  // Don't reset filter when groupBy changes - keep it for persistence
  const handleGroupByChange = (newGroupBy: GroupByType | undefined) => {
    setGroupBy(newGroupBy);
  };

  // Check if any filters are applied
  const hasFilters = useMemo(() => {
    return Object.values(filter).some(
      (filterArray) => filterArray && filterArray.length > 0
    );
  }, [filter]);

  const handleClearFilters = () => {
    setFilter({});
  };

  return (
    <ChartContainer
      title={
        <div className="flex items-center gap-2">
          <span>Programmatic Cost</span>
          <Button
            icon={ChevronLeftIcon}
            size="xs"
            variant="ghost"
            onClick={handlePreviousMonth}
            tooltip="Previous month"
          />

          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {currentMonth}
          </span>
          {canGoNext && (
            <Button
              icon={ChevronRightIcon}
              size="xs"
              variant="ghost"
              onClick={handleNextMonth}
              tooltip="Next month"
            />
          )}
        </div>
      }
      description="Total cost accumulated since the start of the month."
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
          dataKey="date"
          type="category"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => `$${(value / 100).toFixed(0)}`}
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
          dataKey="totalInitialCreditsCents"
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
