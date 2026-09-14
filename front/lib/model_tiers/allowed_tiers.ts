import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { isModelTierOverrideGroupKind } from "@app/lib/model_tiers/group_kinds";
import { resolveAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import {
  DEFAULT_MAX_MODEL_TIER,
  expandTiersUpTo,
  getMaxTierName,
} from "@app/lib/model_tiers/tier_order";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  GroupAllowedModelTiersType,
  UserAllowedModelTiersType,
} from "@app/types/api/model_tiers";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getTier,
  MODELS_TIER_NAMES,
  MODELS_TIERS,
} from "@app/types/assistant/models/model_tiers";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

export type {
  ModelTierResolutionSource,
  ResolvedAllowedModelTiers,
} from "@app/lib/model_tiers/resolve_allowed";
export type {
  ModelsTierDefinition,
  ModelsTierName,
  ModelTierSelection,
} from "@app/types/assistant/models/model_tiers";

const MODELS_TIER_GRANT_TYPE = "use" as const;
const MODELS_TIER_RESOURCE_TYPE = "models_tier" as const;

interface ModelsTierUserGrantSpec {
  user: UserType;
  tierName: ModelsTierName;
  transaction?: Transaction;
}

interface ModelsTierGroupGrantSpec {
  group: GroupResource;
  tierName: ModelsTierName;
  transaction?: Transaction;
}

function assertIsAdmin(auth: Authenticator): void {
  assert(auth.isAdmin(), "Only admins can manage allowed model tiers.");
}

function getTierResourceId(tierName: ModelsTierName): number {
  const tier = getTier(tierName);
  assert(tier, `Unknown models tier: ${tierName}`);
  return tier.id;
}

function tierNameFromResourceId(resourceId: number): ModelsTierName | null {
  return MODELS_TIERS.find((tier) => tier.id === resourceId)?.name ?? null;
}

async function listAllTierGrantRows(auth: Authenticator) {
  return GroupPermissionModel.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: { [Op.gt]: 0 },
    },
  });
}

function expandExplicitTierNames(
  tierNames: readonly ModelsTierName[]
): ModelsTierName[] {
  const maxTierName = getMaxTierName(tierNames);
  if (!maxTierName) {
    return [];
  }

  return expandTiersUpTo(maxTierName);
}

async function clearWorkspaceTierGrants(auth: Authenticator): Promise<void> {
  for (const tierName of MODELS_TIER_NAMES) {
    await GroupPermissionResource.revokeFromEverybody(auth, {
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: getTierResourceId(tierName),
    });
  }
}

async function clearUserTierGrants(
  auth: Authenticator,
  user: UserType
): Promise<void> {
  for (const tierName of MODELS_TIER_NAMES) {
    await revokeFromUser(auth, { user, tierName });
  }
}

async function clearGroupTierGrants(
  auth: Authenticator,
  group: GroupResource
): Promise<void> {
  for (const tierName of MODELS_TIER_NAMES) {
    await revokeFromGroup(auth, { group, tierName });
  }
}

async function getWorkspaceMaxAllowedTierName(
  auth: Authenticator
): Promise<ModelsTierName> {
  const explicit = await getExplicitWorkspaceTierNames(auth);
  return getMaxTierName(explicit) ?? DEFAULT_MAX_MODEL_TIER;
}

async function getExplicitWorkspaceTierNames(
  auth: Authenticator
): Promise<ModelsTierName[]> {
  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isErr()) {
    return [];
  }
  const globalGroup = globalGroupRes.value;

  const grants = await GroupPermissionResource.listForGroups(
    auth.getNonNullableWorkspace(),
    {
      groupModelIds: [globalGroup.id],
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
    }
  );

  return grants.flatMap((grant) => {
    const tierName = tierNameFromResourceId(grant.resourceId);
    return tierName ? [tierName] : [];
  });
}

async function grantToUser(
  auth: Authenticator,
  { user, tierName, transaction }: ModelsTierUserGrantSpec
): Promise<Result<undefined, Error>> {
  return GroupPermissionResource.grantToUser(auth, {
    user,
    grantType: MODELS_TIER_GRANT_TYPE,
    resourceType: MODELS_TIER_RESOURCE_TYPE,
    resourceId: getTierResourceId(tierName),
    transaction,
  });
}

async function revokeFromUser(
  auth: Authenticator,
  { user, tierName, transaction }: ModelsTierUserGrantSpec
): Promise<Result<undefined, Error>> {
  return GroupPermissionResource.revokeFromUser(auth, {
    user,
    grantType: MODELS_TIER_GRANT_TYPE,
    resourceType: MODELS_TIER_RESOURCE_TYPE,
    resourceId: getTierResourceId(tierName),
    transaction,
  });
}

async function grantToGroup(
  auth: Authenticator,
  { group, tierName, transaction }: ModelsTierGroupGrantSpec
): Promise<void> {
  await GroupPermissionResource.grant(auth, {
    group,
    grantType: MODELS_TIER_GRANT_TYPE,
    resourceType: MODELS_TIER_RESOURCE_TYPE,
    resourceId: getTierResourceId(tierName),
    transaction,
  });
}

async function revokeFromGroup(
  auth: Authenticator,
  { group, tierName, transaction }: ModelsTierGroupGrantSpec
): Promise<void> {
  await GroupPermissionResource.revoke(auth, {
    group,
    grantType: MODELS_TIER_GRANT_TYPE,
    resourceType: MODELS_TIER_RESOURCE_TYPE,
    resourceId: getTierResourceId(tierName),
    transaction,
  });
}

export async function setUserMaxAllowedTier(
  auth: Authenticator,
  { userId, tierName }: { userId: string; tierName: ModelsTierName }
): Promise<
  Result<
    undefined,
    DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
  >
> {
  assertIsAdmin(auth);

  const workspace = auth.getNonNullableWorkspace();
  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Err(new DustError("user_not_found", "User not found."));
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err(
      new DustError(
        "user_not_member",
        "User is not an active member of the workspace."
      )
    );
  }

  const userJson = user.toJSON();
  await clearUserTierGrants(auth, userJson);

  const result = await grantToUser(auth, {
    user: userJson,
    tierName,
  });
  if (result.isErr()) {
    return new Err(
      new DustError("invalid_request_error", result.error.message)
    );
  }

  return new Ok(undefined);
}

export async function clearUserMaxAllowedTier(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<
  Result<
    undefined,
    DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
  >
> {
  assertIsAdmin(auth);

  const workspace = auth.getNonNullableWorkspace();
  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Err(new DustError("user_not_found", "User not found."));
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err(
      new DustError(
        "user_not_member",
        "User is not an active member of the workspace."
      )
    );
  }

  await clearUserTierGrants(auth, user.toJSON());

  return new Ok(undefined);
}

export async function setGroupMaxAllowedTier(
  auth: Authenticator,
  { groupId, tierName }: { groupId: string; tierName: ModelsTierName }
): Promise<
  Result<
    undefined,
    DustError<
      | "invalid_request_error"
      | "group_not_found"
      | "invalid_id"
      | "unauthorized"
    >
  >
> {
  assertIsAdmin(auth);

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return groupRes;
  }
  if (!isModelTierOverrideGroupKind(groupRes.value.kind)) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Model tier overrides only apply to provisioned or manual groups."
      )
    );
  }

  await clearGroupTierGrants(auth, groupRes.value);
  await grantToGroup(auth, {
    group: groupRes.value,
    tierName,
  });

  return new Ok(undefined);
}

export async function clearGroupMaxAllowedTier(
  auth: Authenticator,
  { groupId }: { groupId: string }
): Promise<
  Result<
    undefined,
    DustError<
      | "invalid_request_error"
      | "group_not_found"
      | "invalid_id"
      | "unauthorized"
    >
  >
> {
  assertIsAdmin(auth);

  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return groupRes;
  }

  await clearGroupTierGrants(auth, groupRes.value);

  return new Ok(undefined);
}

export async function listWorkspaceAllowedTierNames(
  auth: Authenticator
): Promise<ModelsTierName[]> {
  assertIsAdmin(auth);
  return loadWorkspaceTierGrants(auth);
}

export async function listWorkspaceMaxAllowedTierName(
  auth: Authenticator
): Promise<ModelsTierName> {
  assertIsAdmin(auth);
  return getWorkspaceMaxAllowedTierName(auth);
}

async function loadWorkspaceTierGrants(
  auth: Authenticator
): Promise<ModelsTierName[]> {
  return expandTiersUpTo(await getWorkspaceMaxAllowedTierName(auth));
}

export async function setWorkspaceMaxAllowedTierName(
  auth: Authenticator,
  maxTierName: ModelsTierName
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  assertIsAdmin(auth);

  if (!getTier(maxTierName)) {
    return new Err(
      new DustError("invalid_request_error", "Unknown models tier.")
    );
  }

  await clearWorkspaceTierGrants(auth);

  if (maxTierName !== DEFAULT_MAX_MODEL_TIER) {
    await GroupPermissionResource.grantToEverybody(auth, {
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: getTierResourceId(maxTierName),
    });
  }

  return new Ok(undefined);
}

export async function listUserAllowedTierNames(
  auth: Authenticator
): Promise<UserAllowedModelTiersType[]> {
  assertIsAdmin(auth);

  const rows = await listAllTierGrantRows(auth);
  if (rows.length === 0) {
    return [];
  }

  const groupIds = [...new Set(rows.map((row) => row.groupId))];
  const groups = await GroupResource.dangerouslyFetchByModelIds(auth, groupIds);
  const autoGroups = groups.filter(
    (group) =>
      group.kind === "regular_auto" &&
      group.name.startsWith("Group for permission ")
  );
  if (autoGroups.length === 0) {
    return [];
  }

  const autoGroupIds = new Set(autoGroups.map((group) => group.id));
  const tiersByGroupId = new Map<ModelId, ModelsTierName[]>();
  for (const row of rows) {
    if (!autoGroupIds.has(row.groupId)) {
      continue;
    }
    const tierName = tierNameFromResourceId(row.resourceId);
    if (!tierName) {
      continue;
    }
    const tiers = tiersByGroupId.get(row.groupId) ?? [];
    tiers.push(tierName);
    tiersByGroupId.set(row.groupId, tiers);
  }

  const tiersByUserModelId = new Map<ModelId, Set<ModelsTierName>>();
  for (const group of autoGroups) {
    const tiers = tiersByGroupId.get(group.id) ?? [];
    if (tiers.length === 0) {
      continue;
    }
    const members = await group.getActiveMembers(auth);
    for (const member of members) {
      const existing = tiersByUserModelId.get(member.id) ?? new Set();
      for (const tier of tiers) {
        existing.add(tier);
      }
      tiersByUserModelId.set(member.id, existing);
    }
  }

  const users = await UserResource.fetchByModelIds([
    ...tiersByUserModelId.keys(),
  ]);

  return users.flatMap((user) => {
    const rawTierNames = [...(tiersByUserModelId.get(user.id) ?? new Set())];
    const maxTierName = getMaxTierName(rawTierNames);
    if (!maxTierName) {
      return [];
    }

    return [
      {
        userId: user.sId,
        maxTierName,
      },
    ];
  });
}

export async function listGroupAllowedTierNames(
  auth: Authenticator
): Promise<GroupAllowedModelTiersType[]> {
  assertIsAdmin(auth);

  const workspace = auth.getNonNullableWorkspace();
  const rows = await listAllTierGrantRows(auth);
  if (rows.length === 0) {
    return [];
  }

  const groupIds = [...new Set(rows.map((row) => row.groupId))];
  const groups = await GroupResource.dangerouslyFetchByModelIds(auth, groupIds);
  const overrideGroups = groups.filter((group) =>
    isModelTierOverrideGroupKind(group.kind)
  );

  const tiersByGroupId = new Map<ModelId, ModelsTierName[]>();
  for (const row of rows) {
    const tierName = tierNameFromResourceId(row.resourceId);
    if (!tierName) {
      continue;
    }
    const tiers = tiersByGroupId.get(row.groupId) ?? [];
    tiers.push(tierName);
    tiersByGroupId.set(row.groupId, tiers);
  }

  return overrideGroups.flatMap((group) => {
    const rawTierNames = tiersByGroupId.get(group.id);
    if (!rawTierNames || rawTierNames.length === 0) {
      return [];
    }

    const maxTierName = getMaxTierName(rawTierNames);
    if (!maxTierName) {
      return [];
    }

    return [
      {
        groupId: makeSId("group", {
          id: group.id,
          workspaceId: workspace.id,
        }),
        maxTierName,
      },
    ];
  });
}

async function loadUserOverrideTierGrants({
  auth,
  user,
}: {
  auth: Authenticator;
  user: UserResource;
}): Promise<ModelsTierName[]> {
  const rows = await listAllTierGrantRows(auth);
  if (rows.length === 0) {
    return [];
  }

  const groupIds = [...new Set(rows.map((row) => row.groupId))];
  const groups = await GroupResource.dangerouslyFetchByModelIds(auth, groupIds);
  const autoGroups = groups.filter(
    (group) =>
      group.kind === "regular_auto" &&
      group.name.startsWith("Group for permission ")
  );

  const tierNames = new Set<ModelsTierName>();
  for (const group of autoGroups) {
    const isMember = await group.isMember(user);
    if (!isMember) {
      continue;
    }

    for (const row of rows) {
      if (row.groupId !== group.id) {
        continue;
      }
      const tierName = tierNameFromResourceId(row.resourceId);
      if (tierName) {
        tierNames.add(tierName);
      }
    }
  }

  return expandExplicitTierNames([...tierNames]);
}

async function listUserModelTierOverrideGroupModelIds(
  auth: Authenticator
): Promise<ModelId[]> {
  const groupModelIds = auth.groupModelIds();
  if (groupModelIds.length === 0) {
    return [];
  }

  const groups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    groupModelIds
  );
  return groups
    .filter((group) => isModelTierOverrideGroupKind(group.kind))
    .map((group) => group.id);
}

async function loadGroupOverrideTierGrants({
  auth,
  groupModelIds,
}: {
  auth: Authenticator;
  groupModelIds: ModelId[];
}): Promise<Map<ModelId, ModelsTierName[]>> {
  if (groupModelIds.length === 0) {
    return new Map();
  }

  const grants = await GroupPermissionResource.listForGroups(
    auth.getNonNullableWorkspace(),
    {
      groupModelIds,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
    }
  );

  const tiersByGroupId = new Map<ModelId, ModelsTierName[]>();
  for (const grant of grants) {
    const tierName = tierNameFromResourceId(grant.resourceId);
    if (!tierName) {
      continue;
    }
    const tiers = tiersByGroupId.get(grant.groupId) ?? [];
    tiers.push(tierName);
    tiersByGroupId.set(grant.groupId, tiers);
  }

  const expandedTiersByGroupId = new Map<ModelId, ModelsTierName[]>();
  for (const [groupId, rawTierNames] of tiersByGroupId) {
    expandedTiersByGroupId.set(groupId, expandExplicitTierNames(rawTierNames));
  }

  return expandedTiersByGroupId;
}

export async function resolveAllowedTierNames(auth: Authenticator) {
  const user = auth.user();

  const [workspaceTierGrants, userOverrideTierGrants, groupModelIds] =
    await Promise.all([
      loadWorkspaceTierGrants(auth),
      user
        ? loadUserOverrideTierGrants({
            auth,
            user,
          })
        : Promise.resolve([]),
      listUserModelTierOverrideGroupModelIds(auth),
    ]);

  const groupOverrideTierGrantsByGroupId =
    groupModelIds.length > 0
      ? await loadGroupOverrideTierGrants({
          auth,
          groupModelIds,
        })
      : new Map<ModelId, ModelsTierName[]>();

  const groupOverrideTierGrantsList = groupModelIds.map(
    (groupModelId) => groupOverrideTierGrantsByGroupId.get(groupModelId) ?? []
  );

  return resolveAllowedModelTiers({
    workspaceAllowedTierNames: workspaceTierGrants,
    groupAllowedTierNamesList: groupOverrideTierGrantsList,
    userAllowedTierNames: userOverrideTierGrants,
  });
}
