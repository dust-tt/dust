import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeGroupCapAlertForSeatType,
  clearMetronomeGroupWarningAlertForSeatType,
  upsertMetronomeGroupCapAlertForSeatType,
  upsertMetronomeGroupWarningAlertForSeatType,
} from "@app/lib/metronome/alerts/spend_limits";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForNormalizedSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { revertOnSyncFailure } from "@app/lib/spend_limits/revert_on_sync_failure";
import logger from "@app/logger/logger";
import type {
  GroupSpendLimit,
  SetGroupSpendLimitResponse,
} from "@app/types/api/groups/spend_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { NormalizedPoolLimitSeatType } from "@app/types/memberships";
import {
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

export const MIN_GROUP_SPEND_LIMIT_AWU_CREDITS = 0;
export const MAX_GROUP_SPEND_LIMIT_AWU_CREDITS = 2_000_000;

type GroupSpendLimitErrorType =
  | "group_not_found"
  | "invalid_group_kind"
  | "unauthorized"
  | "workspace_not_metronome_billed"
  | "invalid_threshold"
  | "contract_not_found"
  | "metronome_error";

export class GroupSpendLimitError extends Error {
  constructor(
    readonly type: GroupSpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * Create/update or clear the per-(group, seat-type) Metronome cap + warning
 * alerts from the group's intended cap. When `poolCapAwuCredits` is null the
 * alerts are cleared for every pool-limit seat type; otherwise one cap + warning
 * alert is upserted per seat type at (seatAllowance + groupCap). The alerts fan
 * out over all users — the webhook decides per user whether the cap applies.
 */
async function syncGroupCapAlertsForGroup({
  workspace,
  groupId,
  poolCapAwuCredits,
}: {
  workspace: LightWorkspaceType;
  groupId: string;
  poolCapAwuCredits: number | null;
}): Promise<Result<void, GroupSpendLimitError>> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Ok(undefined);
  }

  // Clearing needs no contract lookup — just archive every seat type's alerts.
  if (poolCapAwuCredits === null) {
    for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
      const clearResult = await clearMetronomeGroupCapAlertForSeatType({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        groupId,
        seatType,
      });
      if (clearResult.isErr()) {
        return new Err(
          new GroupSpendLimitError("metronome_error", clearResult.error.message)
        );
      }
      const clearWarningResult =
        await clearMetronomeGroupWarningAlertForSeatType({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          groupId,
          seatType,
        });
      if (clearWarningResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            groupId,
            seatType,
            err: clearWarningResult.error,
          },
          "[GroupSpendLimit] Failed to clear group warning alert; continuing"
        );
      }
    }
    return new Ok(undefined);
  }

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    logger.error(
      { workspaceId: workspace.sId, groupId },
      "[GroupSpendLimit] syncGroupCapAlerts: no active contract found"
    );
    return new Err(
      new GroupSpendLimitError(
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
    const totalThreshold = seatAllowance + poolCapAwuCredits;

    const upsertResult = await upsertMetronomeGroupCapAlertForSeatType({
      metronomeCustomerId,
      workspaceId: workspace.sId,
      groupId,
      seatType,
      awuCredits: totalThreshold,
    });
    if (upsertResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          groupId,
          seatType,
          totalThreshold,
          err: upsertResult.error,
        },
        "[GroupSpendLimit] syncGroupCapAlerts: failed to upsert cap alert"
      );
      return new Err(
        new GroupSpendLimitError("metronome_error", upsertResult.error.message)
      );
    }

    const warningResult = await upsertMetronomeGroupWarningAlertForSeatType({
      metronomeCustomerId,
      workspaceId: workspace.sId,
      groupId,
      seatType,
      capAwuCredits: totalThreshold,
    });
    if (warningResult.isErr()) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          groupId,
          seatType,
          totalThreshold,
          err: warningResult.error,
        },
        "[GroupSpendLimit] syncGroupCapAlerts: failed to upsert warning alert; continuing"
      );
    }
  }

  return new Ok(undefined);
}

/**
 * Set or clear a group's per-member usage spend limit.
 *
 * Persists the pool-only cap on the group (source of truth), then syncs the
 * derived Metronome per-(group, seat-type) alerts and reconciles workspace
 * credit states so members are (un)capped immediately rather than on the next
 * webhook. `limit.kind === "unlimited"` clears the cap.
 */
export async function setGroupSpendLimit(
  auth: Authenticator,
  {
    groupId,
    limit,
    auditContext,
  }: {
    groupId: string;
    limit: GroupSpendLimit;
    auditContext: AuditLogContext;
  }
): Promise<Result<SetGroupSpendLimitResponse, GroupSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new GroupSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }
  const { metronomeCustomerId } = workspace;

  if (
    limit.kind === "limited" &&
    (!Number.isInteger(limit.awuCredits) ||
      limit.awuCredits < MIN_GROUP_SPEND_LIMIT_AWU_CREDITS ||
      limit.awuCredits > MAX_GROUP_SPEND_LIMIT_AWU_CREDITS)
  ) {
    return new Err(
      new GroupSpendLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_GROUP_SPEND_LIMIT_AWU_CREDITS} and ${MAX_GROUP_SPEND_LIMIT_AWU_CREDITS}.`
      )
    );
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(
      new GroupSpendLimitError(
        "group_not_found",
        "Could not find the group in this workspace."
      )
    );
  }
  const group = groupRes.value;

  if (!isCapEligibleGroupKind(group.kind)) {
    return new Err(
      new GroupSpendLimitError(
        "invalid_group_kind",
        `Group of kind '${group.kind}' cannot carry a spend limit.`
      )
    );
  }

  const poolCapAwuCredits = limit.kind === "limited" ? limit.awuCredits : null;
  const previousPoolCapAwuCredits = group.poolCapAwuCredits;

  // Persist the admin's intent first: the group column is the source of truth,
  // the Metronome alerts below are derived enforcement (a failed sync can be
  // retried and re-derives from this value).
  const updateResult = await group.updatePoolCap(poolCapAwuCredits);
  if (updateResult.isErr()) {
    return new Err(
      new GroupSpendLimitError("unauthorized", updateResult.error.message)
    );
  }

  const syncResult = await revertOnSyncFailure(
    await syncGroupCapAlertsForGroup({
      workspace,
      groupId: group.sId,
      poolCapAwuCredits,
    }),
    {
      revert: async () => {
        await group.updatePoolCap(previousPoolCapAwuCredits);
      },
      logContext: {
        scope: "group",
        workspaceId: workspace.sId,
        groupId: group.sId,
        previousPoolCapAwuCredits,
      },
    }
  );
  if (syncResult.isErr()) {
    return new Err(syncResult.error);
  }

  // Reconcile workspace user credit states so members are (un)capped against the
  // new group cap immediately rather than waiting for the next webhook.
  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (metronomeContractId) {
    void reconcileWorkspaceUserCreditStates({
      workspace,
      metronomeCustomerId,
      metronomeContractId,
      planCode: auth.subscription()?.plan.code ?? "",
    }).catch((err) => {
      logger.error(
        {
          workspaceId: workspace.sId,
          groupId: group.sId,
          err: normalizeError(err),
        },
        "[GroupSpendLimit] set: failed to reconcile user credit states after cap update"
      );
    });
  }

  void emitAuditLogEvent({
    auth,
    action: "group.spend_limit_updated",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", { sId: group.sId, name: group.name }),
    ],
    context: auditContext,
    metadata: {
      kind: limit.kind,
      awu_credits:
        limit.kind === "limited" ? String(limit.awuCredits) : "unlimited",
    },
  });

  return new Ok({ limit });
}
