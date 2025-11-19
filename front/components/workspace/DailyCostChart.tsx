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
  COST_LEGEND,
  COST_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { legendFromConstant } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import { useWorkspaceUsageMetrics } from "@app/lib/swr/workspaces";

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    costCents: 0,
  };
}

// Custom tooltip component
function CostTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }

  return (
    <ChartTooltipCard
      title={data.date}
      rows={[
        {
          label: "Cost",
          value: `$${(data.costCents / 100).toFixed(2)}`,
          colorClassName: COST_PALETTE.costCents,
        },
      ]}
    />
  );
}

interface DailyCostChartProps {
  workspaceId: string;
  period: number;
}

export function DailyCostChart({ workspaceId, period }: DailyCostChartProps) {
  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useWorkspaceUsageMetrics({
      workspaceId,
      days: period,
      interval: "day",
    });

  const legendItems = legendFromConstant(COST_LEGEND, COST_PALETTE);

  const data = padSeriesToTimeRange(
    usageMetrics,
    "timeRange",
    period,
    zeroFactory
  );

  return (
    <ChartContainer
      title="Daily cost - last 30 days"
      description="Cost per day."
      isLoading={isUsageMetricsLoading}
      errorMessage={
        isUsageMetricsError ? "Failed to load observability data." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No usage metrics for this selection." : undefined
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      isAllowFullScreen
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
          content={CostTooltip}
          cursor={false}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {/* Areas for each usage metric */}
        <Line
          type={period === 7 || period === 14 ? "linear" : "monotone"}
          dataKey="costCents"
          name="Cost"
          className={"text-gray-300 dark:text-gray-300-night"}
          stroke="currentColor"
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
