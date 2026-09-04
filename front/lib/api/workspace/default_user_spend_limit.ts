import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

type DefaultUserSpendLimitErrorType =
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
  return new Ok({ awuCredits: config?.defaultPoolCapAwuCredits ?? 0 });
}

/**
 * Update the workspace-wide default pool credit limit.
 *
 * Persists the new limit to the DB; the spend cap is enforced from the Redis
 * rate-limiter counter against `defaultPoolCapAwuCredits` (no Metronome alerts).
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

  // Persist the admin's intent on the credit-usage configuration column, the
  // source of truth the Redis rate-limiter reads at enforcement time. The
  // config row is created lazily, so upsert it.
  const existingConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const previousAwuCredits = existingConfig?.defaultPoolCapAwuCredits ?? 0;

  if (existingConfig) {
    await existingConfig.updateConfiguration(auth, {
      defaultPoolCapAwuCredits: poolAwuCredits,
    });
  } else {
    const makeNewResult = await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      defaultPoolCapAwuCredits: poolAwuCredits,
    });
    if (makeNewResult.isErr()) {
      return new Err(
        new DefaultUserSpendLimitError(
          "metronome_error",
          makeNewResult.error.message
        )
      );
    }
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
      previous_awu_credits: String(previousAwuCredits),
      new_awu_credits: String(poolAwuCredits),
    },
  });

  return new Ok({ awuCredits: poolAwuCredits });
}

/**
 * Update the workspace-wide default per-user credit limit on a workspace that is
 * *not* on a credit-priced plan, applying to current and future members.
 *
 * Writes the same column as `setDefaultUserSpendLimit` and nothing else: these
 * workspaces have no Metronome contract, so there are no per-seat-type cap alerts
 * to derive and no contract balances to reconcile. The limit is enforced from the
 * Redis fixed-window per-user counter (`isNonCreditPricedUserSpendLimitReached`),
 * which reads this column directly.
 *
 * 0 means "no limit" here — unlike under credit pricing, where it means "no pool
 * access on top of the seat allowance".
 */
export async function setNonCreditPricedDefaultUserSpendLimit(
  auth: Authenticator,
  {
    awuCredits,
    auditContext,
  }: {
    awuCredits: number;
    auditContext: AuditLogContext;
  }
): Promise<Result<DefaultUserSpendLimit, DefaultUserSpendLimitError>> {
  if (
    !Number.isInteger(awuCredits) ||
    awuCredits < MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
    awuCredits > MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS
  ) {
    return new Err(
      new DefaultUserSpendLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} and ${MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS}.`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();

  // The config row is created lazily, so upsert it.
  const existingConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const previousAwuCredits = existingConfig?.defaultPoolCapAwuCredits ?? 0;

  if (existingConfig) {
    await existingConfig.updateConfiguration(auth, {
      defaultPoolCapAwuCredits: awuCredits,
    });
  } else {
    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      defaultPoolCapAwuCredits: awuCredits,
    });
  }

  logger.info(
    { workspaceId: workspace.sId, previousAwuCredits, awuCredits },
    "[DefaultUserSpendLimit] set(non-credit-priced): default per-user spend limit updated"
  );

  void emitAuditLogEvent({
    auth,
    action: "workspace.default_user_spend_limit_updated",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: auditContext,
    metadata: {
      previous_awu_credits: String(previousAwuCredits),
      new_awu_credits: String(awuCredits),
    },
  });

  return new Ok({ awuCredits });
}

/**
 * Returns the workspace per-user credit limit for a workspace that is not
 * on a credit-priced plan.
 * In practice it returns the same value as `getDefaultUserSpendLimit`,
 * but this doesn't require the workspace to be on a credit-priced plan, and the returned
 * value should be interpreted differently: 0 means "no limit" here.
 */
export async function getNonCreditPricedDefaultUserSpendLimit(
  auth: Authenticator
): Promise<number> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config?.defaultPoolCapAwuCredits ?? 0;
}
