import type { estypes } from "@elastic/elasticsearch";

import type { Authenticator } from "@app/lib/auth";
import type { UserMessageOrigin } from "@app/types";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types";

/**
 * Classification of user message origins into "programmatic" or "user" categories.
 * Used to determine whether token usage costs should be tracked for billing.
 * NOTE: This must be kept in sync with USAGE_ORIGINS_CLASSIFICATION in programmatic_usage_tracking.ts
 */
const USAGE_ORIGINS_CLASSIFICATION: Record<
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
};

const PROGRAMMATIC_USAGE_ORIGINS = Object.keys(
  USAGE_ORIGINS_CLASSIFICATION
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin as UserMessageOrigin] === "programmatic"
);

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
