import {
  makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { computeCreditUsageStatus } from "@app/lib/api/credits/usage_status";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { contractHasPersonalCreditSeats } from "@app/lib/metronome/seats";
import type { BillingCycle } from "@app/lib/plans/billing_cycle";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { listGroupsWithVerb } from "@app/lib/resources/group_management_access";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import {
  resolveMetronomeCycle,
  resolveSpendLimitCycleBounds,
} from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  getFixedWindowCount,
  readFixedWindowCountWithLazySeed,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type {
  SharedUsageLimit,
  SetSharedUsageLimitResponse,
} from "@app/types/api/groups/shared_usage_limit";
import {
  MAX_SHARED_USAGE_LIMIT_AWU_CREDITS,
  MIN_SHARED_USAGE_LIMIT_AWU_CREDITS,
} from "@app/types/api/groups/shared_usage_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

type SharedUsageLimitErrorType =
  | "shared_usage_limits_not_enabled"
  | "group_not_found"
  | "invalid_group_kind"
  | "invalid_threshold"
  | "invalid_order"
  | "order_changed"
  | "unauthorized";

export class SharedUsageLimitError extends Error {
  constructor(
    readonly type: SharedUsageLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

/**
 * @cc [owner:rfrenoy,label:product;security] group-shared-usage-limit-pooled-only
 * Shared usage limits MUST only apply when the `group_limits` flag is on and the workspace is credit-priced
 * on a pool-only contract (no sold seat type carries personal credits). Every group-limit entry point
 * (setting a limit, recording, enforcement, UI data) MUST gate on this function. Shared usage limit values
 * MUST NOT be serialized outside endpoints gated on this function (they are not part of `GroupType`).
 */
export async function areGroupSharedUsageLimitsEnabled(
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
 * @cc [owner:rfrenoy,label:product;security] group-shared-usage-limit-edit-rights
 * Only workspace admins and workspace managers MAY set or remove a shared usage limit, or read how
 * groups with one overlap. Group managers' `set_usage_limits` MUST NOT grant it (it only covers the
 * per-member limit).
 */
async function ensureCanManageSharedUsageLimits(
  auth: Authenticator
): Promise<Result<void, SharedUsageLimitError>> {
  if (!auth.isManager()) {
    return new Err(
      new SharedUsageLimitError(
        "unauthorized",
        "Only workspace admins and managers can manage shared usage limits."
      )
    );
  }

  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return new Err(
      new SharedUsageLimitError(
        "shared_usage_limits_not_enabled",
        "Shared usage limits are not available for this workspace."
      )
    );
  }

  return new Ok(undefined);
}

async function fetchCapEligibleGroup(
  auth: Authenticator,
  groupId: string
): Promise<Result<GroupResource, SharedUsageLimitError>> {
  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return new Err(
      new SharedUsageLimitError(
        "group_not_found",
        "Could not find the group in this workspace."
      )
    );
  }
  const group = groupRes.value;

  if (!isCapEligibleGroupKind(group.kind)) {
    return new Err(
      new SharedUsageLimitError(
        "invalid_group_kind",
        `Group of kind '${group.kind}' cannot carry a shared usage limit.`
      )
    );
  }

  return new Ok(group);
}

export async function setGroupSharedUsageLimit(
  auth: Authenticator,
  {
    groupId,
    limit,
    auditContext,
  }: {
    groupId: string;
    limit: SharedUsageLimit;
    auditContext: AuditLogContext;
  }
): Promise<Result<SetSharedUsageLimitResponse, SharedUsageLimitError>> {
  const canManage = await ensureCanManageSharedUsageLimits(auth);
  if (canManage.isErr()) {
    return canManage;
  }

  if (
    limit.kind === "limited" &&
    (!Number.isInteger(limit.awuCredits) ||
      limit.awuCredits < MIN_SHARED_USAGE_LIMIT_AWU_CREDITS ||
      limit.awuCredits > MAX_SHARED_USAGE_LIMIT_AWU_CREDITS)
  ) {
    return new Err(
      new SharedUsageLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_SHARED_USAGE_LIMIT_AWU_CREDITS} and ${MAX_SHARED_USAGE_LIMIT_AWU_CREDITS}`
      )
    );
  }

  const groupRes = await fetchCapEligibleGroup(auth, groupId);
  if (groupRes.isErr()) {
    return groupRes;
  }
  const group = groupRes.value;

  const { previousAwuCredits } = await group.updateSharedUsageLimit(
    limit.kind === "limited" ? limit.awuCredits : null
  );

  void emitAuditLogEvent({
    auth,
    action: "group.shared_usage_limit_updated",
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

export type SharedUsageLimitOverlapWithGroup = {
  group: GroupResource;
  position: number;
  sharedMemberCount: number | null;
};

/**
 * Every group with a shared usage limit, in priority order (position 1 applies first), with the
 * number of members it shares with the given group (`null` for the given group itself). The given
 * group does not need a shared usage limit.
 */
export async function getSharedUsageLimitOverlaps(
  auth: Authenticator,
  { groupId }: { groupId: string }
): Promise<Result<SharedUsageLimitOverlapWithGroup[], SharedUsageLimitError>> {
  const canManage = await ensureCanManageSharedUsageLimits(auth);
  if (canManage.isErr()) {
    return canManage;
  }

  const groupRes = await fetchCapEligibleGroup(auth, groupId);
  if (groupRes.isErr()) {
    return groupRes;
  }
  const group = groupRes.value;

  const limitedGroups =
    await GroupResource.listGroupsWithSharedUsageLimit(auth);
  const memberIdsByGroupModelId =
    await GroupResource.getActiveMembershipsForGroups(auth, [
      group,
      ...limitedGroups.filter((limitedGroup) => limitedGroup.id !== group.id),
    ]);
  const groupMemberIds = new Set(memberIdsByGroupModelId[group.id] ?? []);

  return new Ok(
    limitedGroups.map((limitedGroup, index) => ({
      group: limitedGroup,
      position: index + 1,
      sharedMemberCount:
        limitedGroup.id === group.id
          ? null
          : (memberIdsByGroupModelId[limitedGroup.id] ?? []).filter((userId) =>
              groupMemberIds.has(userId)
            ).length,
    }))
  );
}

/**
 * Reorders every group with a shared usage limit. `orderedGroupIds` and `expectedOrderedGroupIds`
 * list all of them by sId, first applying first; `expectedOrderedGroupIds` is the order the caller
 * loaded, and nothing is written
 * when it no longer matches. The read, the check and the write run in one transaction that locks the
 * groups, so concurrent reorders are serialized and the later one gets `order_changed`. The groups
 * keep the priority numbers they hold, in the new order. Emits one audit event per group whose
 * position changed, once committed.
 */
export async function setSharedUsageLimitOrder(
  auth: Authenticator,
  {
    orderedGroupIds,
    expectedOrderedGroupIds,
    auditContext,
  }: {
    orderedGroupIds: string[];
    expectedOrderedGroupIds: string[];
    auditContext: AuditLogContext;
  }
): Promise<Result<{ orderedGroupIds: string[] }, SharedUsageLimitError>> {
  const canManage = await ensureCanManageSharedUsageLimits(auth);
  if (canManage.isErr()) {
    return canManage;
  }

  const reordered = await withTransaction(async (transaction) => {
    const groups = await GroupResource.listGroupsWithSharedUsageLimit(auth, {
      transaction,
      forUpdate: true,
    });
    const currentGroupIds = groups.map((group) => group.sId);
    if (
      expectedOrderedGroupIds.length !== currentGroupIds.length ||
      expectedOrderedGroupIds.some(
        (groupId, index) => groupId !== currentGroupIds[index]
      )
    ) {
      return new Err(
        new SharedUsageLimitError(
          "order_changed",
          "The order of the groups changed since it was loaded."
        )
      );
    }

    const groupById = new Map(groups.map((group) => [group.sId, group]));
    const orderedGroups = removeNulls(
      orderedGroupIds.map((groupId) => groupById.get(groupId) ?? null)
    );
    if (
      orderedGroupIds.length !== groups.length ||
      new Set(orderedGroupIds).size !== orderedGroupIds.length ||
      orderedGroups.length !== groups.length
    ) {
      return new Err(
        new SharedUsageLimitError(
          "invalid_order",
          "The order must list every group with a shared usage limit exactly once."
        )
      );
    }

    await GroupResource.reorderSharedUsageLimitPriorities(
      auth,
      orderedGroups,
      transaction
    );
    return new Ok({ currentGroupIds, orderedGroups });
  });
  if (reordered.isErr()) {
    return reordered;
  }
  const { currentGroupIds, orderedGroups } = reordered.value;
  const previousPositionByGroupId = new Map(
    currentGroupIds.map((groupId, index) => [groupId, index + 1])
  );

  const workspace = auth.getNonNullableWorkspace();
  for (const [index, group] of orderedGroups.entries()) {
    const position = index + 1;
    const previousPosition = previousPositionByGroupId.get(group.sId);
    if (position === previousPosition) {
      continue;
    }
    void emitAuditLogEvent({
      auth,
      action: "group.shared_usage_limit_priority_updated",
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("group", { sId: group.sId, name: group.name }),
      ],
      context: auditContext,
      metadata: {
        position: String(position),
        previous_position: String(previousPosition),
      },
    });
  }

  return new Ok({ orderedGroupIds });
}

/**
 * @cc [owner:rfrenoy,label:product;backend] shared-usage-limit-group-resolution
 * A member's shared usage limit group is, among their active memberships in cap-eligible groups that have a shared
 * usage limit, the one with the lowest `sharedUsageLimitPriority`. Enforcement, UI data and the first recording of
 * a message MUST resolve it through this function. Returns nothing when shared usage limits are not enabled.
 *
 * Returns each resolved member's shared usage limit group keyed by the member's sId; members without one, or whose
 * shared usage limit group the caller cannot `read`, are absent.
 */
export async function resolveSharedUsageLimitGroupsForUsers(
  auth: Authenticator,
  { users }: { users: UserResource[] }
): Promise<Map<string, GroupResource>> {
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return new Map();
  }

  const sharedUsageLimitGroupByUserModelId =
    await GroupResource.listSharedUsageLimitGroupsByUserModelId(auth, {
      userModelIds: users.map((user) => user.id),
    });

  const sharedUsageLimitGroupByUserId = new Map<string, GroupResource>();
  for (const user of users) {
    const sharedUsageLimitGroup = sharedUsageLimitGroupByUserModelId.get(
      user.id
    );
    if (sharedUsageLimitGroup) {
      sharedUsageLimitGroupByUserId.set(user.sId, sharedUsageLimitGroup);
    }
  }
  return sharedUsageLimitGroupByUserId;
}

export async function resolveSharedUsageLimitGroupForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<GroupResource | null> {
  const sharedUsageLimitGroups = await resolveSharedUsageLimitGroupsForUsers(
    auth,
    {
      users: [user],
    }
  );
  return sharedUsageLimitGroups.get(user.sId) ?? null;
}

/**
 * @cc [owner:rfrenoy,label:security;product] shared-usage-limit-group-read-scope
 * Workspace admins and workspace managers MAY see every member's shared usage limit group; anyone else MUST only
 * see the groups on which they hold `read_usage` (group managers). A member whose group they hold no `read_usage`
 * on maps to null, which only reveals that they draw from another group. Members without one, or whose group the
 * caller cannot `read` (see `resolveSharedUsageLimitGroupsForUsers`), are absent.
 */
export async function resolveReadableSharedUsageLimitGroupsForUsers(
  auth: Authenticator,
  { users }: { users: UserResource[] }
): Promise<Map<string, GroupResource | null>> {
  const sharedUsageLimitGroupByUserId =
    await resolveSharedUsageLimitGroupsForUsers(auth, { users });
  if (auth.isManager() || sharedUsageLimitGroupByUserId.size === 0) {
    return sharedUsageLimitGroupByUserId;
  }

  const readableGroupModelIds = new Set(
    (await listGroupsWithVerb(auth, "read_usage")).map((group) => group.id)
  );
  return new Map(
    [...sharedUsageLimitGroupByUserId].map(([userId, group]) => [
      userId,
      readableGroupModelIds.has(group.id) ? group : null,
    ])
  );
}

/**
 * Whether the member's shared usage limit group has used its whole limit for the current cycle. Fails open (not
 * blocked) when the cycle or the counter cannot be read.
 */
export async function isGroupSharedUsageLimitReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  const sharedUsageLimitGroup = await resolveSharedUsageLimitGroupForUser(
    auth,
    { user }
  );
  if (
    !sharedUsageLimitGroup ||
    sharedUsageLimitGroup.sharedUsageLimitAwuCredits === null
  ) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readGroupSharedUsageCount(auth, {
    group: sharedUsageLimitGroup,
    bounds,
  });
  if (count === null) {
    logger.warn(
      { workspaceId: workspace.sId, groupId: sharedUsageLimitGroup.sId },
      "[SharedUsageLimit] Failed to read shared usage limit count; allowing message"
    );
    return false;
  }

  return (
    count >=
    roundCreditsToMicroCredits(sharedUsageLimitGroup.sharedUsageLimitAwuCredits)
  );
}

export async function recordGroupSharedUsage(
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
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return;
  }

  const agentMessage =
    await ConversationResource.fetchAgentMessageSharedUsageLimitGroup(auth, {
      agentMessageId,
    });
  if (!agentMessage) {
    return;
  }

  let sharedUsageLimitGroup: GroupResource | null;
  if (agentMessage.sharedUsageLimitGroupModelId !== null) {
    const [storedGroup] = await GroupResource.dangerouslyFetchByModelIds(auth, [
      agentMessage.sharedUsageLimitGroupModelId,
    ]);
    sharedUsageLimitGroup = storedGroup ?? null;
  } else {
    sharedUsageLimitGroup = await resolveSharedUsageLimitGroupForUser(auth, {
      user,
    });
    if (sharedUsageLimitGroup) {
      await ConversationResource.setAgentMessageSharedUsageLimitGroup(auth, {
        agentMessageModelId: agentMessage.agentMessageModelId,
        sharedUsageLimitGroupModelId: sharedUsageLimitGroup.id,
      });
    }
  }
  if (!sharedUsageLimitGroup) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await readGroupSharedUsageCount(auth, {
    group: sharedUsageLimitGroup,
    bounds,
  });

  await addFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(
      workspace,
      sharedUsageLimitGroup
    ),
    bounds,
    incrementBy: roundCreditsToMicroCredits(incrementBy),
    logger,
  });
}

type SharedUsageLimitGroupConsumedBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type SharedUsageLimitGroupConsumedAggs = {
  by_shared_usage_limit_group?: estypes.AggregationsMultiBucketAggregateBase<SharedUsageLimitGroupConsumedBucket>;
};

/**
 * Microcredits consumed this billing cycle by the messages recorded to each shared usage limit group, keyed by
 * group sId (groups without consumption are absent). Returns null when the cycle or the analytics
 * index cannot be read, so callers never mistake a failed read for zero usage.
 */
async function fetchConsumedMicroCreditsBySharedUsageLimitGroupId({
  workspace,
  groupIds,
  cycle,
}: {
  workspace: LightWorkspaceType;
  groupIds: string[];
  cycle?: BillingCycle;
}): Promise<Map<string, number> | null> {
  if (groupIds.length === 0) {
    return new Map();
  }

  const resolvedCycle = cycle ?? (await resolveMetronomeCycle(workspace));
  if (!resolvedCycle) {
    return null;
  }
  const { cycleStart, cycleEnd } = resolvedCycle;

  const result = await searchConsumptionAnalytics<
    never,
    SharedUsageLimitGroupConsumedAggs
  >(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { "user.shared_usage_limit_group_id": groupIds } },
          {
            range: {
              completed_at: {
                gte: cycleStart.toISOString(),
                lte: cycleEnd.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: {
        by_shared_usage_limit_group: {
          terms: {
            field: "user.shared_usage_limit_group_id",
            size: Math.max(1, groupIds.length),
          },
          aggs: { credits: { sum: { field: "credit_micro" } } },
        },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[SharedUsageLimit] Failed to read per-limit-group consumed credits from analytics index"
    );
    return null;
  }

  const consumedByGroupId = new Map<string, number>();
  for (const bucket of bucketsToArray<SharedUsageLimitGroupConsumedBucket>(
    result.value.aggregations?.by_shared_usage_limit_group?.buckets
  )) {
    consumedByGroupId.set(
      String(bucket.key),
      Math.round(bucket.credits?.value ?? 0)
    );
  }
  return consumedByGroupId;
}

/**
 * Reads a group's limit counter (microcredits) for the cycle, seeding it from the analytics index
 * when it reads as 0 (absent key: new cycle, eviction). Returns null on a Redis read error.
 */
export async function readGroupSharedUsageCount(
  auth: Authenticator,
  { group, bounds }: { group: GroupResource; bounds: FixedWindowBounds }
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();
  return readFixedWindowCountWithLazySeed({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds,
    logger,
    fetchSeedValue: async () => {
      const consumedByGroupId =
        await fetchConsumedMicroCreditsBySharedUsageLimitGroupId({
          workspace,
          groupIds: [group.sId],
        });
      return consumedByGroupId === null
        ? null
        : (consumedByGroupId.get(group.sId) ?? 0);
    },
  });
}

/**
 * @cc [owner:rfrenoy,label:security;product] group-shared-usage-read-scope
 * Workspace admins and workspace managers MAY read the shared usage of every limited group; anyone
 * else MUST only get the limited groups on which they hold `read_usage` (group managers).
 *
 * Each limited group with its usage this cycle and its pace against the cycle, or null when shared usage limits
 * are not enabled. Reads the counters without seeding them; groups whose counter reads 0 are filled from a single
 * analytics-index query. Usage that cannot be read (or an unknown cycle) reports 0; an unknown cycle reports no
 * pace.
 */
export async function getGroupSharedUsageLimits(auth: Authenticator): Promise<
  | {
      group: GroupResource;
      usedAwuCredits: number;
      usageTarget: CreditUsageTarget | null;
    }[]
  | null
> {
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return null;
  }

  const [limitedGroups, readableGroups, bounds, cycle] = await Promise.all([
    GroupResource.listGroupsWithSharedUsageLimit(auth),
    auth.isManager() ? null : listGroupsWithVerb(auth, "read_usage"),
    resolveSpendLimitCycleBounds(auth.getNonNullableWorkspace()),
    resolveMetronomeCycle(auth.getNonNullableWorkspace()),
  ]);
  const readableGroupModelIds = readableGroups
    ? new Set(readableGroups.map((group) => group.id))
    : null;
  const groups = readableGroupModelIds
    ? limitedGroups.filter((group) => readableGroupModelIds.has(group.id))
    : limitedGroups;

  const workspace = auth.getNonNullableWorkspace();
  const countByGroupId = new Map<string, number>();
  if (bounds) {
    const counts = await concurrentExecutor(
      groups,
      async (group) => {
        const count = await getFixedWindowCount({
          key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(
            workspace,
            group
          ),
          bounds,
        });
        return { groupId: group.sId, count: count.isOk() ? count.value : 0 };
      },
      { concurrency: 8 }
    );
    for (const { groupId, count } of counts) {
      if (count > 0) {
        countByGroupId.set(groupId, count);
      }
    }

    const uncountedGroupIds = groups
      .map((group) => group.sId)
      .filter((groupId) => !countByGroupId.has(groupId));
    const consumedByGroupId =
      await fetchConsumedMicroCreditsBySharedUsageLimitGroupId({
        workspace,
        groupIds: uncountedGroupIds,
      });
    for (const [groupId, consumed] of consumedByGroupId ?? []) {
      countByGroupId.set(groupId, consumed);
    }
  }

  const nowMs = Date.now();
  return groups.map((group) => {
    const usedAwuCredits = microCreditsToCredits(
      countByGroupId.get(group.sId) ?? 0
    );
    const usageTarget =
      bounds && cycle
        ? (computeCreditUsageStatus({
            consumedAwuCredits: usedAwuCredits,
            limitAwuCredits: group.sharedUsageLimitAwuCredits ?? 0,
            billingCycle: cycle,
            nowMs,
          })?.target ?? null)
        : null;
    return { group, usedAwuCredits, usageTarget };
  });
}

/**
 * Overwrites each limited group's counter for the current cycle with its analytics-index total.
 * Skips the write entirely when the index cannot be read, so an outage never erases live counters.
 */
export async function resyncGroupSharedUsageCountersFromEsUsage(
  auth: Authenticator
): Promise<Result<{ updatedGroupCount: number }, Error>> {
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return new Ok({ updatedGroupCount: 0 });
  }

  const groups = await GroupResource.listGroupsWithSharedUsageLimit(auth);
  if (groups.length === 0) {
    return new Ok({ updatedGroupCount: 0 });
  }

  const workspace = auth.getNonNullableWorkspace();
  const cycle = await resolveMetronomeCycle(workspace);
  if (!cycle) {
    return new Err(
      new Error("No active Metronome billing period to resync against.")
    );
  }

  const consumedByGroupId =
    await fetchConsumedMicroCreditsBySharedUsageLimitGroupId({
      workspace,
      groupIds: groups.map((group) => group.sId),
      cycle,
    });
  if (consumedByGroupId === null) {
    return new Err(
      new Error(
        "Failed to read group consumption from Elasticsearch; skipped resync to avoid erasing the counters."
      )
    );
  }

  const bounds = makeSpendLimitCycleWindowBounds(
    cycle.cycleStart,
    cycle.cycleEnd
  );
  const results = await concurrentExecutor(
    groups,
    async (group) => {
      const setResult = await setFixedWindowCount({
        key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(
          workspace,
          group
        ),
        bounds,
        value: consumedByGroupId.get(group.sId) ?? 0,
        logger,
      });
      return setResult.isOk();
    },
    { concurrency: 8 }
  );

  return new Ok({ updatedGroupCount: results.filter(Boolean).length });
}
