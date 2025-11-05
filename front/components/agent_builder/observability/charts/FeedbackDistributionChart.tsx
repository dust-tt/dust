import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
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
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import {
  filterTimeSeriesByVersionWindow,
  padSeriesToTimeRange,
} from "@app/components/agent_builder/observability/utils";
import {
  useAgentFeedbackDistribution,
  useAgentVersionMarkers,
} from "@app/lib/swr/assistants";
import { format } from "date-fns/format";

interface FeedbackDistributionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
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

  const legendItems = FEEDBACK_DISTRIBUTION_LEGEND.map(({ key, label }) => ({
    key,
    label,
    colorClassName: FEEDBACK_DISTRIBUTION_PALETTE[key],
  }));

  const filteredData = filterTimeSeriesByVersionWindow(
    feedbackDistribution,
    mode,
    selectedVersion,
    versionMarkers
  );

  const data = padSeriesToTimeRange(filteredData, mode, period, (date) => ({
    date,
    positive: 0,
    negative: 0,
  }));

  return (
    <ChartContainer
      title="Feedback Trends"
      isLoading={isFeedbackDistributionLoading}
      errorMessage={
        isFeedbackDistributionError
          ? "Failed to load feedback distribution data."
          : undefined
      }
      emptyMessage={
        data.length === 0 ? "No feedback data available." : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
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
            content={FeedbackDistributionTooltip}
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
          {mode === "timeRange" &&
            versionMarkers.map((versionMarker) => (
              <ReferenceLine
                key={format(versionMarker.timestamp, "d MMM")}
                x={versionMarker.timestamp}
                strokeDasharray="5 5"
                strokeWidth={1}
                stroke="hsl(var(--chart-5))"
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
