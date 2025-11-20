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

  const typed = payload.filter(isToolChartUsagePayload);
  const rows = typed
    .filter((p) => (p.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .map((p) => {
      const toolName = p.name ?? "";
      const percent = p.payload?.values?.[toolName]?.percent ?? 0;
      const count = p.payload?.values?.[toolName]?.count ?? 0;
      return {
        label: toolName,
        value: count,
        percent,
        colorClassName: getIndexedColor(toolName, topTools),
      };
    });

  const title =
    mode === "step"
      ? `Step ${String(label)}`
      : normalizeVersionLabel(String(label));
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
