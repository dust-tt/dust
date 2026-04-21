import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  buildSourceChartData,
  getSourceColor,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import { useWorkspaceContextOrigin } from "@app/lib/swr/workspaces";
import { isString } from "@app/types/shared/utils/general";
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from "recharts";

interface WorkspaceSourceChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

const CARD_CHART_HEIGHT = 56;
const BAR_MAX_SIZE = 40;
const CORNER_RADIUS = 4;
const SEGMENT_GAP = 2;
const MIN_LABEL_SEGMENT_WIDTH = 32;

// Recharts injects geometry props as `number | string`, so each field is
// narrowed to `number` at render time.
interface PercentLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  total: number;
}

function PercentLabel({
  x,
  y,
  width,
  height,
  value,
  total,
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
      className="fill-white text-xs font-medium"
    >
      {Math.round((value / total) * 100)}%
    </text>
  );
}

interface SegmentShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

function SegmentShape({
  x,
  y,
  width,
  height,
  fill,
  isFirst,
  isLast,
}: SegmentShapeProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  const gap = isLast ? 0 : SEGMENT_GAP;
  if (width - gap <= 0) {
    return null;
  }
  const leftRadius = isFirst ? CORNER_RADIUS : 0;
  const rightRadius = isLast ? CORNER_RADIUS : 0;
  const right = x + width - gap;
  const bottom = y + height;
  const d =
    `M ${x + leftRadius} ${y} ` +
    `L ${right - rightRadius} ${y} ` +
    `A ${rightRadius} ${rightRadius} 0 0 1 ${right} ${y + rightRadius} ` +
    `L ${right} ${bottom - rightRadius} ` +
    `A ${rightRadius} ${rightRadius} 0 0 1 ${right - rightRadius} ${bottom} ` +
    `L ${x + leftRadius} ${bottom} ` +
    `A ${leftRadius} ${leftRadius} 0 0 1 ${x} ${bottom - leftRadius} ` +
    `L ${x} ${y + leftRadius} ` +
    `A ${leftRadius} ${leftRadius} 0 0 1 ${x + leftRadius} ${y} Z`;
  return <path d={d} fill={fill} />;
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

  // Pivot the breakdown into a single-row dataset so recharts renders a
  // horizontal stacked bar (one segment per origin).
  const chartData =
    data.length > 0
      ? [Object.fromEntries(data.map((d) => [d.origin, d.count]))]
      : [];

  const legendItems = data.map((d) => ({
    key: d.label,
    label: d.label,
    colorClassName: getSourceColor(d.origin),
  }));

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/source-export?days=${period}`,
    filename: `dust_sources_last_${period}_days.csv`,
    disabled:
      isContextOriginLoading || isContextOriginError || data.length === 0,
  });

  const controls = <CsvDownloadButton {...csvDownload} />;

  const statusChip =
    total > 0 ? (
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {total.toLocaleString()} messages
      </span>
    ) : null;

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
      statusChip={statusChip}
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
            const activeOrigin = isString(rawOrigin) ? rawOrigin : undefined;
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
                activeKey={activeOrigin}
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
            className={getSourceColor(entry.origin)}
            fill="currentColor"
            isAnimationActive={false}
            maxBarSize={BAR_MAX_SIZE}
            shape={
              <SegmentShape
                isFirst={idx === 0}
                isLast={idx === data.length - 1}
              />
            }
          >
            <LabelList
              dataKey={entry.origin}
              content={<PercentLabel total={total} />}
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
