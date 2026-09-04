import { makeApiKeySpendLimitAwuCreditsRateLimitKey } from "@app/lib/api/assistant/rate_limits";
import { getEsConsumedAwuCreditsForApiKey } from "@app/lib/api/credits/members_usage";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { KeyResource } from "@app/lib/resources/key_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  readFixedWindowCountWithLazySeed,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  ApiKeySpendLimit,
  GetApiKeySpendLimitResponse,
  SetApiKeySpendLimitResponse,
} from "@app/types/api/keys/spend_limit";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS = 1;
export const MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

type ApiKeySpendLimitErrorType =
  | "key_not_found"
  | "system_key"
  | "workspace_not_credit_priced"
  | "workspace_not_metronome_billed"
  | "metronome_error";

class ApiKeySpendLimitError extends Error {
  constructor(
    readonly type: ApiKeySpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

export async function getApiKeySpendLimit(
  auth: Authenticator,
  { keyModelId }: { keyModelId: number }
): Promise<Result<GetApiKeySpendLimitResponse, ApiKeySpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace,
    id: keyModelId,
  });
  if (!key) {
    return new Err(
      new ApiKeySpendLimitError(
        "key_not_found",
        "Could not find the API key in this workspace."
      )
    );
  }

  if (key.monthlyCapAwuCredits === null) {
    return new Ok({ kind: "unlimited" });
  }
  return new Ok({ kind: "limited", awuCredits: key.monthlyCapAwuCredits });
}

/**
 * Set (or clear) the per-API-key credit spend limit on a credit-priced plan.
 *
 * The cap on the key is the source of truth; the Metronome alert is derived
 * enforcement (a failed sync can be retried and re-derives from this value).
 * After syncing the alert, reconcile the key's credit state from live usage so
 * raising/clearing the cap un-caps the key immediately (rather than waiting for
 * the alert webhook).
 *
 * Audit logging is left to the handler (it already emits `api_key.updated`).
 */
export async function setApiKeySpendLimit(
  auth: Authenticator,
  { keyModelId, limit }: { keyModelId: number; limit: ApiKeySpendLimit }
): Promise<Result<SetApiKeySpendLimitResponse, ApiKeySpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;
  if (!plan || !isCreditPricedPlan(plan)) {
    return new Err(
      new ApiKeySpendLimitError(
        "workspace_not_credit_priced",
        "Per-key credit spend limits are only available on credit-priced plans."
      )
    );
  }

  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err(
      new ApiKeySpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace,
    id: keyModelId,
  });
  if (!key) {
    return new Err(
      new ApiKeySpendLimitError(
        "key_not_found",
        "Could not find the API key in this workspace."
      )
    );
  }
  if (key.isSystem) {
    return new Err(
      new ApiKeySpendLimitError(
        "system_key",
        "System keys cannot have a spend limit."
      )
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      keyName: key.name,
      kind: limit.kind,
      awuCredits: limit.kind === "limited" ? limit.awuCredits : null,
    },
    "[Metronome ApiKeyCap] set: starting per-API-key spend limit update"
  );

  // The per-key cap on the key is the source of truth; enforcement reads it
  // from the Redis rate-limiter counter at message-send time.
  await key.updateMonthlyCapAwuCredits(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  return new Ok({ limit });
}

/**
 * Reads the per-API-key spend-cap counter, lazily seeding it from Elasticsearch
 * whenever it reads as 0 — a brand-new cycle (ES ≈ 0, a harmless no-op), the
 * flag just enabled mid-cycle, or the key evicted under Redis memory pressure.
 * ES is scoped to the current cycle and summed by `api_key_name`, so the seeded
 * value is the correct cycle-to-date total in every case. A non-zero count is
 * already live and used as-is with no ES read. Mirrors the per-user lazy seed
 * in `lib/api/users/spend_limit.ts`.
 *
 * Returns the effective count, or `null` on a Redis read error (caller fails
 * open). A seed write failure degrades to the ES value rather than throwing.
 */
async function readApiKeySpendLimitCountWithLazySeed(
  auth: Authenticator,
  {
    keyModelId,
    redisKey,
    bounds,
  }: { keyModelId: number; redisKey: string; bounds: FixedWindowBounds }
): Promise<number | null> {
  return readFixedWindowCountWithLazySeed({
    key: redisKey,
    bounds,
    logger,
    // The ES query is keyed by the api-key name; resolve it here (only invoked
    // on a seed miss, so no per-record fetch). The counter stores microCredits;
    // convert the ES credit value. Preserve the null contract (ES read failed
    // or key gone → skip seed, do not seed as 0).
    fetchSeedValue: async () => {
      const key = await KeyResource.fetchByWorkspaceAndId({
        workspace: auth.getNonNullableWorkspace(),
        id: keyModelId,
      });
      if (!key) {
        return null;
      }
      const consumedAwuCredits = await getEsConsumedAwuCreditsForApiKey(auth, {
        apiKeyName: key.name,
      });
      return consumedAwuCredits === null
        ? null
        : roundCreditsToMicroCredits(consumedAwuCredits);
    },
  });
}

/**
 * Synchronous, Metronome-independent enforcement of the per-API-key spend cap,
 * read at message-send time from the Redis fixed-window counter over the current
 * contract billing cycle. The threshold is the key's admin-configured
 * `monthlyCapAwuCredits`. Runs alongside the Metronome per-key cap
 * (`isApiKeyCappedByMetronome`) as a faster, independent backup. Returns `false` (does not
 * block) when the key is gone, has no cap, the billing period can't be resolved,
 * or on a Redis read error (fail-open).
 */
export async function isApiKeySpendLimitRateCapReached(
  auth: Authenticator,
  { keyModelId }: { keyModelId: number }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();

  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace,
    id: keyModelId,
  });
  if (!key || key.monthlyCapAwuCredits === null) {
    return false;
  }
  const threshold = key.monthlyCapAwuCredits;

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readApiKeySpendLimitCountWithLazySeed(auth, {
    keyModelId: key.id,
    redisKey: makeApiKeySpendLimitAwuCreditsRateLimitKey(key.id),
    bounds,
  });
  if (count === null) {
    logger.error(
      { workspaceId: workspace.sId, keyName: key.name },
      "[ApiKeySpendLimitRateCap] Failed to read fixed-window count; allowing message"
    );
    return false;
  }

  // The counter stores microCredits; scale the credit threshold up so the
  // comparison stays integer-on-integer.
  return count >= roundCreditsToMicroCredits(threshold);
}

/**
 * Adds `incrementBy` AWU credits to the per-API-key fixed-window spend-cap
 * counter for the current contract billing cycle. Records for every key (the
 * cap is resolved at enforcement/read time, not here). `incrementBy` is the
 * newly-accrued delta for a message (the caller diffs against the previously
 * recorded amount so repeated finalizes don't over-count). No-op when the
 * billing period can't be resolved.
 */
export async function recordApiKeySpendLimitUsage(
  auth: Authenticator,
  { keyModelId, incrementBy }: { keyModelId: number; incrementBy: number }
): Promise<void> {
  // Credits may be fractional; the counter stores microCredits (integer
  // INCRBY), so convert before recording. A non-positive or non-finite delta is
  // a normal no-op (e.g. a retry with no new usage) and stays silent.
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  const redisKey = makeApiKeySpendLimitAwuCreditsRateLimitKey(keyModelId);

  // Seed from ES on the counter's first touch of the cycle (SET-if-absent), so
  // it reflects cycle-to-date consumption even when the enforcement reader
  // never runs for this key (e.g. a key with no cap set). No-ops once live.
  await readApiKeySpendLimitCountWithLazySeed(auth, {
    keyModelId,
    redisKey,
    bounds,
  });

  const incrementByMicroCredits = roundCreditsToMicroCredits(incrementBy);

  await addFixedWindowCount({
    key: redisKey,
    bounds,
    incrementBy: incrementByMicroCredits,
    logger,
  });
}
