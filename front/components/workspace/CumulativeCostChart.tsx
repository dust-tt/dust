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
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  getSourceColor,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { useWorkspaceCumulativeCost } from "@app/lib/swr/workspaces";

interface CumulativeCostChartProps {
  workspaceId: string;
}

const GROUP_BY_OPTIONS = [
  { value: "global" as const, label: "Global" },
  { value: "agent" as const, label: "By Agent" },
  { value: "origin" as const, label: "By Origin" },
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
          value: `$${(data.cumulativeCostCents / 100).toFixed(2)}`,
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
  groupColorMap: Map<string, number>
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
    .filter((p) => p.dataKey !== "totalInitialCreditsCents" && p.value)
    .map((p) => {
      const groupName = p.name || String(p.dataKey);
      const colorIndex = groupColorMap.get(groupName);
      return {
        label: groupName as string,
        value: `$${((p.value as number) / 100).toFixed(2)}`,
        colorClassName:
          colorIndex !== undefined
            ? getSourceColor(colorIndex)
            : "text-green-500",
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

export function CumulativeCostChart({ workspaceId }: CumulativeCostChartProps) {
  const [groupBy, setGroupBy] = useState<"agent" | "origin" | undefined>(
    undefined
  );

  const { cumulativeCostData, isCumulativeCostLoading, isCumulativeCostError } =
    useWorkspaceCumulativeCost({
      workspaceId,
      groupBy,
    });

  // Get current month name
  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Process data based on groupBy
  let chartData: any[] = [];
  let groups: string[] = [];
  const groupColorMap = new Map<string, number>();

  if (cumulativeCostData) {
    if (!cumulativeCostData.groupBy) {
      chartData = cumulativeCostData.points.map((point) => {
        const date = new Date(point.timestamp);
        return {
          date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          cumulativeCostCents: point.cumulativeCostCents,
          totalInitialCreditsCents: point.totalInitialCreditsCents,
        };
      });
    } else {
      // Grouped data - need to merge all time points
      const timePointsMap: Record<
        number,
        { date: string; [key: string]: any }
      > = {};
      const allTimestamps = new Set<number>();

      // Collect all unique timestamps across all groups and credit data
      for (const groupData of Object.values(cumulativeCostData.groups)) {
        for (const point of groupData.points) {
          allTimestamps.add(point.timestamp);
        }
      }

      // Initialize all time points with credit data
      for (const timestamp of Array.from(allTimestamps).sort()) {
        const date = new Date(timestamp);
        // Get credit data from any group (it's the same across all groups)
        const anyGroupData = Object.values(cumulativeCostData.groups)[0];
        const pointWithCredits = anyGroupData?.points.find(
          (p) => p.timestamp === timestamp
        );

        timePointsMap[timestamp] = {
          date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          timestamp,
          totalInitialCreditsCents:
            pointWithCredits?.totalInitialCreditsCents ?? 0,
        };
      }

      // Fill in data for each group, carrying forward cumulative values
      for (const [, groupData] of Object.entries(cumulativeCostData.groups)) {
        const groupPointsMap = new Map(
          groupData.points.map((p) => [p.timestamp, p.cumulativeCostCents])
        );

        let lastCumulativeCost = 0;
        for (const timestamp of Array.from(allTimestamps).sort()) {
          const cumulativeCost = groupPointsMap.get(timestamp);
          if (cumulativeCost !== undefined) {
            lastCumulativeCost = cumulativeCost;
          }
          timePointsMap[timestamp][groupData.name] = lastCumulativeCost;
        }
      }

      chartData = Object.values(timePointsMap).sort(
        (a, b) => a.timestamp - b.timestamp
      );

      // Get group names, with "Others" at the end
      const groupEntries = Object.entries(cumulativeCostData.groups);
      const regularGroups = groupEntries
        .filter(([key]) => key !== "others")
        .map(([, data]) => data.name);
      const othersGroup = groupEntries
        .filter(([key]) => key === "others")
        .map(([, data]) => data.name);
      groups = [...regularGroups, ...othersGroup];

      // Build color map for tooltips
      groups.forEach((groupName, index) => {
        groupColorMap.set(groupName, index);
      });
    }
  }

  return (
    <ChartContainer
      title={`Cumulative Cost - ${currentMonth}`}
      description="Total cost accumulated since the start of the month."
      isLoading={isCumulativeCostLoading}
      errorMessage={
        isCumulativeCostError
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
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
          <Line
            type="monotone"
            dataKey="cumulativeCostCents"
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
              GroupedTooltip(props, groupColorMap)
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
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
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
          {groups.map((groupName, index) => (
            <Area
              key={groupName}
              type="monotone"
              dataKey={groupName}
              stackId="cost"
              stroke="currentColor"
              fill="currentColor"
              fillOpacity={0.6}
              strokeWidth={2}
              className={getSourceColor(index)}
            />
          ))}
        </AreaChart>
      )}
    </ChartContainer>
  );
}
