import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  buildSourceChartData,
  getSourceColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { useSelectableSeries } from "@app/components/charts/useSelectableSeries";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import { useWorkspaceContextOrigin } from "@app/lib/swr/workspaces";
import { isString } from "@app/types/shared/utils/general";
import { cn } from "@dust-tt/sparkle";
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from "recharts";

interface WorkspaceSourceChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

const CARD_CHART_HEIGHT = 72;
const BAR_MAX_SIZE = 40;
const CORNER_RADIUS = 4;
const MIN_SEGMENT_WIDTH = 6;
const MIN_LABEL_SEGMENT_WIDTH = 32;

function getSegmentRadius(
  index: number,
  count: number
): [number, number, number, number] {
  const left = index === 0 ? CORNER_RADIUS : 0;
  const right = index === count - 1 ? CORNER_RADIUS : 0;
  return [left, right, right, left];
}

// Picks black or white text based on the Tailwind shade in `sourceColor`
// (e.g. `text-emerald-300`). Dust's bar colors render at the same luminance in
// light and dark mode, so a single class suffices.
function getLabelFillClass(sourceColor: string): string {
  const match = sourceColor.match(/text-[a-z]+-(\d+)/);
  if (!match) {
    return "fill-white";
  }
  return Number(match[1]) >= 500 ? "fill-white" : "fill-gray-950";
}

// Recharts injects geometry props as `number | string`, so each field is
// narrowed to `number` at render time.
interface PercentLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  total: number;
  fillClassName: string;
}

function PercentLabel({
  x,
  y,
  width,
  height,
  value,
  total,
  fillClassName,
}: PercentLabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof value !== "number" ||
    total === 0 ||
    width < MIN_LABEL_SEGMENT_WIDTH
  ) {
    return null;
  }
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      className={`${fillClassName} text-xs font-medium`}
    >
      {Math.round((value / total) * 100)}%
    </text>
  );
}

export function WorkspaceSourceChart({
  workspaceId,
  period,
}: WorkspaceSourceChartProps) {
  const { contextOrigin, isContextOriginLoading, isContextOriginError } =
    useWorkspaceContextOrigin({
      workspaceId,
      days: period,
      disabled: !workspaceId,
    });

  const total = contextOrigin.total;
  const data = buildSourceChartData(contextOrigin.buckets, total);

  const { selectedKey, isDimmed, decorate } = useSelectableSeries();

  // Pivot the breakdown into a single-row dataset so recharts renders a
  // horizontal stacked bar (one segment per origin).
  const chartData =
    data.length > 0
      ? [Object.fromEntries(data.map((d) => [d.origin, d.count]))]
      : [];

  const legendItems = decorate(
    data.map((d) => ({
      key: d.origin,
      label: d.label,
      colorClassName: getSourceColor(d.origin),
    }))
  );

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/source-export?days=${period}`,
    filename: `dust_sources_last_${period}_days.csv`,
    disabled:
      isContextOriginLoading || isContextOriginError || data.length === 0,
  });

  const controls = <CsvDownloadButton {...csvDownload} />;

  return (
    <ChartContainer
      title="Source"
      description={`Message volume broken down by source over the last ${period} days.`}
      isLoading={isContextOriginLoading}
      errorMessage={
        isContextOriginError ? "Failed to load source breakdown." : undefined
      }
      emptyMessage={
        data.length === 0 ? "No messages for this selection." : undefined
      }
      height={CARD_CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={controls}
    >
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide domain={[0, total]} />
        <YAxis type="category" hide />
        <Tooltip
          isAnimationActive={false}
          shared={false}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          content={({ active, payload }) => {
            if (!active || data.length === 0) {
              return null;
            }
            const rawOrigin = payload?.[0]?.dataKey;
            const hoveredOrigin = isString(rawOrigin) ? rawOrigin : undefined;
            const rows = data.map((d) => ({
              key: d.origin,
              label: d.label,
              value: d.count.toLocaleString(),
              percent: d.percent,
              colorClassName: getSourceColor(d.origin),
            }));
            return (
              <ChartTooltipCard
                title="Source breakdown"
                rows={rows}
                activeKey={hoveredOrigin ?? selectedKey}
              />
            );
          }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {data.map((entry, idx) => (
          <Bar
            key={entry.origin}
            dataKey={entry.origin}
            stackId="source"
            name={entry.label}
            className={cn(
              getSourceColor(entry.origin),
              "transition-opacity",
              isDimmed(entry.origin) && "opacity-25"
            )}
            fill="currentColor"
            isAnimationActive={false}
            maxBarSize={BAR_MAX_SIZE}
            minPointSize={MIN_SEGMENT_WIDTH}
            radius={getSegmentRadius(idx, data.length)}
          >
            <LabelList
              dataKey={entry.origin}
              content={
                <PercentLabel
                  total={total}
                  fillClassName={getLabelFillClass(getSourceColor(entry.origin))}
                />
              }
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
