import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
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
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import {
  useAgentUsageMetrics,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

interface UsageMetricsData {
  messages: number;
  conversations: number;
  activeUsers: number;
}

function isUsageMetricsData(data: unknown): data is UsageMetricsData {
  return (
    typeof data === "object" &&
    data !== null &&
    "messages" in data &&
    "conversations" in data &&
    "activeUsers" in data
  );
}

function UsageMetricsTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first?.payload || !isUsageMetricsData(first.payload)) {
    return null;
  }
  const row = first.payload;
  const title = typeof label === "string" ? label : String(label);
  return (
    <ChartTooltipCard
      title={title}
      rows={[
        {
          label: "Messages",
          value: row.messages,
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
  const { period, mode, selectedVersion } = useObservability();
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

  const legendItems = USAGE_METRICS_LEGEND.map(({ key, label }) => ({
    key,
    label,
    colorClassName: USAGE_METRICS_PALETTE[key],
  }));

  const data = useMemo(() => {
    const points = usageMetrics?.points ?? [];

    if (!points.length) {
      return points;
    }

    // In version mode, filter the time series to the selected version window.
    if (mode === "version" && selectedVersion && versionMarkers?.length) {
      const idx = versionMarkers.findIndex(
        (m) => m.version === selectedVersion
      );
      if (idx >= 0) {
        const start = new Date(versionMarkers[idx].timestamp).getTime();
        const end =
          idx + 1 < versionMarkers.length
            ? new Date(versionMarkers[idx + 1].timestamp).getTime()
            : undefined;

        return points.filter((p) => {
          const t = new Date(p.date).getTime();
          return t >= start && (end === undefined || t < end);
        });
      }
    }

    return points;
  }, [usageMetrics?.points, mode, selectedVersion, versionMarkers]);

  return (
    <ChartContainer
      title="Usage Metrics"
      isLoading={isUsageMetricsLoading}
      errorMessage={
        isUsageMetricsError ? "Failed to load observability data." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No usage metrics for this selection." : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-1))"
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id="fillConversations" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-2))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-2))"
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id="fillActiveUsers" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-3))"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="date"
            type="category"
            scale="point"
            allowDuplicatedCategory={false}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <Tooltip
            content={UsageMetricsTooltip}
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
          <Area
            type="natural"
            dataKey="messages"
            name="Messages"
            fill="url(#fillMessages)"
            stroke="hsl(var(--chart-1))"
          />
          <Area
            type="natural"
            dataKey="conversations"
            name="Conversations"
            fill="url(#fillConversations)"
            stroke="hsl(var(--chart-2))"
          />
          <Area
            type="natural"
            dataKey="activeUsers"
            name="Active users"
            fill="url(#fillActiveUsers)"
            stroke="hsl(var(--chart-3))"
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
