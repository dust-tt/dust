import { isFreeUsageCostLimitReachedForUser } from "@app/lib/api/assistant/rate_limits";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isFreeOrigin } from "@app/lib/metronome/events";

// Whether an LLM call is free (unbilled). Two cases:
//   - Utility operations (title/skill suggestions, etc.) — anything other than
//     the agent conversation itself. They carry no userMessageOrigin, so they
//     are keyed off operationType.
//   - Agent conversations triggered by a free origin (e.g. sidekick).
// This is the single source of truth for classifying free usage at the LLM call
// site (used for both usage-type tagging and the free-usage cost cap).
export function isFreeUsageContext(context: LLMTraceContext): boolean {
  return (
    context.operationType !== "agent_conversation" ||
    isFreeOrigin(context.userMessageOrigin ?? null)
  );
}

// Whether a free LLM call must be blocked because the triggering user has hit
// the per-user daily free-usage cost cap. Callers check this *before* invoking
// the LLM (before getStreamLLM) and surface the block in their own error idiom.
//
// Enforcement (this gate) lives above the LLM router; the cost contribution to
// the counter lives with usage recording in the router. Only authenticated
// users on free calls are subject to the cap, and the
// `skip_free_usage_rate_limit` feature flag exempts a workspace entirely.
export async function isFreeUsageBlocked(
  auth: Authenticator,
  context: LLMTraceContext
): Promise<boolean> {
  const user = auth.user();
  if (!user || !isFreeUsageContext(context)) {
    return false;
  }

  const featureFlags = await getFeatureFlags(auth);
  if (featureFlags.includes("skip_free_usage_rate_limit")) {
    return false;
  }

  return isFreeUsageCostLimitReachedForUser(
    auth.getNonNullableWorkspace(),
    user.id
  );
}
