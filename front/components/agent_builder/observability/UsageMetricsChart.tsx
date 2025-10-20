import { cn } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
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

import { ChartContainer } from "@app/components/agent_builder/observability/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import type {
  ObservabilityIntervalType,
  ObservabilityTimeRangeType,
} from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  DEFAULT_PERIOD_DAYS,
  OBSERVABILITY_INTERVALS,
  USAGE_METRICS_LEGEND,
  USAGE_METRICS_PALETTE,
  VERSION_MARKER_STYLE,
} from "@app/components/agent_builder/observability/constants";
import {
  useAgentUsageMetrics,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

function parseUTCDate(s: string): number {
  const parts = s.split("-");
  if (parts.length === 3) {
    const yy = Number(parts[0]);
    const mm = Number(parts[1]);
    const dd = Number(parts[2]);
    if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
      return Date.UTC(yy, mm - 1, dd);
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function snapVersionMarkersToLabels(
  markers: Array<{ version: string; timestamp: string }>,
  labels: string[]
): Array<{ version: string; x: string }> {
  if (!labels.length || !markers.length) {
    return [];
  }

  const labelTimes = labels.map((s) => ({ s, t: parseUTCDate(s) }));

  const snapToLabel = (ts: string): string => {
    const markerT = parseUTCDate(ts);
    let best: { s: string; t: number } | null = null;
    for (const lt of labelTimes) {
      if (lt.t <= markerT && (!best || lt.t > best.t)) {
        best = lt;
      }
    }
    return best ? best.s : labels[0];
  };

  return markers.map((m) => ({
    version: m.version,
    x: snapToLabel(m.timestamp),
  }));
}

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
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);
  const [interval, setInterval] = useState<ObservabilityIntervalType>("day");

  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useAgentUsageMetrics({
      workspaceId,
      agentConfigurationId,
      days: period,
      interval,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const { versionMarkers, isVersionMarkersLoading, isVersionMarkersError } =
    useAgentVersionMarkers({
      workspaceId,
      agentConfigurationId,
      days: period,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const isLoading = isUsageMetricsLoading || isVersionMarkersLoading;
  const isError = isUsageMetricsError || isVersionMarkersError;

  const legendItems = USAGE_METRICS_LEGEND.map(({ key, label }) => ({
    key,
    label,
    colorClassName: USAGE_METRICS_PALETTE[key],
  }));

  const { data, snappedMarkers } = useMemo(() => {
    const dataPoints = usageMetrics?.points ?? [];
    const markers = versionMarkers ?? [];
    const labels = dataPoints.map((d) => d.date);
    return {
      data: dataPoints,
      snappedMarkers: snapVersionMarkersToLabels(markers, labels),
    };
  }, [usageMetrics?.points, versionMarkers]);

  const intervalControls = (
    <div className="flex items-center gap-2">
      {OBSERVABILITY_INTERVALS.map((i) => (
        <button
          key={i}
          onClick={() => setInterval(i)}
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
  );

  return (
    <ChartContainer
      title="Usage Metrics"
      period={period}
      onPeriodChange={setPeriod}
      isLoading={isLoading}
      errorMessage={isError ? "Failed to load observability data." : undefined}
      additionalControls={intervalControls}
    >
      <>
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
            {snappedMarkers.map((m, index) => (
              <ReferenceLine
                key={`${m.version}-${m.x}`}
                x={m.x}
                stroke={VERSION_MARKER_STYLE.stroke}
                strokeWidth={VERSION_MARKER_STYLE.strokeWidth}
                strokeDasharray={VERSION_MARKER_STYLE.strokeDasharray}
                ifOverflow="extendDomain"
              >
                <Label
                  value={`v${m.version}`}
                  position="top"
                  fill={VERSION_MARKER_STYLE.stroke}
                  fontSize={VERSION_MARKER_STYLE.labelFontSize}
                  offset={
                    VERSION_MARKER_STYLE.labelOffsetBase +
                    index * VERSION_MARKER_STYLE.labelOffsetIncrement
                  }
                />
              </ReferenceLine>
            ))}
          </BarChart>
        </ResponsiveContainer>
        <ChartLegend items={legendItems} />
      </>
    </ChartContainer>
  );
}
