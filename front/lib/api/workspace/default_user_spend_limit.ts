import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
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
import { getPlanDefaultPoolLimitAwuCredits } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";
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

export type DefaultUserSpendLimit = {
  awuCredits: number;
};

export type GetDefaultUserSpendLimitResponseBody = {
  awuCredits: number | null;
};

export type PutDefaultUserSpendLimitResponseBody = DefaultUserSpendLimit;

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
 * falls back to the plan-tier default (`null` for enterprise = unlimited).
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
    // No workspace-specific default configured: fall back to the plan-tier
    // default (same resolution the per-user cap path applies).
    const planCode = auth.getNonNullableSubscriptionResource().getPlan().code;
    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId: workspace.metronomeCustomerId,
        planCode,
      },
      "[DefaultUserSpendLimit] get: no workspace default configured, falling back to plan-tier default"
    );
    return new Ok({ awuCredits: getPlanDefaultPoolLimitAwuCredits(planCode) });
  }

  return new Ok({ awuCredits: config.defaultPoolCapAwuCredits });
}

/**
 * Update the workspace-wide default pool credit limit.
 *
 * Creates one Metronome alert per seat type on the contract. Each alert's
 * threshold = seatAllowance + poolAwuCredits so that the limit only
 * concerns pool credits, not the seat allowance.
 *
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

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    logger.error(
      { workspaceId: workspace.sId, metronomeCustomerId },
      "[DefaultUserSpendLimit] set: no active contract found for workspace"
    );
    return new Err(
      new DefaultUserSpendLimitError(
        "contract_not_found",
        "No active contract found for this workspace."
      )
    );
  }
  const productSeatTypes = await getProductSeatTypes();

  // Determine which seat types the contract actually sells.
  const seatSubscriptions = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );

  // Normalize to pool-limit seat types (dedup monthly/yearly).
  const normalizedSeatTypes = new Set<NormalizedPoolLimitSeatType>();
  for (const seatType of seatSubscriptions.keys()) {
    const normalized = normalizeToPoolLimitSeatType(seatType);
    if (normalized) {
      normalizedSeatTypes.add(normalized);
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      productSeatTypeCount: productSeatTypes.size,
      contractSeatTypes: [...seatSubscriptions.keys()],
      normalizedSeatTypes: [...normalizedSeatTypes],
    },
    "[DefaultUserSpendLimit] set: resolved seat types from contract"
  );

  if (normalizedSeatTypes.size === 0) {
    // No seat alert will be created, so the limit would silently not apply.
    // Surface this loudly rather than returning a success that does nothing.
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        contractSeatTypes: [...seatSubscriptions.keys()],
      },
      "[DefaultUserSpendLimit] set: contract has no pool-limit seat types; no cap alert will be created"
    );
  }

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

  // Create per-seat-type alerts.
  for (const seatType of normalizedSeatTypes) {
    const seatAllowance = getAwuAllocationForNormalizedSeatType(
      contract,
      seatType,
      productSeatTypes
    );
    const totalThreshold = seatAllowance + poolAwuCredits;

    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        seatType,
        seatAllowance,
        poolAwuCredits,
        totalThreshold,
      },
      "[DefaultUserSpendLimit] set: computed cap threshold for seat type (seatAllowance + poolAwuCredits)"
    );

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
          metronomeCustomerId,
          seatType,
          seatAllowance,
          poolAwuCredits,
          totalThreshold,
          err: upsertResult.error,
        },
        "[DefaultUserSpendLimit] set: failed to upsert default per-user cap alert"
      );
      return new Err(
        new DefaultUserSpendLimitError(
          "metronome_error",
          upsertResult.error.message
        )
      );
    }

    // 80% warning alert. Errors are logged but don't fail the operation.
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
          metronomeCustomerId,
          poolAwuCredits,
          err: warningResult.error,
        },
        "[DefaultUserSpendLimit] Failed to upsert warning alert for seat type; continuing"
      );
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      previousAwuCredits,
      poolAwuCredits,
      seatTypesUpdated: [...normalizedSeatTypes],
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
