import {
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
  USAGE_METRICS_LEGEND,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { legendFromConstant } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { formatTimeSeriesTitle } from "@app/components/agent_builder/observability/shared/tooltipHelpers";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import {
  filterTimeSeriesByVersionWindow,
  padSeriesToTimeRange,
} from "@app/components/agent_builder/observability/utils";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import {
  useAgentUsageMetrics,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

interface UsageMetricsData {
  timestamp: number;
  count: number;
  conversations: number;
  activeUsers: number;
}

function isUsageMetricsData(data: unknown): data is UsageMetricsData {
  return (
    typeof data === "object" &&
    data !== null &&
    "count" in data &&
    "conversations" in data &&
    "activeUsers" in data
  );
}

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    count: 0,
    conversations: 0,
    activeUsers: 0,
  };
}

function UsageMetricsTooltip(
  props: TooltipContentProps<number, string> & {
    versionMarkers: AgentVersionMarker[];
  }
) {
  const { active, payload, versionMarkers } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload || !isUsageMetricsData(first.payload)) {
    return null;
  }

  const row = first.payload;

  return (
    <ChartTooltipCard
      title={formatTimeSeriesTitle(row.date, row.timestamp, versionMarkers)}
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

export function UsageMetricsChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useAgentUsageMetrics({
      workspaceId,
      agentConfigurationId,
      days: period,
      interval: "day",
      disabled: !workspaceId || !agentConfigurationId,
    });
  const { versionMarkers } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const legendItems = legendFromConstant(
    USAGE_METRICS_LEGEND,
    USAGE_METRICS_PALETTE,
    {
      includeVersionMarker: mode === "timeRange" && versionMarkers.length > 0,
    }
  );

  const filteredData = filterTimeSeriesByVersionWindow(
    usageMetrics,
    mode,
    selectedVersion,
    versionMarkers
  );

  const data = padSeriesToTimeRange<UsageMetricsData>(
    filteredData,
    mode,
    period,
    zeroFactory
  );

  return (
    <ChartContainer
      title="Activity"
      description="Messages, conversations, and active users."
      isLoading={isUsageMetricsLoading}
      errorMessage={
        isUsageMetricsError ? "Failed to load observability data." : undefined
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
          {/* Gradients use currentColor; color is set via classes */}
          <linearGradient
            id="fillMessages"
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
            id="fillConversations"
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
            id="fillActiveUsers"
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
            <UsageMetricsTooltip {...props} versionMarkers={versionMarkers} />
          )}
          cursor={false}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {/* Areas for each usage metric */}
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          dataKey="count"
          name="Messages"
          className={USAGE_METRICS_PALETTE.messages}
          stroke="currentColor"
          dot={false}
        />
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          dataKey="conversations"
          name="Conversations"
          className={USAGE_METRICS_PALETTE.conversations}
          stroke="currentColor"
          dot={false}
        />
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          dataKey="activeUsers"
          name="Active users"
          className={USAGE_METRICS_PALETTE.activeUsers}
          stroke="currentColor"
          dot={false}
        />
        <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
      </LineChart>
    </ChartContainer>
  );
}
