import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Classification of user message origins into "programmatic" or "user" categories.
 * Used to determine whether token usage costs should be tracked for billing.
 */
export const USAGE_ORIGINS_CLASSIFICATION: Record<
  UserMessageOrigin,
  "programmatic" | "user"
> = {
  api: "programmatic",
  cli: "user",
  cli_programmatic: "programmatic",
  email: "user",
  excel: "programmatic",
  extension: "user",
  gsheet: "programmatic",
  make: "programmatic",
  n8n: "programmatic",
  powerpoint: "programmatic",
  raycast: "user",
  slack: "user",
  slack_workflow: "programmatic",
  teams: "user",
  transcript: "user",
  triggered_programmatic: "programmatic",
  triggered: "user",
  web: "user",
  zapier: "programmatic",
  zendesk: "user",
  onboarding_conversation: "user",
  agent_copilot: "user",
  project_butler: "user",
  project_kickoff: "user",
};

export const USER_USAGE_ORIGINS = Object.keys(
  USAGE_ORIGINS_CLASSIFICATION
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin as UserMessageOrigin] === "user"
);

const PROGRAMMATIC_USAGE_ORIGINS = Object.keys(
  USAGE_ORIGINS_CLASSIFICATION
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin as UserMessageOrigin] === "programmatic"
);

// Markup multiplier to convert raw ES costs to costs with Dust markup.
export const MARKUP_MULTIPLIER = 1 + DUST_MARKUP_PERCENT / 100;

/**
 * Calculate seconds until midnight UTC.
 * Used to set TTL on Redis keys so they expire at 00:00 UTC.
 */
export function getSecondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

/**
 * ES aggregation type for cost queries.
 */
export type UsageAggregations = {
  total_cost?: estypes.AggregationsSumAggregate;
};

/**
 * Build ES filter for programmatic usage tracking.
 * Matches messages that should be tracked for billing:
 * - API key requests (except Zendesk)
 * - Unspecified context origins
 * - Programmatic origins (api, zapier, make, slack, etc.)
 */
export function getShouldTrackTokenUsageCostsESFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const workspace = auth.getNonNullableWorkspace();

  // Track for API keys, listed programmatic origins or unspecified user message origins.
  const shouldClauses: estypes.QueryDslQueryContainer[] = [
    {
      bool: {
        must: [{ term: { auth_method: "api_key" } }],
        must_not: [{ term: { context_origin: "zendesk" } }],
      },
    },
    { bool: { must_not: { exists: { field: "context_origin" } } } },
    { terms: { context_origin: PROGRAMMATIC_USAGE_ORIGINS } },
  ];

  return {
    bool: {
      filter: [
        { term: { workspace_id: workspace.sId } },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
        {
          bool: {
            should: shouldClauses,
            minimum_should_match: 1,
          },
        },
      ],
    },
  };
}
