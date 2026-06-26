import { reconcileApiKey } from "@app/lib/api/metronome/reconcile_credit_state";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeApiKeyCapAlert,
  upsertMetronomeApiKeyCapAlert,
} from "@app/lib/metronome/alerts/api_key_caps";
import { KeyResource } from "@app/lib/resources/key_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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

export type ApiKeySpendLimitErrorType =
  | "key_not_found"
  | "system_key"
  | "workspace_not_credit_priced"
  | "workspace_not_metronome_billed"
  | "metronome_error";

export class ApiKeySpendLimitError extends Error {
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
  await key.updateMonthlyCapAwuCredits(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await clearMetronomeApiKeyCapAlert({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        keyName: key.name,
      });
      if (clearResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            keyName: key.name,
            err: clearResult.error,
          },
          "[Metronome ApiKeyCap] set(unlimited): failed to clear cap alert"
        );
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
      const upsertResult = await upsertMetronomeApiKeyCapAlert({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        keyName: key.name,
        awuCredits: limit.awuCredits,
      });
      if (upsertResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            keyName: key.name,
            awuCredits: limit.awuCredits,
            err: upsertResult.error,
          },
          "[Metronome ApiKeyCap] set(limited): failed to upsert cap alert"
        );
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
export async function syncApiKeyCapAlertsForWorkspace(
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
