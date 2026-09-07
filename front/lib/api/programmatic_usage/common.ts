import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import { isFreeOrigin } from "@app/lib/credits/agent_message_billing";
import {
  USAGE_TYPE_FREE,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import type { UsageType } from "@app/lib/metronome/types";
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
      messageAuthMethod === "system_api_key" &&
      PROGRAMMATIC_FALLBACK_ORIGINS.has(userMessageOrigin))
  );
}

export function getUsageType(
  isProgrammaticUsage: boolean,
  origin: UserMessageOrigin
): UsageType {
  if (isFreeOrigin(origin)) {
    return USAGE_TYPE_FREE;
  }
  return isProgrammaticUsage ? USAGE_TYPE_PROGRAMMATIC : USAGE_TYPE_USER;
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
 * context origin, or a listed programmatic origin. Single source of truth for
 * splitting analytics docs into programmatic vs user.
 */
export function getProgrammaticUsageFilterClause(): estypes.QueryDslQueryContainer {
  return {
    bool: {
      should: [
        { term: { auth_method: "api_key" } },
        { bool: { must_not: { exists: { field: "context_origin" } } } },
        { terms: { context_origin: PROGRAMMATIC_USAGE_ORIGINS } },
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
 * - Programmatic origins (api, zapier, make, slack, etc.)
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
