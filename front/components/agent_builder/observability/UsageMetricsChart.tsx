import { cn, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import type {
  ObservabilityIntervalType,
  ObservabilityTimeRangeType,
} from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  OBSERVABILITY_INTERVALS,
  OBSERVABILITY_TIME_RANGE,
  USAGE_METRICS_LEGEND,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useAgentUsageMetrics } from "@app/lib/swr/assistants";

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
  return (
    <ChartTooltipCard
      title={String(label ?? "")}
      rows={[
        {
          label: "Messages",
          value: row.messages,
          colorClass: USAGE_METRICS_PALETTE.messages,
        },
        {
          label: "Conversations",
          value: row.conversations,
          colorClass: USAGE_METRICS_PALETTE.conversations,
        },
        {
          label: "Active users",
          value: row.activeUsers,
          colorClass: USAGE_METRICS_PALETTE.activeUsers,
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
  const [period, setPeriod] = useState<ObservabilityTimeRangeType>("14d");
  const [interval, setInterval] = useState<ObservabilityIntervalType>("day");

  const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useAgentUsageMetrics({
      workspaceId,
      agentConfigurationId,
      days,
      interval,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const data = usageMetrics?.points ?? [];
  const versionMarkers = usageMetrics?.versionMarkers ?? [];

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Usage Metrics</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {OBSERVABILITY_TIME_RANGE.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  period === p
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {OBSERVABILITY_INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  interval === i
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isUsageMetricsLoading ? (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <Spinner size="lg" />
        </div>
      ) : isUsageMetricsError ? (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <p className="text-sm text-muted-foreground">
            Failed to load usage metrics.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs text-muted-foreground" />
            <YAxis className="text-xs text-muted-foreground" />
            <Tooltip
              cursor={{ fill: "hsl(var(--border) / 0.1)" }}
              content={UsageMetricsTooltip}
            />
            {USAGE_METRICS_LEGEND.map(({ key, label }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill="currentColor"
                className={USAGE_METRICS_PALETTE[key]}
              />
            ))}
            {versionMarkers.map((marker) => (
              <ReferenceLine
                key={marker.version}
                x={marker.timestamp}
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                strokeDasharray="3 3"
              >
                <Label
                  value={`v${marker.version}`}
                  position="top"
                  className="fill-warning text-xs"
                  offset={10}
                />
              </ReferenceLine>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {USAGE_METRICS_LEGEND.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-sm bg-current",
                USAGE_METRICS_PALETTE[key]
              )}
            />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
