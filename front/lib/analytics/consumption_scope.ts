export type ConsumptionAnalyticsScope =
  | { kind: "workspace" }
  | { kind: "personal" }
  | { kind: "agent"; agentId: string };

export const WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE = {
  kind: "workspace",
} as const satisfies ConsumptionAnalyticsScope;

export const PERSONAL_CONSUMPTION_ANALYTICS_SCOPE = {
  kind: "personal",
} as const satisfies ConsumptionAnalyticsScope;
