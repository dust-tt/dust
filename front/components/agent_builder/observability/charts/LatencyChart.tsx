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
  LATENCY_LEGEND,
  LATENCY_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import {
  ChartLegend,
  legendFromConstant,
} from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import {
  useAgentLatency,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

interface LatencyData {
  messages: number;
  average: number;
}

function isLatencyData(data: unknown): data is LatencyData {
  return typeof data === "object" && data !== null && "average" in data;
}

function LatencyTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first?.payload || !isLatencyData(first.payload)) {
    return null;
  }
  const row = first.payload;
  const title = typeof label === "string" ? label : String(label);
  return (
    <ChartTooltipCard
      title={title}
      rows={[
        {
          label: "Average time",
          value: `${row.average}s`,
          colorClassName: LATENCY_PALETTE.average,
        },
      ]}
    />
  );
}

export function LatencyChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period, mode } = useObservabilityContext();
  const {
    latency: rawData,
    isLatencyLoading,
    isLatencyError,
  } = useAgentLatency({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const { versionMarkers } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const data = padSeriesToTimeRange(rawData, mode, period, (date) => ({
    date,
    messages: 0,
    average: 0,
  }));

  const legendItems = legendFromConstant(LATENCY_LEGEND, LATENCY_PALETTE, {
    includeVersionMarker: mode === "timeRange" && versionMarkers.length > 0,
  });

  return (
    <ChartContainer
      title="Latency"
      description="Average time to complete output (seconds). Lower is better."
      isLoading={isLatencyLoading}
      errorMessage={
        isLatencyError ? "Failed to load observability data." : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient
              id="fillAverage"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              className={LATENCY_PALETTE.average}
            >
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
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
            tickFormatter={(value) => `${value}s`}
            type="number"
            allowDecimals={true}
          />
          <Tooltip
            content={LatencyTooltip}
            cursor={false}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          <Area
            type="monotone"
            dataKey="average"
            name="Average time to complete output"
            className={LATENCY_PALETTE.average}
            fill="url(#fillAverage)"
            stroke="currentColor"
          />
          <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
