import { makeApiKeySpendLimitAwuCreditsRateLimitKey } from "@app/lib/api/assistant/rate_limits";
import { getEsConsumedAwuCreditsForApiKey } from "@app/lib/api/credits/members_usage";
import {
  reconcileApiKey,
  reconcileWorkspaceApiKeyCreditStates,
} from "@app/lib/api/metronome/reconcile_credit_state";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import {
  clearMetronomeApiKeyCapAlert,
  upsertMetronomeApiKeyCapAlert,
} from "@app/lib/metronome/alerts/api_key_caps";
import { KeyResource } from "@app/lib/resources/key_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { revertOnSyncFailure } from "@app/lib/spend_limits/revert_on_sync_failure";
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";

export const MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS = 1;
export const MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

// 1 AWU credit = $0.01 = 10,000 microUSD. Used to convert the legacy per-key
// USD cap to the new credit cap during backfill.
const MICRO_USD_PER_AWU_CREDIT = 10_000;

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

  // Persist the admin's intent first (source of truth), then derive the alert.
  const previousMonthlyCapAwuCredits = key.monthlyCapAwuCredits;
  await key.updateMonthlyCapAwuCredits(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  const revert = () =>
    key.updateMonthlyCapAwuCredits(previousMonthlyCapAwuCredits);

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await revertOnSyncFailure(
        await clearMetronomeApiKeyCapAlert({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          keyName: key.name,
        }),
        {
          revert,
          logContext: {
            scope: "api_key",
            operation: "clear_cap_alert",
            workspaceId: workspace.sId,
            keyName: key.name,
            previousMonthlyCapAwuCredits,
          },
        }
      );
      if (clearResult.isErr()) {
        return new Err(
          new ApiKeySpendLimitError(
            "metronome_error",
            clearResult.error.message
          )
        );
      }
      break;
    }
    case "limited": {
      const upsertResult = await revertOnSyncFailure(
        await upsertMetronomeApiKeyCapAlert({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          keyName: key.name,
          awuCredits: limit.awuCredits,
        }),
        {
          revert,
          logContext: {
            scope: "api_key",
            operation: "upsert_cap_alert",
            workspaceId: workspace.sId,
            keyName: key.name,
            awuCredits: limit.awuCredits,
            previousMonthlyCapAwuCredits,
          },
        }
      );
      if (upsertResult.isErr()) {
        return new Err(
          new ApiKeySpendLimitError(
            "metronome_error",
            upsertResult.error.message
          )
        );
      }
      break;
    }
    default:
      assertNever(limit);
  }

  // Reconcile the key's credit state from live usage so the change takes effect
  // immediately. A failure is non-fatal: the alert webhook will converge.
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    void reconcileApiKey({
      workspaceId: workspace.sId,
      metronomeCustomerId,
      metronomeContractId,
      key,
      execute: true,
    }).catch((err) => {
      logger.warn(
        { workspaceId: workspace.sId, keyName: key.name, err },
        "[Metronome ApiKeyCap] reconcileApiKey after spend-limit update failed; webhook will reconcile"
      );
    });
  }

  return new Ok({ limit });
}

/**
 * Idempotently (re)create the Metronome cap alert for every active, non-system
 * key in the workspace that has a per-key credit cap. Used by the backfill /
 * repair flow. Logs and continues on per-key failures.
 */
async function syncApiKeyCapAlertsForWorkspace(
  workspace: LightWorkspaceType
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const keys = await KeyResource.listNonSystemKeysByWorkspace(workspace);
  const cappedKeys = keys.flatMap((key) => {
    const capAwuCredits = key.monthlyCapAwuCredits;
    return key.isActive && capAwuCredits !== null
      ? [{ keyName: key.name, capAwuCredits }]
      : [];
  });

  // Metronome API calls (external service), so concurrency is fine here.
  await concurrentExecutor(
    cappedKeys,
    async ({ keyName, capAwuCredits }) => {
      const result = await upsertMetronomeApiKeyCapAlert({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        keyName,
        awuCredits: capAwuCredits,
      });
      if (result.isErr()) {
        logger.error(
          { workspaceId: workspace.sId, keyName, err: result.error },
          "[Metronome ApiKeyCap] sync: failed to upsert cap alert; continuing"
        );
      }
    },
    { concurrency: 5 }
  );
}

/**
 * One-shot backfill for a workspace adopting credit-priced per-key caps:
 * convert any legacy USD cap to the new credit cap, (re)create the Metronome
 * alerts, then reconcile each key's credit state. Idempotent.
 */
export async function backfillApiKeyCreditCapsForWorkspace(
  workspace: LightWorkspaceType,
  {
    metronomeContractId,
    planCode,
  }: { metronomeContractId: string | null; planCode: string }
): Promise<{ converted: number }> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return { converted: 0 };
  }

  const keys = await KeyResource.listNonSystemKeysByWorkspace(workspace);
  let converted = 0;
  // One UPDATE per legacy key being migrated. Bounded by the workspace's key
  // count (small) and only runs on this one-shot admin backfill, not a hot path.
  for (const key of keys) {
    if (
      key.isActive &&
      key.monthlyCapAwuCredits === null &&
      key.monthlyCapMicroUsd !== null
    ) {
      // Clamp to >= 1 so a tiny legacy cap doesn't become a 0-credit
      // (always-capped) limit.
      const credits = Math.max(
        MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS,
        Math.round(key.monthlyCapMicroUsd / MICRO_USD_PER_AWU_CREDIT)
      );
      await key.updateMonthlyCapAwuCredits(credits);
      converted += 1;
    }
  }

  await syncApiKeyCapAlertsForWorkspace(workspace);
  await reconcileWorkspaceApiKeyCreditStates({
    workspace,
    metronomeCustomerId,
    metronomeContractId,
    planCode,
  });

  return { converted };
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
