import {
  CHART_HEIGHT,
  COST_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { ConsumptionProgressBarWithNumbers } from "@app/components/pages/workspace/developers/ConsumptionProgressBar";
import {
  useSelfImprovingDailySpend,
  useSkillsSelfImprovingSpend,
} from "@app/lib/swr/useSelfImprovingSkillsSettings";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

type DisplayMode = "cumulative" | "daily";

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "cumulative", label: "Cumulative" },
  { value: "daily", label: "Daily" },
];

const ANIMATION_DURATION_MS = 1500;

type ChartDataPoint = {
  date: string;
  timestamp: number;
  spendMicroUsd?: number;
  predictionMicroUsd?: number;
  capMicroUsd?: number;
};

function SpendTooltip(
  props: TooltipContentProps<number, string>,
  displayMode: DisplayMode
): JSX.Element | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload as ChartDataPoint | undefined;
  if (!data) {
    return null;
  }

  const date = new Date(data.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const rows: { label: string; value: string; colorClassName: string }[] = [];

  if (data.spendMicroUsd !== undefined) {
    rows.push({
      label: displayMode === "cumulative" ? "Total spent" : "Daily spend",
      value: `$${(data.spendMicroUsd / 1_000_000).toFixed(2)}`,
      colorClassName: COST_PALETTE.costMicroUsd,
    });
  }

  if (data.predictionMicroUsd !== undefined) {
    rows.push({
      label: "Projected",
      value: `$${(data.predictionMicroUsd / 1_000_000).toFixed(2)}`,
      colorClassName: COST_PALETTE.costMicroUsd,
    });
  }

  if (data.capMicroUsd !== undefined) {
    rows.push({
      label: "Monthly cap",
      value: `$${(data.capMicroUsd / 1_000_000).toFixed(2)}`,
      colorClassName: COST_PALETTE.totalCredits,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return <ChartTooltipCard title={date} rows={rows} />;
}

interface SelfImprovingSpendChartProps {
  owner: LightWorkspaceType;
  capMicroUsd: number;
}

function SelfImprovingSpendChart({
  owner,
  capMicroUsd,
}: SelfImprovingSpendChartProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cumulative");

  const {
    dailySpendMicroUsd,
    periodStartDate,
    periodEndDate,
    isDailySpendLoading,
    isDailySpendError,
  } = useSelfImprovingDailySpend({ owner });

  const chartData = useMemo(() => {
    if (!periodStartDate || !periodEndDate) {
      return [];
    }

    const start = new Date(periodStartDate);
    const end = new Date(periodEndDate);
    const today = new Date();
    const effectiveEnd = end < today ? end : today;

    // Build actual data points up to today.
    const points: ChartDataPoint[] = [];
    let cumulativeSpend = 0;
    const current = new Date(start);

    while (current < effectiveEnd) {
      const dateStr = current.toISOString().slice(0, 10);
      const daySpend = dailySpendMicroUsd[dateStr] ?? 0;
      cumulativeSpend += daySpend;

      points.push({
        date: dateStr,
        timestamp: current.getTime(),
        spendMicroUsd:
          displayMode === "cumulative" ? cumulativeSpend : daySpend,
      });

      current.setUTCDate(current.getUTCDate() + 1);
    }

    // Add remaining days of the period.
    if (points.length > 0 && end > today) {
      const elapsedDays = points.length;
      const avgDailySpend = cumulativeSpend / elapsedDays;

      if (displayMode === "cumulative") {
        // Anchor the prediction at the last actual point.
        points[points.length - 1].predictionMicroUsd = cumulativeSpend;
      }

      let projectedSpend = cumulativeSpend;
      const projectionCurrent = new Date(effectiveEnd);
      while (projectionCurrent < end) {
        const dateStr = projectionCurrent.toISOString().slice(0, 10);
        projectedSpend += avgDailySpend;

        const point: ChartDataPoint = {
          date: dateStr,
          timestamp: projectionCurrent.getTime(),
        };

        if (displayMode === "cumulative") {
          point.predictionMicroUsd = projectedSpend;
        } else {
          // Show future days as zero bars.
          point.spendMicroUsd = 0;
        }

        points.push(point);
        projectionCurrent.setUTCDate(projectionCurrent.getUTCDate() + 1);
      }
    }

    // In cumulative mode, add the cap as a flat reference line.
    if (displayMode === "cumulative" && capMicroUsd > 0) {
      for (const point of points) {
        point.capMicroUsd = capMicroUsd;
      }
    }

    return points;
  }, [
    dailySpendMicroUsd,
    periodStartDate,
    periodEndDate,
    displayMode,
    capMicroUsd,
  ]);

  const ChartComponent = displayMode === "daily" ? BarChart : LineChart;

  const hasPrediction =
    displayMode === "cumulative" &&
    chartData.some((p) => p.predictionMicroUsd !== undefined);

  const legendItems: LegendItem[] = useMemo(() => {
    const items: LegendItem[] = [
      {
        key: "spend",
        label:
          displayMode === "cumulative" ? "Cumulative spend" : "Daily spend",
        colorClassName: COST_PALETTE.costMicroUsd,
        isActive: true,
      },
    ];
    if (displayMode === "cumulative" && capMicroUsd > 0) {
      items.push({
        key: "cap",
        label: "Monthly cap",
        colorClassName: COST_PALETTE.totalCredits,
        isActive: true,
      });
    }
    return items;
  }, [displayMode, capMicroUsd]);

  return (
    <ChartContainer
      title="Spending over billing period"
      isLoading={isDailySpendLoading}
      legendItems={legendItems}
      errorMessage={
        isDailySpendError ? "Failed to load spend data." : undefined
      }
      emptyMessage={
        chartData.length === 0 ? "No spend data for this period." : undefined
      }
      height={CHART_HEIGHT}
      additionalControls={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={
                DISPLAY_MODE_OPTIONS.find((o) => o.value === displayMode)
                  ?.label ?? "Cumulative"
              }
              size="xs"
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {DISPLAY_MODE_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                label={o.label}
                onClick={() => setDisplayMode(o.value)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <ChartComponent
        data={chartData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="timestamp"
          type="category"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={true}
          axisLine={false}
          tickMargin={8}
          minTickGap={8}
          tickFormatter={(value) =>
            new Date(value).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => `$${(value / 1_000_000).toFixed(0)}`}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) =>
            SpendTooltip(props, displayMode)
          }
          cursor={false}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {displayMode === "daily" ? (
          <Bar
            dataKey="spendMicroUsd"
            fill="currentColor"
            className={COST_PALETTE.costMicroUsd}
          />
        ) : (
          <>
            <Line
              type="monotone"
              dataKey="spendMicroUsd"
              stroke="currentColor"
              strokeWidth={2}
              className={COST_PALETTE.costMicroUsd}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              animationDuration={ANIMATION_DURATION_MS / 2}
            />
            {hasPrediction && (
              <Line
                type="monotone"
                dataKey="predictionMicroUsd"
                stroke="currentColor"
                strokeWidth={2}
                className={COST_PALETTE.costMicroUsd}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls={false}
                animationBegin={ANIMATION_DURATION_MS / 2}
                animationDuration={ANIMATION_DURATION_MS / 2}
              />
            )}
            {capMicroUsd > 0 && (
              <Line
                type="monotone"
                dataKey="capMicroUsd"
                stroke="currentColor"
                strokeWidth={2}
                className={COST_PALETTE.totalCredits}
                dot={false}
                activeDot={false}
                connectNulls={false}
                animationDuration={ANIMATION_DURATION_MS}
              />
            )}
          </>
        )}
      </ChartComponent>
    </ChartContainer>
  );
}

interface SelfImprovingSkillsConsumptionSectionProps {
  owner: LightWorkspaceType;
  capMicroUsd: number;
}

export function SelfImprovingSkillsConsumptionSection({
  owner,
  capMicroUsd,
}: SelfImprovingSkillsConsumptionSectionProps) {
  const { spentMicroUsdBySkillId, isSpendLoading } =
    useSkillsSelfImprovingSpend({ owner });

  const totalSpentDollars =
    Object.values(spentMicroUsdBySkillId).reduce((sum, v) => sum + v, 0) /
    1_000_000;
  const capDollars = capMicroUsd / 1_000_000;

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Current period consumption" />
      {isSpendLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <ConsumptionProgressBarWithNumbers
          consumed={totalSpentDollars}
          total={capDollars}
          consumedFormatted={`$${totalSpentDollars.toFixed(2)}`}
          totalFormatted={`$${capDollars.toFixed(2)}`}
        />
      )}
      <SelfImprovingSpendChart owner={owner} capMicroUsd={capMicroUsd} />
    </Page.Vertical>
  );
}
