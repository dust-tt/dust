import { Label } from "@dust-tt/sparkle";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import {
  ChartTooltipCard,
  LegendDot,
} from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { isToolChartUsagePayload } from "@app/components/agent_builder/observability/types";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

interface ToolUsageTooltipProps
  extends TooltipContentProps<number, string> {
  topTools: string[];
  hoveredTool?: string | null;
}

export function ChartsTooltip({
  active,
  payload,
  topTools,
  hoveredTool,
}: ToolUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Only show a tooltip when a specific tool segment is hovered.
  if (!hoveredTool) {
    return null;
  }

  const typed = payload.filter(isToolChartUsagePayload);
  const filtered = typed.filter((p) => p.name === hoveredTool);

  if (filtered.length === 0) {
    return null;
  }

  const toolPayload = filtered[0];
  const toolName = toolPayload.name ?? "";
  const data = toolPayload.payload?.values?.[toolName];

  if (!data || (data.count ?? 0) <= 0) {
    return null;
  }

  const colorClassName = getIndexedColor(toolName, topTools);

  // If there's a breakdown, show the configurations as bullet points
  if (data.breakdown && data.breakdown.length > 0) {
    // Aggregate rows by display label so that multiple configurations
    // with the same name (or missing names) are combined into a single row.
    const aggregated = data.breakdown.reduce<Map<string, { value: number }>>(
      (acc, entry) => {
        const displayLabel = asDisplayToolName(entry.label);
        const current = acc.get(displayLabel) ?? { value: 0 };
        current.value += entry.count;
        acc.set(displayLabel, current);
        return acc;
      },
      new Map()
    );

    const total = Array.from(aggregated.values()).reduce(
      (sum, { value }) => sum + value,
      0
    );

    const breakdownRows = Array.from(aggregated.entries())
      .map(([displayLabel, { value }]) => ({
        label: displayLabel,
        value,
        percent: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return (
      <div
        role="tooltip"
        className="min-w-32 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl dark:border-border-night/50 dark:bg-background-night"
      >
        <div className="mb-2 flex items-center gap-2">
          <LegendDot className={colorClassName} />
          <Label>{toolName}</Label>
          <span className="ml-1 text-muted-foreground dark:text-muted-foreground-night">
            ({data.percent}%)
          </span>
        </div>
        <div className="space-y-1.5">
          {breakdownRows.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-muted-foreground dark:text-muted-foreground-night">
                {b.label}
              </span>
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground dark:text-foreground-night">
                {b.value}
              </span>
              <span className="text-muted-foreground dark:text-muted-foreground-night">
                ({b.percent}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      role="tooltip"
      className="min-w-32 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl dark:border-border-night/50 dark:bg-background-night"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <LegendDot className={colorClassName} />
        <Label>{toolName}</Label>
        <span className="ml-1 text-muted-foreground dark:text-muted-foreground-night">
          ({data.percent}%)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          {toolName}
        </span>
        <span className="ml-auto font-mono font-medium tabular-nums text-foreground dark:text-foreground-night">
          {data.count}
        </span>
      </div>
    </div>
  );
}

interface FeedbackDistributionData {
  timestamp: number;
  date: string;
  positive: number;
  negative: number;
}

function isFeedbackDistributionData(
  data: unknown
): data is FeedbackDistributionData {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const d = data as Record<string, unknown>;

  return (
    typeof d.timestamp === "number" &&
    typeof d.date === "string" &&
    typeof d.positive === "number" &&
    typeof d.negative === "number"
  );
}

export function FeedbackDistributionTooltip(
  props: TooltipContentProps<number, string>
) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first?.payload || !isFeedbackDistributionData(first.payload)) {
    return null;
  }
  const row = first.payload;

  return (
    <ChartTooltipCard
      title={row.date}
      rows={FEEDBACK_DISTRIBUTION_LEGEND.map(({ key, label: itemLabel }) => ({
        label: itemLabel,
        value: row[key],
        colorClassName: FEEDBACK_DISTRIBUTION_PALETTE[key],
      }))}
    />
  );
}
