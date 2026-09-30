import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  GroupLimit,
  SetGroupLimitResponse,
} from "@app/types/api/groups/group_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MIN_GROUP_LIMIT_AWU_CREDITS = 0;
export const MAX_GROUP_LIMIT_AWU_CREDITS = 100_000_000;

type GroupLimitErrorType =
  | "group_limits_not_enabled"
  | "group_not_found"
  | "invalid_group_kind"
  | "invalid_threshold"
  | "unauthorized";

export class GroupLimitError extends Error {
  constructor(
    readonly type: GroupLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * @cc [owner:rfrenoy,label:product;security] group-limit-admin-only-edit
 * Only workspace admins MAY set or remove a group limit. Group managers' `set_usage_limits`
 * MUST NOT grant it (it only covers the per-member limit).
 */
export async function setGroupLimit(
  auth: Authenticator,
  {
    groupId,
    limit,
    auditContext,
  }: {
    groupId: string;
    limit: GroupLimit;
    auditContext: AuditLogContext;
  }
): Promise<Result<SetGroupLimitResponse, GroupLimitError>> {
  if (!auth.isAdmin()) {
    return new Err(
      new GroupLimitError(
        "unauthorized",
        "Only workspace admins can change group limits."
      )
    );
  }

  if (!(await areGroupLimitsEnabled(auth))) {
    return new Err(
      new GroupLimitError(
        "group_limits_not_enabled",
        "Group limits are not available for this workspace."
      )
    );
  }

  if (
    limit.kind === "limited" &&
    (!Number.isInteger(limit.awuCredits) ||
      limit.awuCredits < MIN_GROUP_LIMIT_AWU_CREDITS ||
      limit.awuCredits > MAX_GROUP_LIMIT_AWU_CREDITS)
  ) {
    return new Err(
      new GroupLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_GROUP_LIMIT_AWU_CREDITS} and ${MAX_GROUP_LIMIT_AWU_CREDITS}`
      )
    );
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(
      new GroupLimitError(
        "group_not_found",
        "Could not find the group in this workspace."
      )
    );
  }
  const group = groupRes.value;

  if (!isCapEligibleGroupKind(group.kind)) {
    return new Err(
      new GroupLimitError(
        "invalid_group_kind",
        `Group of kind '${group.kind}' cannot carry a group limit.`
      )
    );
  }

  const previousAwuCredits = group.groupLimitAwuCredits;

  await group.updateGroupLimit(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  void emitAuditLogEvent({
    auth,
    action: "group.group_limit_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("group", { sId: group.sId, name: group.name }),
    ],
    context: auditContext,
    metadata: {
      kind: limit.kind,
      awu_credits:
        limit.kind === "limited" ? String(limit.awuCredits) : "unlimited",
      previous_kind: previousAwuCredits === null ? "unlimited" : "limited",
      previous_awu_credits:
        previousAwuCredits === null ? "unlimited" : String(previousAwuCredits),
    },
  });

  return new Ok({ limit });
}
