import { makeApiKeySpendLimitAwuCreditsRateLimitKey } from "@app/lib/api/assistant/rate_limits";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getFixedWindowCount } from "@app/lib/utils/rate_limiter";
import type { ModelId } from "@app/types/shared/model_id";

// The minimal key shape the verdict needs — kept structural (not `KeyResource`)
// so this module has no dependency back on the resource.
export type ApiKeySpendCapStatusInput = {
  id: ModelId;
  monthlyCapAwuCredits: number | null;
};

/**
 * The per-key "capped" verdict for each of `keys`, keyed by key model id — the
 * signal the keys UI uses to show the "capped" status. Mirrors enforcement in
 * `isApiKeyBlocked` (lib/api/credits/access_control.ts): the per-key Redis
 * fixed-window counter compared to the key's cap. Fails open (not capped) when
 * the billing cycle can't be resolved or a counter read errors.
 */
export async function getApiKeysSpendCappedByModelId(
  auth: Authenticator,
  keys: ApiKeySpendCapStatusInput[]
): Promise<Map<ModelId, boolean>> {
  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    // No resolvable billing cycle: nothing to enforce against (fail-open).
    return new Map(keys.map((key) => [key.id, false]));
  }

  // Redis reads (not database queries), one per key of the workspace.
  const entries = await concurrentExecutor(
    keys,
    async (key) => {
      const cap = key.monthlyCapAwuCredits;
      if (cap === null) {
        return [key.id, false] as const;
      }
      const result = await getFixedWindowCount({
        key: makeApiKeySpendLimitAwuCreditsRateLimitKey(key.id),
        bounds,
      });
      // Compare in microCredits to match enforcement exactly
      // (isApiKeySpendLimitRateCapReached).
      const capped =
        result.isOk() && result.value >= roundCreditsToMicroCredits(cap);
      return [key.id, capped] as const;
    },
    { concurrency: 8 }
  );
  return new Map(entries);
}
