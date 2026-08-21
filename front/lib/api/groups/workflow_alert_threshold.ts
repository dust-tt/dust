import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  GroupWorkflowAlertThreshold,
  SetGroupWorkflowAlertThresholdResponse,
} from "@app/types/api/groups/workflow_alert_threshold";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MIN_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS = 0;
export const MAX_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS = 2_000_000;

type GroupWorkflowAlertThresholdErrorType =
  | "group_not_found"
  | "invalid_group_kind"
  | "unauthorized"
  | "invalid_threshold";

export class GroupWorkflowAlertThresholdError extends Error {
  constructor(
    readonly type: GroupWorkflowAlertThresholdErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * Set or clear a group's smooth shutdown credit threshold.
 *
 * When a member's spend crosses the highest threshold across their groups,
 * the agent loop offers to summarize progress and stop rather than hit the
 * hard spend limit. `threshold.kind === "disabled"` clears the threshold
 * (smooth shutdown stays off for this group).
 */
export async function setGroupWorkflowAlertThreshold(
  auth: Authenticator,
  {
    groupId,
    threshold,
    auditContext,
  }: {
    groupId: string;
    threshold: GroupWorkflowAlertThreshold;
    auditContext: AuditLogContext;
  }
): Promise<
  Result<
    SetGroupWorkflowAlertThresholdResponse,
    GroupWorkflowAlertThresholdError
  >
> {
  const workspace = auth.getNonNullableWorkspace();

  if (
    threshold.kind === "enabled" &&
    (!Number.isInteger(threshold.awuCredits) ||
      threshold.awuCredits < MIN_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS ||
      threshold.awuCredits > MAX_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS)
  ) {
    return new Err(
      new GroupWorkflowAlertThresholdError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS} and ${MAX_GROUP_WORKFLOW_ALERT_THRESHOLD_AWU_CREDITS}.`
      )
    );
  }

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(
      new GroupWorkflowAlertThresholdError(
        "group_not_found",
        "Could not find the group in this workspace."
      )
    );
  }
  const group = groupRes.value;

  if (!isCapEligibleGroupKind(group.kind)) {
    return new Err(
      new GroupWorkflowAlertThresholdError(
        "invalid_group_kind",
        `Group of kind '${group.kind}' cannot carry a workflow alert threshold.`
      )
    );
  }

  const workflowAlertThresholdAwuCredits =
    threshold.kind === "enabled" ? threshold.awuCredits : null;

  const updateResult = await group.updateWorkflowAlertThreshold(
    auth,
    workflowAlertThresholdAwuCredits
  );
  if (updateResult.isErr()) {
    return new Err(
      new GroupWorkflowAlertThresholdError(
        "unauthorized",
        updateResult.error.message
      )
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "group.workflow_alert_threshold_updated",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("group", { sId: group.sId, name: group.name }),
    ],
    context: auditContext,
    metadata: {
      kind: threshold.kind,
      awu_credits:
        threshold.kind === "enabled"
          ? String(threshold.awuCredits)
          : "disabled",
    },
  });

  return new Ok({ threshold });
}
