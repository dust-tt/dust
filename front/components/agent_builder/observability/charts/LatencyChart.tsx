import React, { useMemo } from "react";
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
  LATENCY_LEGEND,
  LATENCY_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import type { LatencyPoint } from "@app/components/agent_builder/observability/hooks";
import { useLatencyData } from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { legendFromConstant } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { formatTimeSeriesTitle } from "@app/components/agent_builder/observability/shared/tooltipHelpers";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";
import { formatShortDate } from "@app/lib/utils/timestamps";

interface LatencyData extends LatencyPoint {
  date: string;
}

function isLatencyData(data: unknown): data is LatencyData {
  return (
    typeof data === "object" &&
    data !== null &&
    "avgLatencyMs" in data &&
    "percentilesLatencyMs" in data
  );
}

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    count: 0,
    avgLatencyMs: 0,
    percentilesLatencyMs: 0,
  };
}

function LatencyTooltip(
  props: TooltipContentProps<number, string> & {
    versionMarkers: AgentVersionMarker[];
  }
) {
  const { active, payload, versionMarkers } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first?.payload || !isLatencyData(first.payload)) {
    return null;
  }
  const row = first.payload;

  return (
    <ChartTooltipCard
      title={formatTimeSeriesTitle(row.date, row.timestamp, versionMarkers)}
      rows={[
        {
          label: "Average time",
          value: `${row.avgLatencyMs}s`,
          colorClassName: LATENCY_PALETTE.average,
        },
        {
          label: "Median time",
          value: `${row.percentilesLatencyMs}s`,
          colorClassName: LATENCY_PALETTE.median,
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
  const { period, mode, selectedVersion } = useObservabilityContext();

  const {
    data: rawData,
    isLoading,
    errorMessage,
  } = useLatencyData({
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

    return rawData.map((data) => ({
      ...data,
      date: formatShortDate(data.timestamp),
    }));
  }, [rawData, mode, period]);

  const legendItems = legendFromConstant(LATENCY_LEGEND, LATENCY_PALETTE, {
    includeVersionMarker: mode === "timeRange" && versionMarkers.length > 0,
  });

  return (
    <ChartContainer
      title="Latency"
      description="Average and median time to complete output. Lower is better."
      isLoading={isLoading}
      errorMessage={errorMessage}
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <LineChart
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
          tickFormatter={(value) => `${value}s`}
          type="number"
          allowDecimals={true}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) => (
            <LatencyTooltip {...props} versionMarkers={versionMarkers} />
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
        <Line
          type="monotone"
          dataKey="avgLatencyMs"
          name="Average time to complete output"
          className={LATENCY_PALETTE.average}
          fill="url(#fillAverage)"
          stroke="currentColor"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="percentilesLatencyMs"
          name="Median time to complete output"
          className={LATENCY_PALETTE.median}
          stroke="currentColor"
          dot={false}
        />
        <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
      </LineChart>
    </ChartContainer>
  );
}
