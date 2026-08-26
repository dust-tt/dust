import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
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

export type ConsumptionAttributionDimension =
  | ConsumptionDimension
  | "conversation";

export const CONSUMPTION_ATTRIBUTION_DIMENSIONS: ConsumptionAttributionDimension[] =
  [
    "agent",
    "user",
    "group",
    "model",
    "tool",
    "skill",
    "source",
    "api_key",
    "conversation",
  ];

const PERSONAL_CONSUMPTION_ATTRIBUTION_DIMENSIONS =
  CONSUMPTION_ATTRIBUTION_DIMENSIONS.filter(
    (dimension) => dimension !== "user" && dimension !== "group"
  );

const AGENT_CONSUMPTION_ATTRIBUTION_DIMENSIONS = CONSUMPTION_DIMENSIONS.filter(
  (dimension) => dimension !== "agent"
);

export function getConsumptionAttributionDimensions(
  analyticsScope: ConsumptionAnalyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE
): readonly ConsumptionAttributionDimension[] {
  switch (analyticsScope.kind) {
    case "personal":
      return PERSONAL_CONSUMPTION_ATTRIBUTION_DIMENSIONS;
    case "agent":
      return AGENT_CONSUMPTION_ATTRIBUTION_DIMENSIONS;
    case "workspace":
      return CONSUMPTION_DIMENSIONS;
  }
}

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
};

export function isConsumptionDimension(
  value: string
): value is ConsumptionDimension {
  return CONSUMPTION_DIMENSIONS.some((dimension) => dimension === value);
}

export function isConsumptionAttributionDimension(
  value: string
): value is ConsumptionAttributionDimension {
  return value === "conversation" || isConsumptionDimension(value);
}

export function consumptionAttributionDimensionLabel(
  dimension: ConsumptionAttributionDimension
): string {
  return dimension === "conversation"
    ? "Conversations"
    : CONSUMPTION_DIMENSION_CONFIG[dimension].label;
}

export function consumptionDimensionFromQueryParam(
  value: string | undefined
): ConsumptionDimension {
  return value !== undefined && isConsumptionDimension(value)
    ? value
    : DEFAULT_CONSUMPTION_DIMENSION;
}
