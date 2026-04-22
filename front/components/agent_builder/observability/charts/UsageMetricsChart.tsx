import {
  CHART_HEIGHT,
  USAGE_METRICS_LEGEND,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { formatTimeSeriesTitle } from "@app/components/agent_builder/observability/shared/tooltipHelpers";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import {
  filterTimeSeriesByVersionWindow,
  padSeriesToTimeRange,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { legendFromConstant } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useSelectableSeries } from "@app/components/charts/useSelectableSeries";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import {
  useAgentUsageMetrics,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";
import { BROWSER_TIMEZONE } from "@app/lib/swr/workspaces";
import { cn } from "@dust-tt/sparkle";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

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
    activeKey?: string;
    selectedKey?: string;
  }
) {
  const { active, payload, versionMarkers, activeKey, selectedKey } = props;
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
          key: "messages",
          label: "Messages",
          value: row.count,
          colorClassName: USAGE_METRICS_PALETTE.messages,
        },
        {
          key: "conversations",
          label: "Conversations",
          value: row.conversations,
          colorClassName: USAGE_METRICS_PALETTE.conversations,
        },
        {
          key: "activeUsers",
          label: "Active users",
          value: row.activeUsers,
          colorClassName: USAGE_METRICS_PALETTE.activeUsers,
        },
      ]}
      activeKey={activeKey}
      selectedKey={selectedKey}
    />
  );
}

interface UsageMetricsChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function UsageMetricsChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: UsageMetricsChartProps) {
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
    disabled: !workspaceId || !agentConfigurationId || !isCustomAgent,
  });

  const {
    selectedKey,
    activeKey,
    isDimmed,
    lineActiveDot,
    decorate,
    hoverHandlers,
  } = useSelectableSeries();

  const legendItems = decorate(
    legendFromConstant(USAGE_METRICS_LEGEND, USAGE_METRICS_PALETTE, {
      includeVersionMarker:
        isCustomAgent && mode === "timeRange" && versionMarkers.length > 0,
    }),
    { skip: (item) => item.key === "versionMarkers" }
  );

  const filteredData = filterTimeSeriesByVersionWindow(
    usageMetrics,
    isCustomAgent ? mode : "timeRange",
    selectedVersion,
    versionMarkers
  );

  const data = padSeriesToTimeRange<UsageMetricsData>(
    filteredData,
    mode,
    period,
    zeroFactory,
    BROWSER_TIMEZONE
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
            <UsageMetricsTooltip
              {...props}
              versionMarkers={versionMarkers}
              activeKey={activeKey}
              selectedKey={selectedKey}
            />
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
        {/* Areas for each usage metric */}
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          strokeWidth={2}
          dataKey="count"
          name="Messages"
          className={cn(
            USAGE_METRICS_PALETTE.messages,
            "transition-opacity",
            isDimmed("messages") && "opacity-25"
          )}
          stroke="currentColor"
          dot={false}
          activeDot={lineActiveDot("messages")}
          isAnimationActive={false}
          {...hoverHandlers("messages")}
        />
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          strokeWidth={2}
          dataKey="conversations"
          name="Conversations"
          className={cn(
            USAGE_METRICS_PALETTE.conversations,
            "transition-opacity",
            isDimmed("conversations") && "opacity-25"
          )}
          stroke="currentColor"
          dot={false}
          activeDot={lineActiveDot("conversations")}
          isAnimationActive={false}
          {...hoverHandlers("conversations")}
        />
        <Line
          type={
            mode === "version" || period === 7 || period === 14
              ? "linear"
              : "monotone"
          }
          strokeWidth={2}
          dataKey="activeUsers"
          name="Active users"
          className={cn(
            USAGE_METRICS_PALETTE.activeUsers,
            "transition-opacity",
            isDimmed("activeUsers") && "opacity-25"
          )}
          stroke="currentColor"
          dot={false}
          activeDot={lineActiveDot("activeUsers")}
          isAnimationActive={false}
          {...hoverHandlers("activeUsers")}
        />
        {isCustomAgent && (
          <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
        )}
      </LineChart>
    </ChartContainer>
  );
}
