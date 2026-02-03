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
  USAGE_METRICS_LEGEND,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { legendFromConstant } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import { useWorkspaceUsageMetrics } from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";

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

function UsageMetricsTooltip(props: TooltipContentProps<number, string>) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload || !isWorkspaceUsageMetricsDatum(first.payload)) {
    return null;
  }

  const row = first.payload;
  const title = row.date ?? formatShortDate(row.timestamp);

  return (
    <ChartTooltipCard
      title={title}
      rows={[
        {
          label: "Messages",
          value: row.count,
          colorClassName: USAGE_METRICS_PALETTE.messages,
        },
        {
          label: "Conversations",
          value: row.conversations,
          colorClassName: USAGE_METRICS_PALETTE.conversations,
        },
        {
          label: "Active users",
          value: row.activeUsers,
          colorClassName: USAGE_METRICS_PALETTE.activeUsers,
        },
      ]}
    />
  );
}

interface WorkspaceUsageChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceUsageChart({
  workspaceId,
  period,
}: WorkspaceUsageChartProps) {
  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useWorkspaceUsageMetrics({
      workspaceId,
      days: period,
      interval: "day",
      disabled: !workspaceId,
    });

  const legendItems = legendFromConstant(
    USAGE_METRICS_LEGEND,
    USAGE_METRICS_PALETTE
  );

  const data = padSeriesToTimeRange<WorkspaceUsageMetricsDatum>(
    usageMetrics,
    "timeRange",
    period,
    zeroFactory
  );

  return (
    <ChartContainer
      title="Activity"
      description="Messages, conversations, and active users."
      isLoading={isUsageMetricsLoading}
      errorMessage={
        isUsageMetricsError ? "Failed to load workspace usage." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No usage metrics for this selection." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <defs>
          <linearGradient
            id="workspaceFillMessages"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            className={USAGE_METRICS_PALETTE.messages}
          >
            <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
            <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient
            id="workspaceFillConversations"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            className={USAGE_METRICS_PALETTE.conversations}
          >
            <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
            <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient
            id="workspaceFillActiveUsers"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            className={USAGE_METRICS_PALETTE.activeUsers}
          >
            <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
            <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
          </linearGradient>
        </defs>
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
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) => (
            <UsageMetricsTooltip {...props} />
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
        <Line
          type={period === 7 || period === 14 ? "linear" : "monotone"}
          strokeWidth={2}
          dataKey="activeUsers"
          name="Active users"
          className={USAGE_METRICS_PALETTE.activeUsers}
          stroke="currentColor"
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
