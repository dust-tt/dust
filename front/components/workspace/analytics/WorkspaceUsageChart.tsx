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
import { clientFetch } from "@app/lib/egress/client";
import {
  useFeatureFlags,
  useWorkspaceActiveUsersMetrics,
  useWorkspaceUsageMetrics,
} from "@app/lib/swr/workspaces";
import { formatShortDate } from "@app/lib/utils/timestamps";
import { Button, ButtonsSwitch, ButtonsSwitchList } from "@dust-tt/sparkle";
import { DownloadIcon } from "lucide-react";
import { useCallback, useState } from "react";
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
      return `Daily, weekly, and monthly active users over the last ${period} days.`;
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
        value: row.dau.toLocaleString(),
        colorClassName: ACTIVE_USERS_PALETTE.dau,
      },
      {
        label: "WAU (7-day)",
        value: row.wau.toLocaleString(),
        colorClassName: ACTIVE_USERS_PALETTE.wau,
      },
      {
        label: "MAU (28-day)",
        value: row.mau.toLocaleString(),
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
  const { hasFeature } = useFeatureFlags({ workspaceId });
  const showExport = hasFeature("analytics_csv_export");
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const endpoint =
        displayMode === "activity"
          ? `/api/w/${workspaceId}/analytics/usage-metrics-export?days=${period}`
          : `/api/w/${workspaceId}/analytics/active-users-export?days=${period}`;
      const response = await clientFetch(endpoint);
      if (!response.ok) {
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        displayMode === "activity"
          ? `dust_activity_last_${period}_days.csv`
          : `dust_active_users_last_${period}_days.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }, [workspaceId, period, displayMode]);

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

  const legendItems = getLegendItemsForMode(displayMode);

  const usageData = padSeriesToTimeRange<WorkspaceUsageMetricsDatum>(
    usageMetrics,
    "timeRange",
    period,
    zeroFactory
  );

  const activeUsersData = padSeriesToTimeRange<ActiveUsersMetricsDatum>(
    activeUsersMetrics,
    "timeRange",
    period,
    activeUsersZeroFactory
  );

  const data = displayMode === "users" ? activeUsersData : usageData;
  const isLoading =
    displayMode === "users"
      ? isActiveUsersMetricsLoading
      : isUsageMetricsLoading;
  const isError =
    displayMode === "users" ? isActiveUsersMetricsError : isUsageMetricsError;

  const description = getDescriptionForMode(displayMode, period);

  const canDownload = !isLoading && !isError && data.length > 0;

  const controls = (
    <div className="flex items-center gap-2">
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
      {showExport && (
        <Button
          icon={DownloadIcon}
          variant="outline"
          size="xs"
          tooltip="Download CSV"
          onClick={handleDownload}
          disabled={!canDownload || isDownloading}
          isLoading={isDownloading}
        />
      )}
    </div>
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
      additionalControls={controls}
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
