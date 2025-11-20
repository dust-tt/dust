import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";
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
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import {
  getIndexedColor,
  getSourceColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import type { GroupByType } from "@app/lib/swr/workspaces";
import { useWorkspaceProgrammaticCost } from "@app/lib/swr/workspaces";

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
  groups: string[]
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
      const groupName = p.name || String(p.dataKey);
      let label = groupName;
      if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
        label = USER_MESSAGE_ORIGIN_LABELS[groupName].label;
      }

      const colorClassName = getColorClassName(groupBy, groupName, groups);

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

export function ProgrammaticCostChart({
  workspaceId,
}: ProgrammaticCostChartProps) {
  const [groupBy, setGroupBy] = useState<GroupByType | undefined>(undefined);

  const {
    programmaticCostData,
    isProgrammaticCostLoading,
    isProgrammaticCostError,
  } = useWorkspaceProgrammaticCost({
    workspaceId,
    groupBy,
  });

  // Get current month name
  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Process data based on groupBy
  let chartData: ChartDataPoint[] = [];
  let groups: string[] = [];
  const legendItems: { key: string; label: string; colorClassName: string }[] =
    [];

  if (programmaticCostData) {
    // Extract all unique group names (excluding "total" for ungrouped view)
    const groupSet = new Set<string>();
    programmaticCostData.points.forEach((point) => {
      point.groups.forEach((g) => {
        groupSet.add(g.groupLabel);
      });
    });

    // For grouped view, order groups with "Others" at the end
    if (groupBy) {
      const regularGroups = Array.from(groupSet).filter(
        (name) => name !== "Others"
      );
      const othersGroups = Array.from(groupSet).filter(
        (name) => name === "Others"
      );
      groups = [...regularGroups, ...othersGroups];
    } else {
      groups = Array.from(groupSet);
    }

    // Build color map for tooltips and legend items
    groups.forEach((groupName) => {
      const colorClassName = getColorClassName(groupBy, groupName, groups);

      let label = groupName;
      if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
        label = USER_MESSAGE_ORIGIN_LABELS[groupName].label;
      }

      legendItems.push({
        key: groupName,
        label,
        colorClassName,
      });
    });

    // Add Total Credits to legend
    legendItems.push({
      key: "totalCredits",
      label: "Total Credits",
      colorClassName: COST_PALETTE.totalCredits,
    });

    // Transform points into chart data
    chartData = programmaticCostData.points.map((point) => {
      const date = new Date(point.timestamp);
      const dataPoint: ChartDataPoint = {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: point.timestamp,
        totalInitialCreditsCents: point.totalInitialCreditsCents,
      };

      // Add each group's cumulative cost to the data point
      // Keep undefined values as-is so Recharts doesn't render those points
      point.groups.forEach((g) => {
        dataPoint[g.groupLabel] = g.programmaticCostCents;
      });

      return dataPoint;
    });
  }

  const ChartComponent = groupBy ? AreaChart : LineChart;

  return (
    <ChartContainer
      title={`Programmatic Cost - ${currentMonth}`}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={
                groupBy
                  ? GROUP_BY_OPTIONS.find((opt) => opt.value === groupBy)?.label
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
                  setGroupBy(
                    option.value === "global" ? undefined : option.value
                  )
                }
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
            GroupedTooltip(props, groupBy, groups)
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
        {groups.map((groupName) => {
          const colorClassName = getColorClassName(groupBy, groupName, groups);

          return groupBy ? (
            <Area
              key={groupName}
              type="monotone"
              dataKey={groupName}
              stackId="cost"
              stroke="currentColor"
              fill="currentColor"
              fillOpacity={0.6}
              strokeWidth={2}
              className={colorClassName}
            />
          ) : (
            <Line
              key={groupName}
              type="monotone"
              className={colorClassName}
              dataKey={groupName}
              name={groupName}
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
