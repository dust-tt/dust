import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { normalizeVersionLabel } from "@app/components/agent_builder/observability/shared/tooltipHelpers";
import type { ToolChartModeType } from "@app/components/agent_builder/observability/types";
import { isToolChartUsagePayload } from "@app/components/agent_builder/observability/types";
import { getIndexedColor } from "@app/components/agent_builder/observability/utils";

export interface ToolUsageTooltipProps
  extends TooltipContentProps<number, string> {
  mode: ToolChartModeType;
  topTools: string[];
  hoveredTool?: string | null;
}

export function ChartsTooltip({
  active,
  payload,
  label,
  mode,
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
  const filtered = hoveredTool
    ? typed.filter((p) => p.name === hoveredTool)
    : typed;
  const rows = filtered
    .flatMap((p) => {
      const toolName = p.name ?? "";
      const data = p.payload?.values?.[toolName];
      if (!data || (data.count ?? 0) <= 0) {
        return [];
      }

      const colorClassName = getIndexedColor(toolName, topTools);

      // If this tool segment represents an MCP server, show its view-level
      // breakdown instead of a single aggregated row.
      if (data.breakdown && data.breakdown.length > 0) {
        return data.breakdown.map((b) => ({
          label: b.label,
          value: b.count,
          percent: b.percent,
          colorClassName,
        }));
      }

      return [
        {
          label: toolName,
          value: data.count,
          percent: data.percent,
          colorClassName,
        },
      ];
    })
    .sort((a, b) => (b.value as number) - (a.value as number));

  if (rows.length === 0) {
    return null;
  }

  const title =
    mode === "step"
      ? `Step ${String(label)}`
      : normalizeVersionLabel(String(label));
  return <ChartTooltipCard title={title} rows={rows} />;
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
