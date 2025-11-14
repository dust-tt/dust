import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FullscreenIcon,
  Sheet,
  SheetContent,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { useWorkspaceCumulativeCost } from "@app/lib/swr/workspaces";

interface CumulativeCostChartProps {
  workspaceId: string;
}

const GROUP_BY_OPTIONS = [
  { value: "global" as const, label: "Global" },
  { value: "agent" as const, label: "By Agent" },
  { value: "origin" as const, label: "By Origin" },
];

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

const OTHERS_COLOR = "#9ca3af"; // gray for "Others" group

export function CumulativeCostChart({ workspaceId }: CumulativeCostChartProps) {
  const [groupBy, setGroupBy] = useState<"global" | "agent" | "origin">(
    "global"
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    cumulativeCostData,
    isCumulativeCostLoading,
    isCumulativeCostError,
  } = useWorkspaceCumulativeCost({
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

  if (cumulativeCostData) {
    if (cumulativeCostData.groupBy === "global") {
      chartData = cumulativeCostData.points.map((point) => {
        const date = new Date(point.timestamp);
        return {
          date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          cumulativeCostCents: point.cumulativeCostCents,
        };
      });
    } else {
      // Grouped data - need to merge all time points
      const timePointsMap: Record<
        number,
        { date: string; [key: string]: any }
      > = {};
      const allTimestamps = new Set<number>();

      // Collect all unique timestamps across all groups
      for (const groupData of Object.values(cumulativeCostData.groups)) {
        for (const point of groupData.points) {
          allTimestamps.add(point.timestamp);
        }
      }

      // Initialize all time points
      for (const timestamp of Array.from(allTimestamps).sort()) {
        const date = new Date(timestamp);
        timePointsMap[timestamp] = {
          date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          timestamp,
        };
      }

      // Fill in data for each group, carrying forward cumulative values
      for (const [groupKey, groupData] of Object.entries(
        cumulativeCostData.groups
      )) {
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
    }
  }

  // Render the chart (used in both normal and fullscreen modes)
  const renderChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
        {groupBy === "global" ? (
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
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value: number) => [
                `$${(value / 100).toFixed(2)}`,
                "Total Cost",
              ]}
              labelStyle={{ fontWeight: "bold" }}
            />
            <Line
              type="monotone"
              dataKey="cumulativeCostCents"
              name="Cumulative Cost"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        ) : (
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
          >
            <defs>
              {groups.map((groupName, index) => {
                const color =
                  groupName === "Others"
                    ? OTHERS_COLOR
                    : COLORS[index % COLORS.length];
                return (
                  <linearGradient
                    key={`gradient-${groupName}`}
                    id={`fill-${groupName.replace(/\s+/g, "-")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.3} />
                  </linearGradient>
                );
              })}
            </defs>
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
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [
                `$${(value / 100).toFixed(2)}`,
                name,
              ]}
              labelStyle={{ fontWeight: "bold" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            />
            {groups.map((groupName, index) => {
              const color =
                groupName === "Others"
                  ? OTHERS_COLOR
                  : COLORS[index % COLORS.length];
              return (
                <Area
                  key={groupName}
                  type="monotone"
                  dataKey={groupName}
                  stackId="cost"
                  stroke={color}
                  fill={`url(#fill-${groupName.replace(/\s+/g, "-")})`}
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        )}
    </ResponsiveContainer>
  );

  return (
    <>
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
          <div className="flex items-center gap-2">
            <Button
              icon={FullscreenIcon}
              variant="ghost"
              size="xs"
              onClick={() => setIsFullscreen(true)}
              tooltip="View fullscreen"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={
                    GROUP_BY_OPTIONS.find((opt) => opt.value === groupBy)
                      ?.label || "Global"
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
                    onClick={() => setGroupBy(option.value)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        {renderChart(CHART_HEIGHT)}
      </ChartContainer>

      <Sheet open={isFullscreen} onOpenChange={setIsFullscreen}>
        <SheetContent size="xl">
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    Cumulative Cost - {currentMonth}
                  </h2>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label={
                          GROUP_BY_OPTIONS.find((opt) => opt.value === groupBy)
                            ?.label || "Global"
                        }
                        size="sm"
                        variant="outline"
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {GROUP_BY_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          label={option.label}
                          onClick={() => setGroupBy(option.value)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  icon={XMarkIcon}
                  variant="ghost"
                  onClick={() => setIsFullscreen(false)}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                {renderChart(window.innerHeight - 200)}
              </div>
            </div>
          </SheetContent>
        </Sheet>
    </>
  );
}
