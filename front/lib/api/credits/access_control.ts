// Flag-aware access-control readers.
//
// Each reader switches on the `enforce_user_spend_limit_rate_cap` feature flag:
// when enabled it enforces from the Redis fixed-window rate-limiter counters,
// when disabled it falls back to the Metronome credit state in
// `lib/metronome/user_block.ts`. Usage is recorded into the counters regardless
// (in credit_cost), so the flag only controls which signal blocks.
//
// Callers doing access-control decisions should import from here. The low-level
// Redis cache getters/setters and the fine-grained status reads still live in
// `lib/metronome/user_block.ts`.
import {
  isProgrammaticSpendLimitRateCapReached,
  isProgrammaticSpendLimitRateWarningReached,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { isApiKeySpendLimitRateCapReached } from "@app/lib/api/keys/spend_limit";
import {
  isUserSpendLimitRateCapReached,
  isUserSpendLimitRateWarningReached,
} from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isApiKeyCappedByMetronome } from "@app/lib/metronome/api_key_block";
import type { UserBlockedReason } from "@app/lib/metronome/user_block";
import {
  isApiBlockedByMetronome,
  isProgrammaticApiBlockedByMetronome,
  isUserAwuWarnedByMetronome,
  isUserBlockedByMetronome,
  isWorkspaceProgrammaticWarningReachedByMetronome,
} from "@app/lib/metronome/user_block";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";

async function spendLimitRateCapEnabled(auth: Authenticator): Promise<boolean> {
  const featureFlags = await getFeatureFlags(auth);
  return featureFlags.includes("enforce_user_spend_limit_rate_cap");
}

/**
 * Whether the workspace credit pool is depleted (API calls with no per-user
 * cap). Pool depletion is a credit-balance signal with no rate-limiter
 * dimension, so this always reads the Metronome pool state; it lives here only
 * so access-control callers have a single, `auth`-based import site.
 */
export async function isApiBlocked(auth: Authenticator): Promise<boolean> {
  return isApiBlockedByMetronome(auth.getNonNullableWorkspace().sId);
}

/**
 * Whether the user is blocked from sending billable messages, and why. With the
 * rate-cap flag on, the per-user cap comes from the Redis fixed-window counter;
 * the pool part (no_seat, pool depletion, personal-seat carve-out) always comes
 * from the Metronome pool state. With the flag off, both come from Metronome.
 */
export async function isUserBlocked(
  auth: Authenticator,
  user: UserResource
): Promise<UserBlockedReason | null> {
  const workspace = auth.getNonNullableWorkspace();
  if (!(await spendLimitRateCapEnabled(auth))) {
    return isUserBlockedByMetronome(workspace, user);
  }
  const userCapBlockedOverride = await isUserSpendLimitRateCapReached(auth, {
    user,
  });
  return isUserBlockedByMetronome(workspace, user, { userCapBlockedOverride });
}

/**
 * Whether the workspace programmatic monthly cap is reached. With the rate-cap
 * flag on, from the Redis fixed-window counter; with it off, from the
 * Metronome-driven programmatic credit state.
 */
export async function isProgrammaticApiBlocked(
  auth: Authenticator
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  if (!(await spendLimitRateCapEnabled(auth))) {
    return isProgrammaticApiBlockedByMetronome(workspace.sId);
  }
  return isProgrammaticSpendLimitRateCapReached(auth);
}

/**
 * Whether the API key has reached its per-key credit spend cap. With the
 * rate-cap flag on, from the Redis fixed-window counter; with it off, from the
 * Metronome-driven per-key credit state.
 */
export async function isApiKeyBlocked(
  auth: Authenticator,
  { keyModelId }: { keyModelId: ModelId }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  if (!(await spendLimitRateCapEnabled(auth))) {
    return isApiKeyCappedByMetronome(workspace.sId, keyModelId);
  }
  return isApiKeySpendLimitRateCapReached(auth, { keyModelId });
}

/**
 * Whether the user has consumed ≥ 80% of their per-user cap (soft warning). With
 * the rate-cap flag on, from the Redis fixed-window counter; with it off, from
 * the Metronome-driven near-limit flag. Free/none seats have no cycle cap for
 * the counter to model, so they always fall back to the Metronome near-limit
 * flag (driven by their lifetime credit-balance alert).
 */
export async function isUserAwuWarned(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  if (await spendLimitRateCapEnabled(auth)) {
    const rateWarned = await isUserSpendLimitRateWarningReached(auth, { user });
    if (rateWarned !== null) {
      return rateWarned;
    }
  }
  return isUserAwuWarnedByMetronome(workspace.sId, user.sId);
}

/**
 * Whether workspace programmatic usage has crossed 80% of the monthly cap (soft
 * warning). With the rate-cap flag on, from the Redis fixed-window counter; with
 * it off, from the Metronome-driven programmatic warning flag.
 */
export async function isWorkspaceProgrammaticWarningReached(
  auth: Authenticator
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  if (!(await spendLimitRateCapEnabled(auth))) {
    return isWorkspaceProgrammaticWarningReachedByMetronome(workspace.sId);
  }
  return isProgrammaticSpendLimitRateWarningReached(auth);
}
