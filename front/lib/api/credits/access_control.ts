// Access-control readers for spend enforcement.
//
// Per-user, per-API-key and programmatic caps are enforced from the Redis
// fixed-window rate-limiter counters (usage is recorded into them in
// credit_cost). Pool depletion, no_seat and the personal-seat carve-out have no
// rate-limiter dimension and always come from the Metronome pool state in
// `lib/metronome/user_block.ts`.
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
import type { UserBlockedReason } from "@app/lib/metronome/user_block";
import {
  isApiBlockedByMetronome,
  isUserBlockedByMetronome,
} from "@app/lib/metronome/user_block";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";

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
 * Whether the user is blocked from sending billable messages, and why. The
 * per-user cap comes from the Redis fixed-window counter; the pool part
 * (no_seat, pool depletion, personal-seat carve-out) comes from the Metronome
 * pool state.
 */
export async function isUserBlocked(
  auth: Authenticator,
  user: UserResource
): Promise<UserBlockedReason | null> {
  const workspace = auth.getNonNullableWorkspace();
  const userCapBlocked = await isUserSpendLimitRateCapReached(auth, {
    user,
  });
  return isUserBlockedByMetronome(workspace, user, { userCapBlocked });
}

/**
 * Whether the workspace programmatic monthly cap is reached, from the Redis
 * fixed-window counter.
 */
export async function isProgrammaticApiBlocked(
  auth: Authenticator
): Promise<boolean> {
  return isProgrammaticSpendLimitRateCapReached(auth);
}

/**
 * Whether the API key has reached its per-key credit spend cap, from the Redis
 * fixed-window counter.
 */
export async function isApiKeyBlocked(
  auth: Authenticator,
  { keyModelId }: { keyModelId: ModelId }
): Promise<boolean> {
  return isApiKeySpendLimitRateCapReached(auth, { keyModelId });
}

/**
 * Whether the user has consumed ≥ 80% of their per-user cap (soft warning), from
 * the Redis fixed-window counters (per-cycle cap for pool seats, lifetime
 * allowance for free seats).
 */
export async function isUserAwuWarned(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  return isUserSpendLimitRateWarningReached(auth, { user });
}

/**
 * Whether workspace programmatic usage has crossed 80% of the monthly cap (soft
 * warning), from the Redis fixed-window counter.
 */
export async function isWorkspaceProgrammaticWarningReached(
  auth: Authenticator
): Promise<boolean> {
  return isProgrammaticSpendLimitRateWarningReached(auth);
}
