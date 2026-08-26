import {
  FEEDBACK_DISTRIBUTION_LEGEND,
  FEEDBACK_DISTRIBUTION_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

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

  return (
    "timestamp" in data &&
    typeof data.timestamp === "number" &&
    "date" in data &&
    typeof data.date === "string" &&
    "positive" in data &&
    typeof data.positive === "number" &&
    "negative" in data &&
    typeof data.negative === "number"
  );
}

export function FeedbackDistributionTooltip(
  props: TooltipContentProps<number, string> & {
    activeKey?: string;
    selectedKey?: string;
  }
) {
  const { active, payload, activeKey, selectedKey } = props;
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
      rows={FEEDBACK_DISTRIBUTION_LEGEND.map(({ key, label }) => ({
        key,
        label,
        value: row[key],
        colorClassName: FEEDBACK_DISTRIBUTION_PALETTE[key],
      }))}
      activeKey={activeKey}
      selectedKey={selectedKey}
    />
  );
}
