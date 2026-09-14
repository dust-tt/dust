import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import logger from "@app/logger/logger";
import type {
  GroupSpendLimit,
  SetGroupSpendLimitResponse,
} from "@app/types/api/groups/spend_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
 * Set or clear a group's per-member usage spend limit.
 *
 * Persists the pool-only cap on the group (source of truth) and reconciles
 * workspace credit states so members are (un)capped immediately rather than on
 * the next webhook. The cap is enforced from the Redis rate-limiter counter
 * against this persisted value. `limit.kind === "unlimited"` clears the cap.
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

  // Persist the admin's intent on the group column, the source of truth the
  // Redis rate-limiter reads at enforcement time.
  const updateResult = await group.updatePoolCap(poolCapAwuCredits);
  if (updateResult.isErr()) {
    return new Err(
      new GroupSpendLimitError("unauthorized", updateResult.error.message)
    );
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
