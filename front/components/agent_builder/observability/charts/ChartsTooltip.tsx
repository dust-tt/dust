import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import type { ToolChartModeType } from "@app/components/agent_builder/observability/types";
import { getToolColor } from "@app/components/agent_builder/observability/utils";

export interface ToolUsageTooltipProps
  extends TooltipContentProps<number, string> {
  mode: ToolChartModeType;
  topTools: string[];
}

export function ChartsTooltip({
  active,
  payload,
  label,
  mode,
  topTools,
}: ToolUsageTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((p) => ({
      label: p.name || "",
      value: `${p.value}%`,
      colorClassName: getToolColor(p.name, topTools),
    }));

  const title = mode === "step" ? `Step ${String(label)}` : String(label);
  return <ChartTooltipCard title={title} rows={rows} />;
}

interface FeedbackDistributionData {
  timestamp: number;
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
  const date = new Date(row.timestamp);
  const title = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <ChartTooltipCard
      title={title}
      rows={FEEDBACK_DISTRIBUTION_LEGEND.map(({ key, label: itemLabel }) => ({
        label: itemLabel,
        value: row[key],
        colorClassName: FEEDBACK_DISTRIBUTION_PALETTE[key],
      }))}
    />
  );
}
