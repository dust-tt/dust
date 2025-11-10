import { Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  ERROR_RATE_LEGEND,
  ERROR_RATE_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useErrorRateData } from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import {
  ChartLegend,
  legendFromConstant,
} from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import {
  getErrorRateChipInfo,
  padSeriesToTimeRange,
} from "@app/components/agent_builder/observability/utils";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";

interface ErrorRateData {
  timestamp: number;
  date: string;
  total: number;
  failed: number;
  errorRate: number;
}

function isErrorRateData(data: unknown): data is ErrorRateData {
  return typeof data === "object" && data !== null && "errorRate" in data;
}

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    total: 0,
    failed: 0,
    errorRate: 0,
  };
}

function ErrorRateTooltip({
  active,
  payload,
}: TooltipContentProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  const row = first.payload;
  if (!row || !isErrorRateData(row)) {
    return null;
  }
  return (
    <ChartTooltipCard
      title={row.date}
      rows={[
        {
          label: "Error rate",
          value: `${row.errorRate}%`,
          colorClassName: ERROR_RATE_PALETTE.errorRate,
        },
        {
          label: "Failed",
          value: String(row.failed),
        },
        {
          label: "Total messages",
          value: String(row.total),
        },
      ]}
    />
  );
}

interface ErrorRateChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function ErrorRateChart({
  workspaceId,
  agentConfigurationId,
}: ErrorRateChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();

  const {
    data: rawData,
    isLoading,
    errorMessage,
  } = useErrorRateData({
    workspaceId,
    agentConfigurationId,
    period,
    mode,
    filterVersion: selectedVersion?.version,
  });

  const { versionMarkers } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const data = useMemo(() => {
    if (mode === "timeRange") {
      return padSeriesToTimeRange(rawData, mode, period, zeroFactory);
    }
    return rawData;
  }, [rawData, mode, period]);

  const legendItems = legendFromConstant(
    ERROR_RATE_LEGEND,
    ERROR_RATE_PALETTE,
    {
      includeVersionMarker: mode === "timeRange" && versionMarkers.length > 0,
    }
  );

  const errorRateChipInfo = getErrorRateChipInfo(
    data[data.length - 1]?.errorRate ?? 0
  );

  return (
    <ChartContainer
      title="Error rate"
      description="Share of messages that failed (%). Warning at 5%, critical at 10%."
      statusChip={
        !isLoading && !errorMessage && data.length > 0 ? (
          <Chip
            size="mini"
            color={errorRateChipInfo.color}
            label={errorRateChipInfo.label}
          />
        ) : undefined
      }
      isLoading={isLoading}
      errorMessage={errorMessage}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id="fillErrorRate" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            className="stroke-border dark:stroke-border-night"
          />
          <XAxis
            dataKey="date"
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
            type="number"
            allowDecimals={true}
            domain={[0, 100]}
            label={{
              value: "Error rate (%)",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            content={ErrorRateTooltip}
            cursor={false}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          <ReferenceLine
            y={5}
            stroke="hsl(var(--warning))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <ReferenceLine
            y={10}
            stroke="hsl(var(--destructive))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="errorRate"
            name="Error rate"
            fill="url(#fillErrorRate)"
            stroke="hsl(var(--chart-4))"
          />
          <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
