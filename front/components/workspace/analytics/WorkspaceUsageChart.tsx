import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  ACTIVE_USERS_PALETTE,
  CHART_HEIGHT,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import {
  useWorkspaceActiveUsersMetrics,
  useWorkspaceAnalyticsOverview,
  useWorkspaceUsageMetrics,
} from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";
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

type UsageDisplayMode = "activity" | "users";

function getLineType(
  period: ObservabilityTimeRangeType
): "linear" | "monotone" {
  return period === 7 || period === 14 ? "linear" : "monotone";
}

function getLegendItemsForMode(displayMode: UsageDisplayMode): LegendItem[] {
  switch (displayMode) {
    case "activity":
      return [
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
      ];
    case "users":
      return [
        {
          key: "dau",
          label: "Daily",
          colorClassName: ACTIVE_USERS_PALETTE.dau,
        },
        {
          key: "wau",
          label: "Weekly",
          colorClassName: ACTIVE_USERS_PALETTE.wau,
        },
        {
          key: "mau",
          label: "Monthly",
          colorClassName: ACTIVE_USERS_PALETTE.mau,
        },
      ];
  }
}

function getDescriptionForMode(
  displayMode: UsageDisplayMode,
  period: ObservabilityTimeRangeType
): string {
  switch (displayMode) {
    case "activity":
      return `Messages and conversations over the last ${period} days.`;
    case "users":
      return `Percentage of workspace members active daily, weekly, and monthly over the last ${period} days.`;
  }
}

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

interface ActiveUsersMetricsDatum {
  timestamp: number;
  dau: number;
  wau: number;
  mau: number;
  date?: string;
}

function toPercentage(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function isActiveUsersMetricsDatum(
  data: unknown
): data is ActiveUsersMetricsDatum {
  return (
    typeof data === "object" &&
    data !== null &&
    "timestamp" in data &&
    "dau" in data &&
    "wau" in data &&
    "mau" in data
  );
}

function activeUsersZeroFactory(timestamp: number): ActiveUsersMetricsDatum {
  return {
    timestamp,
    dau: 0,
    wau: 0,
    mau: 0,
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
  if (!first?.payload) {
    return null;
  }

  if (displayMode === "users") {
    if (!isActiveUsersMetricsDatum(first.payload)) {
      return null;
    }
    const row = first.payload;
    const title = row.date ?? formatShortDate(row.timestamp);
    const rows = [
      {
        label: "DAU (Daily)",
        value: `${row.dau}%`,
        colorClassName: ACTIVE_USERS_PALETTE.dau,
      },
      {
        label: "WAU (7-day)",
        value: `${row.wau}%`,
        colorClassName: ACTIVE_USERS_PALETTE.wau,
      },
      {
        label: "MAU (28-day)",
        value: `${row.mau}%`,
        colorClassName: ACTIVE_USERS_PALETTE.mau,
      },
    ];
    return <ChartTooltipCard title={title} rows={rows} />;
  }

  if (!isWorkspaceUsageMetricsDatum(first.payload)) {
    return null;
  }

  const row = first.payload;
  const title = row.date ?? formatShortDate(row.timestamp);

  const rows = [
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
      disabled: !workspaceId || displayMode === "users",
    });

  const {
    activeUsersMetrics,
    isActiveUsersMetricsLoading,
    isActiveUsersMetricsError,
  } = useWorkspaceActiveUsersMetrics({
    workspaceId,
    days: period,
    disabled: !workspaceId || displayMode !== "users",
  });

  const { overview } = useWorkspaceAnalyticsOverview({
    workspaceId,
    days: period,
    disabled: !workspaceId || displayMode !== "users",
  });

  const legendItems = getLegendItemsForMode(displayMode);

  const usageData = padSeriesToTimeRange<WorkspaceUsageMetricsDatum>(
    usageMetrics,
    "timeRange",
    period,
    zeroFactory
  );

  const totalMembers = overview?.totalMembers ?? 0;

  const activeUsersData = padSeriesToTimeRange<ActiveUsersMetricsDatum>(
    activeUsersMetrics,
    "timeRange",
    period,
    activeUsersZeroFactory
  ).map((point) => ({
    ...point,
    dau: toPercentage(point.dau, totalMembers),
    wau: toPercentage(point.wau, totalMembers),
    mau: toPercentage(point.mau, totalMembers),
  }));

  const data = displayMode === "users" ? activeUsersData : usageData;
  const isLoading =
    displayMode === "users"
      ? isActiveUsersMetricsLoading
      : isUsageMetricsLoading;
  const isError =
    displayMode === "users" ? isActiveUsersMetricsError : isUsageMetricsError;

  const description = getDescriptionForMode(displayMode, period);

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
      description={description}
      isLoading={isLoading}
      errorMessage={isError ? "Failed to load workspace usage." : undefined}
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
          domain={displayMode === "users" ? [0, 100] : undefined}
          tickFormatter={
            displayMode === "users" ? (v: number) => `${v}%` : undefined
          }
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
              type={getLineType(period)}
              strokeWidth={2}
              dataKey="count"
              name="Messages"
              className={USAGE_METRICS_PALETTE.messages}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type={getLineType(period)}
              strokeWidth={2}
              dataKey="conversations"
              name="Conversations"
              className={USAGE_METRICS_PALETTE.conversations}
              stroke="currentColor"
              dot={false}
            />
          </>
        ) : (
          <>
            <Line
              type={getLineType(period)}
              strokeWidth={2}
              dataKey="dau"
              name="DAU"
              className={ACTIVE_USERS_PALETTE.dau}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type={getLineType(period)}
              strokeWidth={2}
              dataKey="wau"
              name="WAU"
              className={ACTIVE_USERS_PALETTE.wau}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type={getLineType(period)}
              strokeWidth={2}
              dataKey="mau"
              name="MAU"
              className={ACTIVE_USERS_PALETTE.mau}
              stroke="currentColor"
              dot={false}
            />
          </>
        )}
      </LineChart>
    </ChartContainer>
  );
}
