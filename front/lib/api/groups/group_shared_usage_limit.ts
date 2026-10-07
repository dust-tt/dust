import {
  makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { resolveMetronomeCycle } from "@app/lib/api/credits/members_usage";
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
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  getFixedWindowCount,
  readFixedWindowCountWithLazySeed,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  SharedUsageLimit,
  SetSharedUsageLimitResponse,
} from "@app/types/api/groups/shared_usage_limit";
import { isCapEligibleGroupKind } from "@app/types/groups";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

export const MIN_SHARED_USAGE_LIMIT_AWU_CREDITS = 0;
export const MAX_SHARED_USAGE_LIMIT_AWU_CREDITS = 100_000_000;

type SharedUsageLimitErrorType =
  | "shared_usage_limits_not_enabled"
  | "group_not_found"
  | "invalid_group_kind"
  | "invalid_threshold"
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
 * @cc [owner:rfrenoy,label:product;security] group-shared-usage-limit-admin-only-edit
 * Only workspace admins MAY set or remove a shared usage limit. Group managers' `set_usage_limits`
 * MUST NOT grant it (it only covers the per-member limit).
 */
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
  if (!auth.isAdmin()) {
    return new Err(
      new SharedUsageLimitError(
        "unauthorized",
        "Only workspace admins can change shared usage limits."
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

  const previousAwuCredits = group.sharedUsageLimitAwuCredits;

  await group.updateSharedUsageLimit(
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

/**
 * @cc [owner:rfrenoy,label:product;backend] shared-limit-group-resolution
 * A member's shared limit group is, among their active memberships in cap-eligible groups that have a shared
 * usage limit, the one with the lowest `sharedUsageLimitPriority`. Enforcement, UI data and the first recording of
 * a message MUST resolve it through this function. Returns nothing when shared usage limits are not enabled.
 *
 * Returns each resolved member's shared limit group keyed by the member's sId; members without one, or whose
 * shared limit group the caller cannot `read`, are absent.
 */
export async function resolveSharedLimitGroupsForUsers(
  auth: Authenticator,
  { users }: { users: UserResource[] }
): Promise<Map<string, GroupResource>> {
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return new Map();
  }

  const sharedLimitGroupByUserModelId =
    await GroupResource.listSharedLimitGroupByUserModelIdInWorkspace(auth, {
      userModelIds: users.map((user) => user.id),
    });

  const sharedLimitGroupByUserId = new Map<string, GroupResource>();
  for (const user of users) {
    const sharedLimitGroup = sharedLimitGroupByUserModelId.get(user.id);
    if (sharedLimitGroup) {
      sharedLimitGroupByUserId.set(user.sId, sharedLimitGroup);
    }
  }
  return sharedLimitGroupByUserId;
}

export async function resolveSharedLimitGroupForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<GroupResource | null> {
  const sharedLimitGroups = await resolveSharedLimitGroupsForUsers(auth, {
    users: [user],
  });
  return sharedLimitGroups.get(user.sId) ?? null;
}

/**
 * Whether the member's shared limit group has used its whole limit for the current cycle. Fails open (not
 * blocked) when the cycle or the counter cannot be read.
 */
export async function isGroupSharedUsageLimitReached(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<boolean> {
  const sharedLimitGroup = await resolveSharedLimitGroupForUser(auth, { user });
  if (
    !sharedLimitGroup ||
    sharedLimitGroup.sharedUsageLimitAwuCredits === null
  ) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readGroupSharedUsageCount(auth, {
    group: sharedLimitGroup,
    bounds,
  });
  if (count === null) {
    logger.warn(
      { workspaceId: workspace.sId, groupId: sharedLimitGroup.sId },
      "[SharedUsageLimit] Failed to read shared usage limit count; allowing message"
    );
    return false;
  }

  return (
    count >=
    roundCreditsToMicroCredits(sharedLimitGroup.sharedUsageLimitAwuCredits)
  );
}

export async function recordSharedUsageLimitWithUsage(
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
    await ConversationResource.fetchAgentMessageSharedLimitGroup(auth, {
      agentMessageId,
    });
  if (!agentMessage) {
    return;
  }

  let sharedLimitGroup: GroupResource | null;
  if (agentMessage.sharedLimitGroupModelId !== null) {
    const [storedGroup] = await GroupResource.dangerouslyFetchByModelIds(auth, [
      agentMessage.sharedLimitGroupModelId,
    ]);
    sharedLimitGroup = storedGroup ?? null;
  } else {
    sharedLimitGroup = await resolveSharedLimitGroupForUser(auth, { user });
    if (sharedLimitGroup) {
      await ConversationResource.setAgentMessageSharedLimitGroup(auth, {
        agentMessageModelId: agentMessage.agentMessageModelId,
        sharedLimitGroupModelId: sharedLimitGroup.id,
      });
    }
  }
  if (!sharedLimitGroup) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await readGroupSharedUsageCount(auth, { group: sharedLimitGroup, bounds });

  await addFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(
      workspace,
      sharedLimitGroup
    ),
    bounds,
    incrementBy: roundCreditsToMicroCredits(incrementBy),
    logger,
  });
}

type SharedLimitGroupConsumedBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type SharedLimitGroupConsumedAggs = {
  by_shared_limit_group?: estypes.AggregationsMultiBucketAggregateBase<SharedLimitGroupConsumedBucket>;
};

/**
 * Microcredits consumed this billing cycle by the messages recorded to each shared limit group, keyed by
 * group sId (groups without consumption are absent). Returns null when the cycle or the analytics
 * index cannot be read, so callers never mistake a failed read for zero usage.
 */
async function fetchConsumedMicroCreditsBySharedLimitGroupId({
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
    SharedLimitGroupConsumedAggs
  >(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { "user.shared_limit_group_id": groupIds } },
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
        by_shared_limit_group: {
          terms: {
            field: "user.shared_limit_group_id",
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
  for (const bucket of bucketsToArray<SharedLimitGroupConsumedBucket>(
    result.value.aggregations?.by_shared_limit_group?.buckets
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
        await fetchConsumedMicroCreditsBySharedLimitGroupId({
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
 * Each limited group with its usage this cycle, or null when shared usage limits are not enabled. Reads
 * the counters without seeding them; groups whose counter reads 0 are filled from a single
 * analytics-index query. Usage that cannot be read (or an unknown cycle) reports 0.
 */
export async function getGroupSharedUsageLimits(
  auth: Authenticator
): Promise<{ group: GroupResource; usedAwuCredits: number }[] | null> {
  if (!(await areGroupSharedUsageLimitsEnabled(auth))) {
    return null;
  }

  const [groups, bounds] = await Promise.all([
    GroupResource.listGroupsWithSharedUsageLimit(auth),
    resolveSpendLimitCycleBounds(auth.getNonNullableWorkspace()),
  ]);

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
      await fetchConsumedMicroCreditsBySharedLimitGroupId({
        workspace,
        groupIds: uncountedGroupIds,
      });
    for (const [groupId, consumed] of consumedByGroupId ?? []) {
      countByGroupId.set(groupId, consumed);
    }
  }

  return groups.map((group) => ({
    group,
    usedAwuCredits: microCreditsToCredits(countByGroupId.get(group.sId) ?? 0),
  }));
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

  const consumedByGroupId = await fetchConsumedMicroCreditsBySharedLimitGroupId(
    {
      workspace,
      groupIds: groups.map((group) => group.sId),
      cycle,
    }
  );
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
