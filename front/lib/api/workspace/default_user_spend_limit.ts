import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  upsertMetronomeDefaultUserCapAlertForSeatType,
  upsertMetronomeDefaultUserWarningAlertForSeatType,
} from "@app/lib/metronome/alerts/spend_limits";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForNormalizedSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";
import type {
  DefaultUserSpendLimit,
  GetDefaultUserSpendLimitResponseBody,
} from "@app/types/api/workspace/default_user_spend_limit";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import {
  type NormalizedPoolLimitSeatType,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

export type DefaultUserSpendLimitErrorType =
  | "workspace_not_metronome_billed"
  | "metronome_error"
  | "invalid_threshold"
  | "contract_not_found";

export class DefaultUserSpendLimitError extends Error {
  constructor(
    readonly type: DefaultUserSpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * Read the default pool credit limit for the workspace. The pool-only value
 * persisted on the credit-usage configuration
 * (`credit_usage_configurations.defaultPoolCapAwuCredits`) is the source of
 * truth — the per-seat-type Metronome alerts (threshold = seatAllowance +
 * poolLimit) are derived from it. When no workspace default is configured,
 * returns 0 (no pool access). Unlimited pool is not supported.
 */
export async function getDefaultUserSpendLimit(
  auth: Authenticator
): Promise<
  Result<GetDefaultUserSpendLimitResponseBody, DefaultUserSpendLimitError>
> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    logger.info(
      { workspaceId: workspace.sId },
      "[DefaultUserSpendLimit] get: workspace is not on Metronome billing"
    );
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config || config.defaultPoolCapAwuCredits === null) {
    return new Ok({ awuCredits: 0 });
  }

  return new Ok({ awuCredits: config.defaultPoolCapAwuCredits });
}

/**
 * Create or update Metronome per-seat-type cap + warning alerts so that every
 * active seat type has an alert at (seatAllowance + poolAwuCredits). Uses the
 * workspace's configured `defaultPoolCapAwuCredits` (or 0 when none is set).
 * Call after contract provisioning or when the default changes.
 */
export async function syncDefaultPoolCapAlertsForWorkspace(
  workspace: LightWorkspaceType
): Promise<Result<void, DefaultUserSpendLimitError>> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Ok(undefined);
  }

  const config = await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
    workspace.id
  );
  const poolAwuCredits = config?.defaultPoolCapAwuCredits ?? 0;

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    logger.error(
      { workspaceId: workspace.sId },
      "[DefaultUserSpendLimit] syncDefaultPoolCapAlerts: no active contract found"
    );
    return new Err(
      new DefaultUserSpendLimitError(
        "contract_not_found",
        "No active contract found for this workspace."
      )
    );
  }
  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );

  const normalizedSeatTypes = new Set<NormalizedPoolLimitSeatType>();
  for (const seatType of seatSubscriptions.keys()) {
    const normalized = normalizeToPoolLimitSeatType(seatType);
    if (normalized) {
      normalizedSeatTypes.add(normalized);
    }
  }

  for (const seatType of normalizedSeatTypes) {
    const seatAllowance = getAwuAllocationForNormalizedSeatType(
      contract,
      seatType,
      productSeatTypes
    );
    const totalThreshold = seatAllowance + poolAwuCredits;

    const upsertResult = await upsertMetronomeDefaultUserCapAlertForSeatType({
      metronomeCustomerId,
      workspaceId: workspace.sId,
      seatType,
      awuCredits: totalThreshold,
    });
    if (upsertResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          seatType,
          totalThreshold,
          err: upsertResult.error,
        },
        "[DefaultUserSpendLimit] syncDefaultPoolCapAlerts: failed to upsert cap alert"
      );
      return new Err(
        new DefaultUserSpendLimitError(
          "metronome_error",
          upsertResult.error.message
        )
      );
    }

    const warningResult =
      await upsertMetronomeDefaultUserWarningAlertForSeatType({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        seatType,
        capAwuCredits: totalThreshold,
      });
    if (warningResult.isErr()) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          seatType,
          totalThreshold,
          err: warningResult.error,
        },
        "[DefaultUserSpendLimit] syncDefaultPoolCapAlerts: failed to upsert warning alert; continuing"
      );
    }
  }

  return new Ok(undefined);
}

/**
 * Update the workspace-wide default pool credit limit.
 *
 * Persists the new limit then syncs Metronome per-seat-type cap + warning
 * alerts (threshold = seatAllowance + poolAwuCredits) via
 * `syncDefaultPoolCapAlertsForWorkspace`.
 */
export async function setDefaultUserSpendLimit(
  auth: Authenticator,
  {
    awuCredits: poolAwuCredits,
    auditContext,
  }: {
    awuCredits: number;
    auditContext: AuditLogContext;
  }
): Promise<Result<DefaultUserSpendLimit, DefaultUserSpendLimitError>> {
  if (
    !Number.isInteger(poolAwuCredits) ||
    poolAwuCredits < MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
    poolAwuCredits > MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS
  ) {
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        poolAwuCredits,
        min: MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
        max: MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
      },
      "[DefaultUserSpendLimit] set: rejected out-of-range threshold"
    );
    return new Err(
      new DefaultUserSpendLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} and ${MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS}.`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    logger.info(
      { workspaceId: workspace.sId },
      "[DefaultUserSpendLimit] set: workspace is not on Metronome billing"
    );
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }
  const { metronomeCustomerId } = workspace;

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      poolAwuCredits,
    },
    "[DefaultUserSpendLimit] set: starting default per-user spend limit update"
  );

  // Persist the admin's intent first: the credit-usage configuration column is
  // the source of truth, the per-seat-type Metronome alerts below are derived
  // enforcement (a failed sync can be retried and re-derives from this value).
  // The config row is created lazily, so upsert it.
  const existingConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const previousAwuCredits = existingConfig?.defaultPoolCapAwuCredits ?? null;

  if (existingConfig) {
    await existingConfig.updateConfiguration(auth, {
      defaultPoolCapAwuCredits: poolAwuCredits,
    });
  } else {
    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      defaultPoolCapAwuCredits: poolAwuCredits,
    });
  }

  // Sync per-seat-type Metronome alerts from the newly persisted value.
  const syncResult = await syncDefaultPoolCapAlertsForWorkspace(workspace);
  if (syncResult.isErr()) {
    return new Err(syncResult.error);
  }

  // Reconcile all workspace user credit states against the new cap so that
  // users previously blocked by the old cap are unblocked immediately rather
  // than waiting for the next webhook or manual reconcile.
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    void reconcileWorkspaceUserCreditStates({
      workspace,
      metronomeCustomerId,
      metronomeContractId,
      planCode: auth.subscription()?.plan.code ?? "",
    }).catch((err) => {
      logger.error(
        { workspaceId: workspace.sId, err: normalizeError(err) },
        "[DefaultUserSpendLimit] set: failed to reconcile user credit states after cap update"
      );
    });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      previousAwuCredits,
      poolAwuCredits,
    },
    "[DefaultUserSpendLimit] set: default per-user spend limit update succeeded"
  );

  void emitAuditLogEvent({
    auth,
    action: "workspace.default_user_spend_limit_updated",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: auditContext,
    metadata: {
      previous_awu_credits:
        previousAwuCredits !== null ? String(previousAwuCredits) : "unset",
      new_awu_credits: String(poolAwuCredits),
    },
  });

  return new Ok({ awuCredits: poolAwuCredits });
}
