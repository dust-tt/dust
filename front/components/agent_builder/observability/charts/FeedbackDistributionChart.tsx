import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";

import { FeedbackDistributionTooltip } from "@app/components/agent_builder/observability/charts/ChartsTooltip";
import {
  CHART_HEIGHT,
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { useAgentFeedbackDistribution } from "@app/lib/swr/assistants";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";

interface FeedbackDistributionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function FeedbackDistributionChart({
  workspaceId,
  agentConfigurationId,
}: FeedbackDistributionChartProps) {
  const { period, mode, selectedVersion } = useObservability();
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

  const data = useMemo(
    () => feedbackDistribution?.points ?? [],
    [feedbackDistribution?.points]
  );

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
          {(versionMarkers ?? []).map((m) => {
            const isSelected =
              mode === "version" && selectedVersion === m.version;
            return (
              <ReferenceLine
                key={m.version}
                x={m.timestamp}
                stroke={"hsl(var(--primary))"}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray="5 5"
                label={{
                  value: `v${m.version}`,
                  position: "top",
                  fill: "hsl(var(--muted-foreground))",
                }}
                ifOverflow="extendDomain"
              />
            );
          })}
          <Line
            type="monotone"
            dataKey="positive"
            name="Positive"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="negative"
            name="Negative"
            stroke="hsl(var(--chart-4))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
