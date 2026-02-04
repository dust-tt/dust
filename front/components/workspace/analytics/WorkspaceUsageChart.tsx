import { ButtonsSwitch, ButtonsSwitchList } from "@dust-tt/sparkle";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useWorkspaceUsageMetrics } from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";

type UsageDisplayMode = "activity" | "users";

interface WorkspaceUsageMetricsDatum {
  timestamp: number;
  count: number;
  conversations: number;
  activeUsers: number;
  date?: string;
}

function isWorkspaceUsageMetricsDatum(
  data: unknown
): data is WorkspaceUsageMetricsDatum {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    "count" in data &&
    "conversations" in data &&
    "activeUsers" in data
  );
}

function zeroFactory(timestamp: number): WorkspaceUsageMetricsDatum {
  return {
    timestamp,
    count: 0,
    conversations: 0,
    activeUsers: 0,
  };
}

interface UsageMetricsTooltipProps extends TooltipContentProps<number, string> {
  displayMode: UsageDisplayMode;
}

function UsageMetricsTooltip({
  active,
  payload,
  displayMode,
}: UsageMetricsTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload || !isWorkspaceUsageMetricsDatum(first.payload)) {
    return null;
  }

  const row = first.payload;
  const title = row.date ?? formatShortDate(row.timestamp);

  const rows =
    displayMode === "activity"
      ? [
          {
            label: "Messages",
            value: row.count.toLocaleString(),
            colorClassName: USAGE_METRICS_PALETTE.messages,
          },
          {
            label: "Conversations",
            value: row.conversations.toLocaleString(),
            colorClassName: USAGE_METRICS_PALETTE.conversations,
          },
        ]
      : [
          {
            label: "Active users",
            value: row.activeUsers.toLocaleString(),
            colorClassName: USAGE_METRICS_PALETTE.activeUsers,
          },
        ];

  return <ChartTooltipCard title={title} rows={rows} />;
}

interface WorkspaceUsageChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceUsageChart({
  workspaceId,
  period,
}: WorkspaceUsageChartProps) {
  const [displayMode, setDisplayMode] = useState<UsageDisplayMode>("activity");

  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useWorkspaceUsageMetrics({
      workspaceId,
      days: period,
      interval: "day",
      disabled: !workspaceId,
    });

  const legendItems: LegendItem[] =
    displayMode === "activity"
      ? [
          {
            key: "messages",
            label: "Messages",
            colorClassName: USAGE_METRICS_PALETTE.messages,
          },
          {
            key: "conversations",
            label: "Conversations",
            colorClassName: USAGE_METRICS_PALETTE.conversations,
          },
        ]
      : [
          {
            key: "activeUsers",
            label: "Active users",
            colorClassName: USAGE_METRICS_PALETTE.activeUsers,
          },
        ];

  const data = padSeriesToTimeRange<WorkspaceUsageMetricsDatum>(
    usageMetrics,
    "timeRange",
    period,
    zeroFactory
  );

  const modeSelector = (
    <ButtonsSwitchList defaultValue={displayMode} size="xs">
      <ButtonsSwitch
        value="activity"
        label="Activity"
        onClick={() => setDisplayMode("activity")}
      />
      <ButtonsSwitch
        value="users"
        label="Users"
        onClick={() => setDisplayMode("users")}
      />
    </ButtonsSwitchList>
  );

  return (
    <ChartContainer
      title="Activity"
      description={
        displayMode === "activity"
          ? `Messages and conversations over the last ${period} days.`
          : `Active users over the last ${period} days.`
      }
      isLoading={isUsageMetricsLoading}
      errorMessage={
        isUsageMetricsError ? "Failed to load workspace usage." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No usage metrics for this selection." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={modeSelector}
    >
      <LineChart
        data={data}
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
          allowDecimals={false}
        />
        <Tooltip
          isAnimationActive={false}
          content={(props: TooltipContentProps<number, string>) => (
            <UsageMetricsTooltip {...props} displayMode={displayMode} />
          )}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {displayMode === "activity" ? (
          <>
            <Line
              type={period === 7 || period === 14 ? "linear" : "monotone"}
              strokeWidth={2}
              dataKey="count"
              name="Messages"
              className={USAGE_METRICS_PALETTE.messages}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type={period === 7 || period === 14 ? "linear" : "monotone"}
              strokeWidth={2}
              dataKey="conversations"
              name="Conversations"
              className={USAGE_METRICS_PALETTE.conversations}
              stroke="currentColor"
              dot={false}
            />
          </>
        ) : (
          <Line
            type={period === 7 || period === 14 ? "linear" : "monotone"}
            strokeWidth={2}
            dataKey="activeUsers"
            name="Active users"
            className={USAGE_METRICS_PALETTE.activeUsers}
            stroke="currentColor"
            dot={false}
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}
