import type { ConsumptionBreakdownDimension } from "@app/lib/api/analytics/consumption/series";

export type ConsumptionDimension = ConsumptionBreakdownDimension;

export const DEFAULT_CONSUMPTION_DIMENSION: ConsumptionDimension = "agent";

// Tab order, left to right.
export const CONSUMPTION_DIMENSIONS: ConsumptionDimension[] = [
  "agent",
  "user",
  "model",
  "tool",
  "skill",
  "source",
];

interface ConsumptionDimensionConfig {
  // Tab label, plural.
  label: string;
  // Singular, for the chart title ("Daily credits by member").
  breakdownLabel: string;
  // Agents and members have a picture; the rest are labels only.
  hasAvatar: boolean;
  // Header of the ranking's average column. Tools and skills average over
  // invocations rather than messages: a single message can call the same tool
  // many times, so a per-message figure would say nothing about the tool itself.
  avgLabel: string;
}

const MESSAGE_AVG_LABEL = "Cost / message";
const INVOCATION_AVG_LABEL = "Cost / invocation";

export const CONSUMPTION_DIMENSION_CONFIG: Record<
  ConsumptionDimension,
  ConsumptionDimensionConfig
> = {
  agent: {
    label: "Agents",
    breakdownLabel: "agent",
    hasAvatar: true,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  user: {
    label: "Members",
    breakdownLabel: "member",
    hasAvatar: true,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  model: {
    label: "Models",
    breakdownLabel: "model",
    hasAvatar: false,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  tool: {
    label: "Tools",
    breakdownLabel: "tool",
    hasAvatar: false,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  skill: {
    label: "Skills",
    breakdownLabel: "skill",
    hasAvatar: false,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  source: {
    label: "Sources",
    breakdownLabel: "source",
    hasAvatar: false,
    avgLabel: MESSAGE_AVG_LABEL,
  },
};

export function isConsumptionDimension(
  value: string
): value is ConsumptionDimension {
  return CONSUMPTION_DIMENSIONS.some((dimension) => dimension === value);
}
