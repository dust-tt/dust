import {
  Button,
  FullscreenIcon,
  Sheet,
  SheetContent,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART_HEIGHT,
  COST_LEGEND,
  COST_PALETTE,
  USAGE_METRICS_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import {
  ChartLegend,
  legendFromConstant,
} from "@app/components/agent_builder/observability/shared/ChartLegend";
import { padSeriesToTimeRange } from "@app/components/agent_builder/observability/utils";
import { useWorspaceUsageMetrics } from "@app/lib/swr/workspaces";

function zeroFactory(timestamp: number) {
  return {
    timestamp,
    costCents: 0,
  };
}

interface ActivityChartProps {
  workspaceId: string;
  period: number;
}

export function ActivityChart({ workspaceId, period }: ActivityChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useWorspaceUsageMetrics({
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

  // Render the chart (used in both normal and fullscreen modes)
  const renderChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            {/* Gradients use currentColor; color is set via classes */}
            <linearGradient
              id="fillMessages"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              className={USAGE_METRICS_PALETTE.messages}
            >
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient
              id="fillConversations"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              className={USAGE_METRICS_PALETTE.conversations}
            >
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.8} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient
              id="fillActiveUsers"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              className={USAGE_METRICS_PALETTE.activeUsers}
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
    </ResponsiveContainer>
  );

  return (
    <>
      <ChartContainer
        title="Activity"
        description="Messages, conversations, and active users."
        isLoading={isUsageMetricsLoading}
        errorMessage={
          isUsageMetricsError
            ? "Failed to load observability data."
            : undefined
        }
        emptyMessage={
          data.length === 0 ? "No usage metrics for this selection." : undefined
        }
        additionalControls={
          <Button
            icon={FullscreenIcon}
            variant="ghost"
            size="xs"
            onClick={() => setIsFullscreen(true)}
            tooltip="View fullscreen"
          />
        }
      >
        {renderChart(CHART_HEIGHT)}
        <ChartLegend items={legendItems} />
      </ChartContainer>

      <Sheet open={isFullscreen} onOpenChange={setIsFullscreen}>
        <SheetContent size="xl">
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between border-b pb-4">
                <h2 className="text-xl font-semibold">
                  Activity - Cost Overview
                </h2>
                <Button
                  icon={XMarkIcon}
                  variant="ghost"
                  onClick={() => setIsFullscreen(false)}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                {renderChart(window.innerHeight - 200)}
              </div>
              <div className="mt-4 border-t pt-4">
                <ChartLegend items={legendItems} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
    </>
  );
}
