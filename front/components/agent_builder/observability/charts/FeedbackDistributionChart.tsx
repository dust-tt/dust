import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { useAgentFeedbackDistribution } from "@app/lib/swr/assistants";

interface FeedbackDistributionData {
  positive: number;
  negative: number;
}

function isFeedbackDistributionData(
  data: unknown
): data is FeedbackDistributionData {
  return (
    typeof data === "object" &&
    data !== null &&
    "positive" in data &&
    "negative" in data
  );
}

function FeedbackDistributionTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first?.payload || !isFeedbackDistributionData(first.payload)) {
    return null;
  }
  const row = first.payload;
  const title = typeof label === "string" ? label : String(label);
  return (
    <ChartTooltipCard
      title={title}
      rows={[
        {
          label: "Positive",
          value: row.positive,
          colorClassName: FEEDBACK_DISTRIBUTION_PALETTE.positive,
        },
        {
          label: "Negative",
          value: row.negative,
          colorClassName: FEEDBACK_DISTRIBUTION_PALETTE.negative,
        },
      ]}
    />
  );
}

interface FeedbackDistributionChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function FeedbackDistributionChart({
  workspaceId,
  agentConfigurationId,
}: FeedbackDistributionChartProps) {
  const { period } = useObservability();
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
      title="Feedback trends"
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
