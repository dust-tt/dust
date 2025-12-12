import { ButtonsSwitch, ButtonsSwitchList } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
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
  COST_PER_MESSAGE_LEGEND,
  COST_PER_MESSAGE_PALETTE,
  COST_TOTAL_LEGEND,
  COST_TOTAL_PALETTE,
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
  useAgentCostMetrics,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";

type CostChartView = "total" | "perMessage";

type CostChartPoint = {
  timestamp: number;
  count: number;
  totalCostUsd: number;
  avgCostUsd: number;
  p95CostUsd: number;
  date?: string;
};

function microUsdToUsd(value: number): number {
  return value / 1_000_000;
}

function zeroFactory(timestamp: number): CostChartPoint {
  return {
    timestamp,
    count: 0,
    totalCostUsd: 0,
    avgCostUsd: 0,
    p95CostUsd: 0,
  };
}

function isCostChartPoint(data: unknown): data is CostChartPoint {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  return (
    "totalCostUsd" in data &&
    "avgCostUsd" in data &&
    "p95CostUsd" in data &&
    "timestamp" in data
  );
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

function CostMetricsTooltip(
  props: TooltipContentProps<number, string> & {
    view: CostChartView;
    versionMarkers: AgentVersionMarker[];
  }
) {
  const { active, payload, versionMarkers, view } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload || !isCostChartPoint(first.payload)) {
    return null;
  }

  const row = first.payload;

  const rows =
    view === "total"
      ? [
          {
            label: "Daily total",
            value: USD_FORMATTER.format(row.totalCostUsd),
            colorClassName: COST_TOTAL_PALETTE.total,
          },
        ]
      : [
          {
            label: "Average",
            value: USD_FORMATTER.format(row.avgCostUsd),
            colorClassName: COST_PER_MESSAGE_PALETTE.average,
          },
          {
            label: "Percentile 95",
            value: USD_FORMATTER.format(row.p95CostUsd),
            colorClassName: COST_PER_MESSAGE_PALETTE.p95,
          },
        ];

  return (
    <ChartTooltipCard
      title={formatTimeSeriesTitle(row.date, row.timestamp, versionMarkers)}
      rows={rows}
    />
  );
}

export function CostChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const [view, setView] = useState<CostChartView>("total");

  const { costMetrics, isCostMetricsLoading, isCostMetricsError } =
    useAgentCostMetrics({
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

  const filteredData = filterTimeSeriesByVersionWindow(
    costMetrics,
    mode,
    selectedVersion,
    versionMarkers
  );

  const data = useMemo(() => {
    const normalized = filteredData.map((point) => ({
      timestamp: point.timestamp,
      count: point.count,
      totalCostUsd: microUsdToUsd(point.costMicroUsd),
      avgCostUsd: microUsdToUsd(point.avgCostMicroUsd),
      p95CostUsd: microUsdToUsd(point.p95CostMicroUsd),
    }));

    return padSeriesToTimeRange(normalized, mode, period, zeroFactory);
  }, [filteredData, mode, period]);

  const includeVersionMarker =
    mode === "timeRange" && versionMarkers.length > 0;

  const legendItems = useMemo(() => {
    return view === "total"
      ? legendFromConstant(COST_TOTAL_LEGEND, COST_TOTAL_PALETTE, {
          includeVersionMarker,
        })
      : legendFromConstant(COST_PER_MESSAGE_LEGEND, COST_PER_MESSAGE_PALETTE, {
          includeVersionMarker,
        });
  }, [view, includeVersionMarker]);

  const emptyMessage =
    costMetrics.length === 0
      ? "No cost data available for this selection."
      : undefined;

  return (
    <ChartContainer
      title="Cost"
      description="Daily spend across all messages, plus average and p95 cost per message."
      isLoading={isCostMetricsLoading}
      errorMessage={
        isCostMetricsError ? "Failed to load cost data." : undefined
      }
      emptyMessage={emptyMessage}
      additionalControls={
        <ButtonsSwitchList defaultValue={view} size="xs">
          <ButtonsSwitch
            value="total"
            label="Total cost"
            onClick={() => setView("total")}
          />
          <ButtonsSwitch
            value="perMessage"
            label="Per message"
            onClick={() => setView("perMessage")}
          />
        </ButtonsSwitchList>
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
    >
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <defs>
          <linearGradient
            id="fillTotalCost"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            className={COST_TOTAL_PALETTE.total}
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
          type="number"
          domain={[0, "auto"]}
          tickFormatter={(value) => USD_FORMATTER.format(value ?? 0)}
          allowDecimals={true}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) => (
            <CostMetricsTooltip
              {...props}
              view={view}
              versionMarkers={versionMarkers}
            />
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
          dataKey="totalCostUsd"
          name="Total cost"
          className={COST_TOTAL_PALETTE.total}
          fill="url(#fillTotalCost)"
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
          hide={view !== "total"}
        />
        <Line
          type="monotone"
          dataKey="avgCostUsd"
          name="Average cost"
          className={COST_PER_MESSAGE_PALETTE.average}
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
          hide={view !== "perMessage"}
        />
        <Line
          type="monotone"
          dataKey="p95CostUsd"
          name="p95 cost"
          className={COST_PER_MESSAGE_PALETTE.p95}
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
          hide={view !== "perMessage"}
        />
        <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
      </LineChart>
    </ChartContainer>
  );
}
