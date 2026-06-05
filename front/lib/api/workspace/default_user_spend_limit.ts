import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  getMetronomeDefaultUserCapAlertForSeatType,
  upsertMetronomeDefaultUserCapAlertForSeatType,
  upsertMetronomeDefaultUserWarningAlertForSeatType,
} from "@app/lib/metronome/alerts/spend_limits";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import logger from "@app/logger/logger";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import {
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  type NormalizedPoolLimitSeatType,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DefaultUserSpendLimit = {
  awuCredits: number;
};

export type DefaultUserSpendLimitErrorType =
  | "workspace_not_metronome_billed"
  | "metronome_error"
  | "not_found"
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
 * Read the default pool credit limit for the workspace. Reads per-seat-type
 * alerts and recovers the pool limit by subtracting the seat allowance.
 *
 * Since all seat types share the same pool limit, we read the first
 * per-seat-type alert we find and subtract its seat type's AWU allocation.
 */
export async function getDefaultUserSpendLimit(
  auth: Authenticator
): Promise<Result<DefaultUserSpendLimit, DefaultUserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const contract = await getActiveContract(workspace.sId);
  const productSeatTypes = contract ? await getProductSeatTypes() : null;

  // Try each normalized seat type until we find one with an alert configured.
  for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
    const result = await getMetronomeDefaultUserCapAlertForSeatType({
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
      seatType,
    });
    if (result.isErr()) {
      return new Err(
        new DefaultUserSpendLimitError("metronome_error", result.error.message)
      );
    }
    if (result.value) {
      const totalThreshold = result.value.alert.threshold;
      const seatAllowance =
        contract && productSeatTypes
          ? getAwuAllocationForSeatType(contract, seatType, productSeatTypes)
          : 0;
      return new Ok({ awuCredits: totalThreshold - seatAllowance });
    }
  }

  return new Err(
    new DefaultUserSpendLimitError(
      "not_found",
      "No default per-user spend limit configured for this workspace."
    )
  );
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
    return new Err(
      new DefaultUserSpendLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} and ${MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS}.`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }
  const { metronomeCustomerId } = workspace;

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
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

  // Read previous pool limit for audit metadata (best-effort).
  const previousResult = await getDefaultUserSpendLimit(auth);
  const previousAwuCredits = previousResult.isOk()
    ? previousResult.value.awuCredits
    : null;

  // Create per-seat-type alerts.
  for (const seatType of normalizedSeatTypes) {
    const seatAllowance = getAwuAllocationForSeatType(
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
