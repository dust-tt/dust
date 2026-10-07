import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { ConsumptionBreakdownDimension } from "@app/lib/api/analytics/consumption/timeseries";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

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
  "trigger",
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
    "trigger",
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
  label: MessageDescriptor;
  hasAvatar: boolean;
  countLabel: MessageDescriptor;
  avgLabel: MessageDescriptor;
}

export const MESSAGE_COUNT_LABEL = msg`Messages`;
const INVOCATION_COUNT_LABEL = msg`Invocations`;
const MESSAGE_AVG_LABEL = msg`Credits / message`;
const INVOCATION_AVG_LABEL = msg`Credits / invocation`;

export const CONSUMPTION_DIMENSION_CONFIG: Record<
  ConsumptionDimension,
  ConsumptionDimensionConfig
> = {
  agent: {
    label: msg`Agents`,
    hasAvatar: true,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  user: {
    label: msg`Members`,
    hasAvatar: true,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  group: {
    label: msg`Groups`,
    hasAvatar: false,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  model: {
    label: msg`Models`,
    hasAvatar: true,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  tool: {
    label: msg`Tools`,
    hasAvatar: true,
    countLabel: INVOCATION_COUNT_LABEL,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  skill: {
    label: msg`Skills`,
    hasAvatar: true,
    countLabel: INVOCATION_COUNT_LABEL,
    avgLabel: INVOCATION_AVG_LABEL,
  },
  source: {
    label: msg`Sources`,
    hasAvatar: false,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  trigger: {
    label: msg`Triggers`,
    hasAvatar: false,
    countLabel: MESSAGE_COUNT_LABEL,
    avgLabel: MESSAGE_AVG_LABEL,
  },
  api_key: {
    label: msg`API keys`,
    hasAvatar: false,
    countLabel: MESSAGE_COUNT_LABEL,
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
): MessageDescriptor {
  return dimension === "conversation"
    ? msg`Conversations`
    : CONSUMPTION_DIMENSION_CONFIG[dimension].label;
}

export function consumptionDimensionFromQueryParam(
  value: string | undefined
): ConsumptionDimension {
  return value !== undefined && isConsumptionDimension(value)
    ? value
    : DEFAULT_CONSUMPTION_DIMENSION;
}
