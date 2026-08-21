import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { isConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import type { ConsumptionBreakdownDimension } from "@app/lib/api/analytics/consumption/timeseries";

export type ConsumptionDimension = ConsumptionBreakdownDimension;

export const DEFAULT_CONSUMPTION_DIMENSION: ConsumptionDimension = "agent";

// Tab order, left to right.
export const CONSUMPTION_DIMENSIONS: ConsumptionDimension[] = [
  "agent",
  "user",
  "group",
  "model",
  "tool",
  "skill",
  "source",
  "api_key",
];

interface ConsumptionDimensionConfig {
  label: string;
  breakdownLabel: string;
  hasAvatar: boolean;
  avgLabel: string;
}

const MESSAGE_AVG_LABEL = "Credits / message";
const INVOCATION_AVG_LABEL = "Credits / invocation";

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
  group: {
    label: "Groups",
    breakdownLabel: "group",
    hasAvatar: false,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  model: {
    label: "Models",
    breakdownLabel: "model",
    hasAvatar: true,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  tool: {
    label: "Tools",
    breakdownLabel: "tool",
    hasAvatar: true,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  skill: {
    label: "Skills",
    breakdownLabel: "skill",
    hasAvatar: true,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  source: {
    label: "Sources",
    breakdownLabel: "source",
    hasAvatar: false,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  api_key: {
    label: "API keys",
    breakdownLabel: "API key",
    hasAvatar: false,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  automation: {
    label: "Automations",
    breakdownLabel: "automation",
    hasAvatar: false,
    avgLabel: "Est. credits / run",
  },
};

export function isConsumptionDimension(
  value: string,
  dimensions: readonly ConsumptionDimension[] = CONSUMPTION_DIMENSIONS
): value is ConsumptionDimension {
  return dimensions.some((dimension) => dimension === value);
}

export function isFilterableConsumptionDimension(
  dimension: ConsumptionDimension
): dimension is ConsumptionScopeDimension {
  return isConsumptionScopeDimension(dimension);
}

export function consumptionDimensionFromQueryParam(
  value: string | undefined,
  dimensions: readonly ConsumptionDimension[] = CONSUMPTION_DIMENSIONS
): ConsumptionDimension {
  return value !== undefined && isConsumptionDimension(value, dimensions)
    ? value
    : DEFAULT_CONSUMPTION_DIMENSION;
}
