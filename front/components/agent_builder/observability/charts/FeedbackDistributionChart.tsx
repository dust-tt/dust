import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FeedbackDistributionTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import {
  CHART_HEIGHT,
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { legendFromConstant } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { VersionMarkersDots } from "@app/components/agent_builder/observability/shared/VersionMarkers";
import {
  filterTimeSeriesByVersionWindow,
  padSeriesToTimeRange,
} from "@app/components/agent_builder/observability/utils";
import {
  useAgentFeedbackDistribution,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";
import { formatShortDate } from "@app/lib/utils/timestamps";

interface FeedbackDistributionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    date: formatShortDate(timestamp),
    positive: 0,
    negative: 0,
  };
}

export function FeedbackDistributionChart({
  workspaceId,
  agentConfigurationId,
}: FeedbackDistributionChartProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const {
    feedbackDistribution,
    isFeedbackDistributionLoading,
    isFeedbackDistributionError,
  } = useAgentFeedbackDistribution({
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

  const legendItems = legendFromConstant(
    FEEDBACK_DISTRIBUTION_LEGEND,
    FEEDBACK_DISTRIBUTION_PALETTE,
    {
      includeVersionMarker: mode === "timeRange" && versionMarkers.length > 0,
    }
  );

  const filteredData = filterTimeSeriesByVersionWindow(
    feedbackDistribution,
    mode,
    selectedVersion,
    versionMarkers
  );

  const data = padSeriesToTimeRange(filteredData, mode, period, zeroFactory);

  return (
    <ChartContainer
      title="Feedback Trends"
      description="Daily counts of positive and negative feedback."
      isLoading={isFeedbackDistributionLoading}
      errorMessage={
        isFeedbackDistributionError
          ? "Failed to load feedback distribution data."
          : undefined
      }
      emptyMessage={
        data.length === 0 ? "No feedback data available." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
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
        />
        <Tooltip
          content={FeedbackDistributionTooltip}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        <Line
          type="monotone"
          dataKey="positive"
          name="Positive"
          className={FEEDBACK_DISTRIBUTION_PALETTE.positive}
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="negative"
          name="Negative"
          className={FEEDBACK_DISTRIBUTION_PALETTE.negative}
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
        />
        <VersionMarkersDots mode={mode} versionMarkers={versionMarkers} />
      </LineChart>
    </ChartContainer>
  );
}
