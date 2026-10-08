import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  setApiKeySpendLimit,
} from "@app/lib/api/keys/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { isCapEligibleGroupKind } from "@app/types/groups";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MAX_API_KEY_CREATION_PER_DAY = 30;

type CreateApiKeyErrorCode =
  | "invalid_request_error"
  | "name_conflict"
  | "unauthorized"
  | "group_not_found"
  | "admin_key_analytics_groups_not_allowed"
  | "analytics_group_kind_not_supported"
  | "limit_reached"
  | "metronome_error";

/**
 * A key always carries the workspace global group, so it can reach everything
 * every workspace member can reach; in addition, it carries the member groups
 * of the spaces it is scoped to, which is what grants it write on them.
 */
/**
 * @cc [owner:fabiencelier,label:product;security] scopable-spaces
 * `spaceIds` MUST resolve, in the workspace, to `regular`, `project` or `global` spaces only,
 * open or restricted. Any other id (unknown, deleted, `system`, `conversations`) MUST fail with
 * `unauthorized`. A resolved space without a `regular_auto` group MUST fail with
 * `group_not_found`. On failure no group beyond the workspace global group is returned.
 */
/**
 * @cc [owner:fabiencelier,label:security] scoped-groups
 * The returned groups are exactly the workspace global group plus the `regular_auto` groups of the
 * requested spaces; a pod's editor group is included only when `role` is `admin`. The workspace
 * global group MUST never be counted as a scoped group.
 */
async function resolveApiKeyGroups(
  auth: Authenticator,
  { spaceIds, role }: { spaceIds: string[]; role: "user" | "admin" }
): Promise<Result<GroupResource[], DustError<CreateApiKeyErrorCode>>> {
  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isErr()) {
    return new Err(new DustError("group_not_found", "Global group not found"));
  }
  const globalGroup = globalGroupRes.value;

  const resolvedGroups: GroupResource[] = [globalGroup];

  const requestedSpaceIds = [...new Set(spaceIds)];
  if (requestedSpaceIds.length > 0) {
    const spaces = await SpaceResource.fetchByIds(auth, requestedSpaceIds);
    const scopableSpaces = spaces.filter(
      (space) => space.isRegular() || space.isProject() || space.isGlobal()
    );

    if (scopableSpaces.length !== requestedSpaceIds.length) {
      return new Err(
        new DustError(
          "unauthorized",
          "An API key can only be scoped to spaces, pods or the global space."
        )
      );
    }

    const spaceGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
      auth,
      scopableSpaces,
      {
        includeEditors: role === "admin",
      }
    );

    // Every space owns at least one regular_auto group (its member group) and no two spaces share
    // one, so fewer groups than spaces means a space has none: the key could not write on it.
    // Company Data gets its member group at workspace creation or through the
    // `20260908_backfill_global_space_member_group` migration.
    if (spaceGroups.length < scopableSpaces.length) {
      return new Err(
        new DustError(
          "group_not_found",
          "A requested space has no member group to scope the key to."
        )
      );
    }

    resolvedGroups.push(...spaceGroups);
  }

  return new Ok(resolvedGroups);
}

/**
 * @cc [owner:fabiencelier,label:security;product] analytics-groups
 * `analyticsGroupIds` MUST be empty for an `admin` key, which already reads every group's analytics,
 * and fail with otherwise. Every id MUST resolve in the workspace to a manual or provisioned group.
 */
async function resolveAnalyticsGroups(
  auth: Authenticator,
  {
    analyticsGroupIds,
    role,
  }: { analyticsGroupIds: string[]; role: "user" | "admin" }
): Promise<Result<GroupResource[], DustError<CreateApiKeyErrorCode>>> {
  const groupIds = [...new Set(analyticsGroupIds)];
  if (groupIds.length === 0) {
    return new Ok([]);
  }
  if (role === "admin") {
    return new Err(
      new DustError(
        "admin_key_analytics_groups_not_allowed",
        "An admin API key already reads the analytics of every group."
      )
    );
  }

  const groupsRes = await GroupResource.fetchByIds(auth, groupIds);
  if (groupsRes.isErr()) {
    return new Err(
      new DustError("group_not_found", "Some analytics groups were not found.")
    );
  }
  if (!groupsRes.value.every((group) => isCapEligibleGroupKind(group.kind))) {
    return new Err(
      new DustError(
        "analytics_group_kind_not_supported",
        "Analytics access can only be granted on manual or provisioned groups."
      )
    );
  }

  return new Ok(groupsRes.value);
}

/**
 * @cc [owner:fabiencelier,label:security;backend] key-created-with-analytics-access
 * The key and its `read_analytics` grants on the analytics groups MUST be created atomically: a
 * failed grant MUST leave no key behind.
 */
/**
 * Create a non-system API key for the workspace: validates the name, the spend caps and the
 * requested scope, resolves the groups the key carries, enforces the per-workspace creation rate
 * limit, then persists the key, applies the per-key credit cap and emits the audit log event.
 */
export async function createApiKey(
  auth: Authenticator,
  {
    name,
    spaceIds,
    monthlyCapMicroUsd,
    monthlyCapAwuCredits,
    role,
    analyticsGroupIds,
  }: {
    name: string;
    spaceIds: string[];
    monthlyCapMicroUsd: number | null;
    // Per-key credit cap in AWU credits (credit-priced plans only). null = unlimited.
    monthlyCapAwuCredits: number | null;
    role: "user" | "admin";
    // sIds of the groups whose analytics the key can read (non-admin keys only).
    analyticsGroupIds: string[];
  }
): Promise<Result<KeyResource, DustError<CreateApiKeyErrorCode>>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return new Err(
      new DustError("invalid_request_error", "API key name cannot be empty.")
    );
  }

  if (monthlyCapMicroUsd !== null && monthlyCapMicroUsd < 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "monthly_cap_micro_usd must be greater than or equal to 0"
      )
    );
  }

  // Per-key credit cap: only valid on credit-priced plans and within range. Validated up front so
  // we never create a key whose requested cap can't be applied.
  if (monthlyCapAwuCredits !== null) {
    const plan = auth.subscription()?.plan;
    if (!plan || !isCreditPricedPlan(plan)) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "Per-key credit spend limits are only available on credit-priced plans."
        )
      );
    }
    if (
      monthlyCapAwuCredits < MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS ||
      monthlyCapAwuCredits > MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS
    ) {
      return new Err(
        new DustError(
          "invalid_request_error",
          `monthly_cap_awu_credits must be between ` +
            `${MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS} and ` +
            `${MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS}.`
        )
      );
    }
  }

  const existingKey = await KeyResource.fetchByName(auth, {
    name: trimmedName,
    onlyActive: true,
  });
  if (existingKey) {
    return new Err(
      new DustError(
        "name_conflict",
        "An API key with this name already exists in this workspace."
      )
    );
  }

  const groupsRes = await resolveApiKeyGroups(auth, {
    spaceIds,
    role,
  });
  if (groupsRes.isErr()) {
    return groupsRes;
  }
  const resolvedGroups = groupsRes.value;

  const analyticsGroupsRes = await resolveAnalyticsGroups(auth, {
    analyticsGroupIds,
    role,
  });
  if (analyticsGroupsRes.isErr()) {
    return analyticsGroupsRes;
  }
  // Sorted so concurrent creations take the grant-tuple locks in the same order.
  const analyticsGroups = [...analyticsGroupsRes.value].sort(
    (a, b) => a.id - b.id
  );

  const remaining = await rateLimiter({
    key: `api_key_creation_${owner.sId}`,
    maxPerTimeframe: MAX_API_KEY_CREATION_PER_DAY,
    timeframeSeconds: 24 * 60 * 60, // 1 day
    logger,
  });
  if (remaining === 0) {
    return new Err(
      new DustError(
        "limit_reached",
        `You have reached the limit of ${MAX_API_KEY_CREATION_PER_DAY} API keys ` +
          "creations per day. Please try again later."
      )
    );
  }

  const key = await withTransaction(async (transaction) => {
    const key = await KeyResource.makeNew(
      {
        name: trimmedName,
        status: "active",
        userId: user.id,
        workspaceId: owner.id,
        isSystem: false,
        role,
        monthlyCapMicroUsd,
      },
      resolvedGroups,
      { transaction }
    );
    for (const group of analyticsGroups) {
      await GroupPermissionResource.grantToKey(auth, {
        key,
        grantType: "analytics_reader",
        resourceType: "group",
        resourceId: group.id,
        transaction,
      });
    }
    return key;
  });

  void emitAuditLogEvent({
    auth,
    action: "api_key.created",
    targets: [
      buildAuditLogTarget("workspace", owner),
      buildAuditLogTarget("api_key", {
        sId: String(key.id),
        name: trimmedName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      group_ids: resolvedGroups.map((g) => g.sId).join(","),
      analytics_group_ids: analyticsGroups.map((g) => g.sId).join(","),
      role,
    },
  });

  // Apply the per-key credit cap (persists the cap, creates the Metronome alert, reconciles
  // state). Validated above, so only a Metronome failure can error here.
  if (monthlyCapAwuCredits !== null) {
    const limitResult = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "limited", awuCredits: monthlyCapAwuCredits },
    });
    if (limitResult.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          keyName: trimmedName,
          err: limitResult.error,
        },
        "[Keys] Failed to apply credit cap on newly created key"
      );
      return new Err(
        new DustError(
          "metronome_error",
          `Key created but failed to set credit cap: ${limitResult.error.message}`
        )
      );
    }
  }

  // Re-read so the returned key reflects the persisted cap (`setApiKeySpendLimit` updates its own
  // resource instance).
  const created = await KeyResource.fetchByWorkspaceAndId({
    workspace: owner,
    id: key.id,
  });

  return new Ok(created ?? key);
}
