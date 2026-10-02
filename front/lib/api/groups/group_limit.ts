import { makeGroupLimitAwuCreditsRateLimitKeyForGroup } from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { contractHasPersonalCreditSeats } from "@app/lib/metronome/seats";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { addFixedWindowCount } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  GroupLimit,
  SetGroupLimitResponse,
} from "@app/types/api/groups/group_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import { isCreditPricedPlan } from "@app/types/plan";
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
 * @cc [owner:rfrenoy,label:product;security] group-limit-pooled-only
 * Group limits MUST only apply when the `group_limits` flag is on and the workspace is credit-priced
 * on a pool-only contract (no sold seat type carries personal credits). Every group-limit entry point
 * (setting a limit, recording, enforcement, UI data) MUST gate on this function. Group limit values
 * MUST NOT be serialized outside endpoints gated on this function (they are not part of `GroupType`).
 */
export async function areGroupLimitsEnabled(
  auth: Authenticator
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;
  if (
    !owner.metronomeCustomerId ||
    !plan ||
    !isCreditPricedPlan(plan) ||
    !(await auth.hasFeatureFlag("group_limits"))
  ) {
    return false;
  }

  const contract = await getActiveContract(owner.sId);
  if (!contract) {
    return false;
  }

  return !(await contractHasPersonalCreditSeats(contract));
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

/**
 * @cc [owner:rfrenoy,label:product;backend] limit-group-resolution
 * A member's limit group is, among their active memberships in cap-eligible groups that have a group
 * limit, the one with the lowest `groupLimitPriority`. Enforcement, UI data and the first recording of
 * a message MUST resolve it through this function. Returns nothing when group limits are not enabled.
 *
 * Returns each resolved member's limit group keyed by the member's sId; members without one, or whose
 * limit group the caller cannot `read`, are absent.
 */
export async function resolveLimitGroupsForUsers(
  auth: Authenticator,
  { users }: { users: UserResource[] }
): Promise<Map<string, GroupResource>> {
  if (!(await areGroupLimitsEnabled(auth))) {
    return new Map();
  }

  const limitGroupByUserModelId =
    await GroupResource.listLimitGroupByUserModelIdInWorkspace(auth, {
      userModelIds: users.map((user) => user.id),
    });

  const limitGroupByUserId = new Map<string, GroupResource>();
  for (const user of users) {
    const limitGroup = limitGroupByUserModelId.get(user.id);
    if (limitGroup) {
      limitGroupByUserId.set(user.sId, limitGroup);
    }
  }
  return limitGroupByUserId;
}

export async function resolveLimitGroupForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<GroupResource | null> {
  const limitGroups = await resolveLimitGroupsForUsers(auth, {
    users: [user],
  });
  return limitGroups.get(user.sId) ?? null;
}

export async function recordGroupLimitUsage(
  auth: Authenticator,
  {
    user,
    agentMessageId,
    incrementBy,
  }: { user: UserResource; agentMessageId: string; incrementBy: number }
): Promise<void> {
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }
  if (!(await areGroupLimitsEnabled(auth))) {
    return;
  }

  const agentMessage = await ConversationResource.fetchAgentMessageLimitGroup(
    auth,
    { agentMessageId }
  );
  if (!agentMessage) {
    return;
  }

  let limitGroup: GroupResource | null;
  if (agentMessage.limitGroupModelId !== null) {
    const [storedGroup] = await GroupResource.dangerouslyFetchByModelIds(auth, [
      agentMessage.limitGroupModelId,
    ]);
    limitGroup = storedGroup ?? null;
  } else {
    limitGroup = await resolveLimitGroupForUser(auth, { user });
    if (limitGroup) {
      await ConversationResource.setAgentMessageLimitGroup(auth, {
        agentMessageModelId: agentMessage.agentMessageModelId,
        limitGroupModelId: limitGroup.id,
      });
    }
  }
  if (!limitGroup) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await addFixedWindowCount({
    key: makeGroupLimitAwuCreditsRateLimitKeyForGroup(workspace, limitGroup),
    bounds,
    incrementBy: roundCreditsToMicroCredits(incrementBy),
    logger,
  });
}
