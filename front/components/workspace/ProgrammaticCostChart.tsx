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
  USER_MESSAGE_ORIGIN_LABELS,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import {
  getSourceColor,
  getToolColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import { useWorkspaceProgrammaticCost } from "@app/lib/swr/workspaces";

interface ProgrammaticCostChartProps {
  workspaceId: string;
}

type GroupByOptionValue = "global" | "agent" | "origin";

type ChartDataPoint = {
  date: string;
  timestamp: number;
  totalInitialCreditsCents: number;
  programmaticCostCents?: number;
  [key: string]: string | number | undefined;
};

const GROUP_BY_OPTIONS: {
  value: GroupByOptionValue;
  label: string;
}[] = [
  { value: "global", label: "Global" },
  { value: "agent", label: "By Agent" },
  { value: "origin", label: "By Origin" },
];

// Custom tooltip for global view
function GlobalTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }

  return (
    <ChartTooltipCard
      title={data.date}
      rows={[
        {
          label: "Cumulative Cost",
          value: `$${(data.programmaticCostCents / 100).toFixed(2)}`,
          colorClassName: "text-blue-500",
        },
        {
          label: "Total Credits",
          value: `$${(data.totalInitialCreditsCents / 100).toFixed(2)}`,
          colorClassName: "text-green-500",
        },
      ]}
    />
  );
}

// Custom tooltip for grouped view
function GroupedTooltip(
  props: TooltipContentProps<number, string>,
  groupBy: "agent" | "origin" | undefined,
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

      let colorClassName: string;
      if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
        colorClassName = getSourceColor(groupName, "text");
      } else if (groupBy === "agent") {
        colorClassName = getToolColor(groupName, groups, "text");
      } else {
        colorClassName = "text-green-500";
      }

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
    colorClassName: "text-green-500",
  });

  return <ChartTooltipCard title={data.date} rows={rows} />;
}

export function ProgrammaticCostChart({
  workspaceId,
}: ProgrammaticCostChartProps) {
  const [groupBy, setGroupBy] = useState<"agent" | "origin" | undefined>(
    undefined
  );

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
    if (programmaticCostData.groupBy) {
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
      let colorClassName: string;
      if (
        programmaticCostData.groupBy === "origin" &&
        isUserMessageOrigin(groupName)
      ) {
        colorClassName = getSourceColor(groupName, "text");
      } else if (programmaticCostData.groupBy === "agent") {
        colorClassName = getToolColor(groupName, groups, "text");
      } else {
        colorClassName = "text-green-500";
      }

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
      colorClassName: "text-green-500",
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
        if (programmaticCostData.groupBy) {
          // For grouped view, use group name as key
          dataPoint[g.groupLabel] = g.programmaticCostCents;
        } else {
          // For non-grouped view, use a standard key
          dataPoint.programmaticCostCents = g.programmaticCostCents;
        }
      });

      return dataPoint;
    });
  }

  return (
    <ChartContainer
      title={`Cumulative Cost - ${currentMonth}`}
      description="Total cost accumulated since the start of the month."
      isLoading={isProgrammaticCostLoading}
      errorMessage={
        isProgrammaticCostError
          ? "Failed to load cumulative cost data."
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
      legendItems={groupBy ? legendItems : undefined}
      isAllowFullScreen
    >
      {!groupBy ? (
        <LineChart
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
            scale="point"
            allowDuplicatedCategory={false}
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
            content={GlobalTooltip}
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
            dataKey="programmaticCostCents"
            name="Cumulative Cost"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: "#3b82f6", r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="totalInitialCreditsCents"
            name="Total Credits"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      ) : (
        <AreaChart
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
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 5 }}
          />
          {groups.map((groupName) => {
            let colorClassName: string;
            if (groupBy === "origin" && isUserMessageOrigin(groupName)) {
              colorClassName = getSourceColor(groupName, "text");
            } else if (groupBy === "agent") {
              colorClassName = getToolColor(groupName, groups, "text");
            } else {
              colorClassName = "text-green-500";
            }

            return (
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
            );
          })}
        </AreaChart>
      )}
    </ChartContainer>
  );
}
