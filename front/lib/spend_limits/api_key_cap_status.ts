import { makeApiKeySpendLimitAwuCreditsRateLimitKey } from "@app/lib/api/assistant/rate_limits";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getFixedWindowCount } from "@app/lib/utils/rate_limiter";
import type { ApiKeyCreditState } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";

// The minimal key shape the verdict needs — kept structural (not `KeyResource`)
// so this module has no dependency back on the resource.
export type ApiKeySpendCapStatusInput = {
  id: ModelId;
  monthlyCapAwuCredits: number | null;
  creditState: ApiKeyCreditState;
};

/**
 * The flag-aware per-key "capped" verdict for each of `keys`, keyed by key model
 * id — the signal the keys UI uses to show the "capped" status. Mirrors the
 * enforcement switch in `isApiKeyBlocked` (lib/api/credits/access_control.ts):
 * with the `enforce_user_spend_limit_rate_cap` flag on, the persisted Metronome
 * `creditState` must not be read — the per-key Redis fixed-window counter
 * (compared to the key's cap) is authoritative; with it off, from
 * `creditState === "capped"`. Fails open (not capped) when the flag is on but
 * the billing cycle can't be resolved or a counter read errors.
 */
export async function getApiKeysSpendCappedByModelId(
  auth: Authenticator,
  keys: ApiKeySpendCapStatusInput[]
): Promise<Map<ModelId, boolean>> {
  const featureFlags = await auth.getFeatureFlags();
  const spendCapEnabled = featureFlags.includes(
    "enforce_user_spend_limit_rate_cap"
  );
  if (!spendCapEnabled) {
    return new Map(keys.map((key) => [key.id, key.creditState === "capped"]));
  }

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
