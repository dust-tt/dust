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
  wakeup: "user",
  web: "user",
  zapier: "programmatic",
  zendesk: "user",
  onboarding_conversation: "user",
  agent_sidekick: "user",
  project_kickoff: "user",
  reinforced_skill_notification: "user",
  reinforcement: "programmatic",
  system_activation: "user",
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

const PROGRAMMATIC_FALLBACK_ORIGINS: ReadonlySet<UserMessageOrigin> =
  new Set<UserMessageOrigin>(["slack"]);

// The connector's auth method (e.g. Slack) when it posts a message on behalf
// of a workspace member it couldn't attribute to a real Dust user.
const SYSTEM_API_KEY_AUTH_METHOD = "system_api_key";

export function isProgrammaticUsageFromContext({
  authMethod,
  userMessageOrigin,
  userId,
  messageAuthMethod,
}: {
  // Persisted historical values predate the AuthMethodType union, so keep the input broad and
  // reproduce the live rule by recognizing the one auth method that changes classification.
  authMethod: string | null;
  userMessageOrigin: UserMessageOrigin;
  // The triggering user message's own resolved user and auth method, when known. Used to fall
  // back to programmatic for messages (e.g. Slack) that couldn't be attributed to a workspace
  // member. Omit when this information isn't available (the fallback is then simply skipped —
  // it never downgrades usage to user, only ever promotes an unattributed one to programmatic).
  userId?: string | null;
  messageAuthMethod?: string | null;
}): boolean {
  return (
    authMethod === "api_key" ||
    USAGE_ORIGINS_CLASSIFICATION[userMessageOrigin] === "programmatic" ||
    (userId === null &&
      messageAuthMethod === SYSTEM_API_KEY_AUTH_METHOD &&
      PROGRAMMATIC_FALLBACK_ORIGINS.has(userMessageOrigin))
  );
}

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
 * Query-side mirror of isProgrammaticUsage: API-key requests, messages with no
 * context origin, a listed programmatic origin, or an unattributed message on
 * a fallback origin (e.g. Slack) — same rule as isProgrammaticUsageFromContext,
 * replicated over the fields already stored on each indexed document
 * (`user_id` is indexed as the literal string "unknown" when unattributed, see
 * temporal/analytics_queue/activities/agent_analytics.ts). Single source of
 * truth for splitting analytics docs into programmatic vs user.
 */
export function getProgrammaticUsageFilterClause(): estypes.QueryDslQueryContainer {
  return {
    bool: {
      should: [
        { term: { auth_method: "api_key" } },
        { bool: { must_not: { exists: { field: "context_origin" } } } },
        { terms: { context_origin: PROGRAMMATIC_USAGE_ORIGINS } },
        {
          bool: {
            must: [
              {
                terms: {
                  context_origin: [...PROGRAMMATIC_FALLBACK_ORIGINS],
                },
              },
              { term: { auth_method: SYSTEM_API_KEY_AUTH_METHOD } },
              { term: { user_id: "unknown" } },
            ],
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

/**
 * Build ES filter for programmatic usage tracking.
 * Matches messages that should be tracked for billing:
 * - API key requests
 * - Unspecified context origins
 * - Programmatic origins (api, zapier, make, etc.)
 * - Unattributed messages on a fallback origin (e.g. Slack)
 */
export function getShouldTrackTokenUsageCostsESFilter(
  auth: Authenticator
): estypes.QueryDslQueryContainer {
  const workspace = auth.getNonNullableWorkspace();

  return {
    bool: {
      filter: [
        { term: { workspace_id: workspace.sId } },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
        getProgrammaticUsageFilterClause(),
      ],
    },
  };
}
