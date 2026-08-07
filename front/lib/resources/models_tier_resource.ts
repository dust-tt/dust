import type {
  ModelsTierDefinition,
  ModelsTierName,
  ModelTierSelection,
} from "@app/lib/api/assistant/token_pricing/tiers";
import {
  MODELS_TIER_NAMES,
  MODELS_TIERS,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
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
import { isStaticModelId } from "@app/types/assistant/models/models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

export type {
  ModelsTierDefinition,
  ModelsTierName,
  ModelTierSelection,
} from "@app/lib/api/assistant/token_pricing/tiers";

export type {
  ModelTierResolutionSource,
  ResolvedAllowedModelTiers,
} from "@app/lib/model_tiers/resolve_allowed";

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

export class ModelsTierResource {
  static readonly TIERS = MODELS_TIERS;

  static readonly TIER_NAMES = MODELS_TIER_NAMES;

  static listTiers(): readonly ModelsTierDefinition[] {
    return MODELS_TIERS;
  }

  static getTier(name: ModelsTierName): ModelsTierDefinition | null {
    return MODELS_TIERS.find((tier) => tier.name === name) ?? null;
  }

  static getTierForSelection(
    selection: ModelTierSelection
  ): ModelsTierName | null {
    return this.getTierForModel(selection.modelId, selection.reasoningEffort);
  }

  static getTierForModel(
    modelId: ModelTierSelection["modelId"],
    reasoningEffort: ModelTierSelection["reasoningEffort"]
  ): ModelsTierName | null {
    // includes models added at runtime on GCP (EAPs)
    if (!isStaticModelId(modelId)) {
      return "premium";
    }
    return STATIC_MODEL_TIERS[modelId][reasoningEffort] ?? null;
  }

  private static assertIsAdmin(auth: Authenticator): void {
    assert(auth.isAdmin(), "Only admins can manage allowed model tiers.");
  }

  private static getTierResourceId(tierName: ModelsTierName): number {
    const tier = this.getTier(tierName);
    assert(tier, `Unknown models tier: ${tierName}`);
    return tier.id;
  }

  private static tierNameFromResourceId(
    resourceId: number
  ): ModelsTierName | null {
    return MODELS_TIERS.find((tier) => tier.id === resourceId)?.name ?? null;
  }

  private static async listAllTierGrantRows(auth: Authenticator) {
    return GroupPermissionModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        grantType: MODELS_TIER_GRANT_TYPE,
        resourceType: MODELS_TIER_RESOURCE_TYPE,
        resourceId: { [Op.gt]: 0 },
      },
    });
  }

  private static expandExplicitTierNames(
    tierNames: readonly ModelsTierName[]
  ): ModelsTierName[] {
    const maxTierName = getMaxTierName(tierNames);
    if (!maxTierName) {
      return [];
    }

    return expandTiersUpTo(maxTierName);
  }

  private static async clearWorkspaceTierGrants(
    auth: Authenticator
  ): Promise<void> {
    for (const tierName of MODELS_TIER_NAMES) {
      await GroupPermissionResource.revokeFromEverybody(auth, {
        grantType: MODELS_TIER_GRANT_TYPE,
        resourceType: MODELS_TIER_RESOURCE_TYPE,
        resourceId: this.getTierResourceId(tierName),
      });
    }
  }

  private static async clearUserTierGrants(
    auth: Authenticator,
    user: UserType
  ): Promise<void> {
    for (const tierName of MODELS_TIER_NAMES) {
      await this.revokeFromUser(auth, { user, tierName });
    }
  }

  private static async clearGroupTierGrants(
    auth: Authenticator,
    group: GroupResource
  ): Promise<void> {
    for (const tierName of MODELS_TIER_NAMES) {
      await this.revokeFromGroup(auth, { group, tierName });
    }
  }

  private static async getWorkspaceMaxAllowedTierName(
    auth: Authenticator
  ): Promise<ModelsTierName> {
    const explicit = await this.getExplicitWorkspaceTierNames(auth);
    return getMaxTierName(explicit) ?? DEFAULT_MAX_MODEL_TIER;
  }

  private static async getExplicitWorkspaceTierNames(
    auth: Authenticator
  ): Promise<ModelsTierName[]> {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      auth.getNonNullableWorkspace().id
    );
    if (!globalGroup) {
      return [];
    }

    const grants = await GroupPermissionResource.listForGroups(auth, {
      groupModelIds: [globalGroup.id],
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
    });

    return grants.flatMap((grant) => {
      const tierName = this.tierNameFromResourceId(grant.resourceId);
      return tierName ? [tierName] : [];
    });
  }

  static async grantToUser(
    auth: Authenticator,
    { user, tierName, transaction }: ModelsTierUserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return GroupPermissionResource.grantToUser(auth, {
      user,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async revokeFromUser(
    auth: Authenticator,
    { user, tierName, transaction }: ModelsTierUserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return GroupPermissionResource.revokeFromUser(auth, {
      user,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async grantToGroup(
    auth: Authenticator,
    { group, tierName, transaction }: ModelsTierGroupGrantSpec
  ): Promise<void> {
    await GroupPermissionResource.grant(auth, {
      group,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async revokeFromGroup(
    auth: Authenticator,
    { group, tierName, transaction }: ModelsTierGroupGrantSpec
  ): Promise<void> {
    await GroupPermissionResource.revoke(auth, {
      group,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async setUserMaxAllowedTier(
    auth: Authenticator,
    { userId, tierName }: { userId: string; tierName: ModelsTierName }
  ): Promise<
    Result<
      undefined,
      DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
    >
  > {
    this.assertIsAdmin(auth);

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
    await this.clearUserTierGrants(auth, userJson);

    const result = await this.grantToUser(auth, {
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

  static async clearUserMaxAllowedTier(
    auth: Authenticator,
    { userId }: { userId: string }
  ): Promise<
    Result<
      undefined,
      DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
    >
  > {
    this.assertIsAdmin(auth);

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

    await this.clearUserTierGrants(auth, user.toJSON());

    return new Ok(undefined);
  }

  static async setGroupMaxAllowedTier(
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
    this.assertIsAdmin(auth);

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

    await this.clearGroupTierGrants(auth, groupRes.value);
    await this.grantToGroup(auth, {
      group: groupRes.value,
      tierName,
    });

    return new Ok(undefined);
  }

  static async clearGroupMaxAllowedTier(
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
    this.assertIsAdmin(auth);

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return groupRes;
    }

    await this.clearGroupTierGrants(auth, groupRes.value);

    return new Ok(undefined);
  }

  static async listWorkspaceAllowedTierNames(
    auth: Authenticator
  ): Promise<ModelsTierName[]> {
    this.assertIsAdmin(auth);
    return this.loadWorkspaceTierGrants(auth);
  }

  static async listWorkspaceMaxAllowedTierName(
    auth: Authenticator
  ): Promise<ModelsTierName> {
    this.assertIsAdmin(auth);
    return this.getWorkspaceMaxAllowedTierName(auth);
  }

  private static async loadWorkspaceTierGrants(
    auth: Authenticator
  ): Promise<ModelsTierName[]> {
    return expandTiersUpTo(await this.getWorkspaceMaxAllowedTierName(auth));
  }

  static async setWorkspaceMaxAllowedTierName(
    auth: Authenticator,
    maxTierName: ModelsTierName
  ): Promise<Result<undefined, DustError<"invalid_request_error">>> {
    this.assertIsAdmin(auth);

    if (!this.getTier(maxTierName)) {
      return new Err(
        new DustError("invalid_request_error", "Unknown models tier.")
      );
    }

    await this.clearWorkspaceTierGrants(auth);

    if (maxTierName !== DEFAULT_MAX_MODEL_TIER) {
      await GroupPermissionResource.grantToEverybody(auth, {
        grantType: MODELS_TIER_GRANT_TYPE,
        resourceType: MODELS_TIER_RESOURCE_TYPE,
        resourceId: this.getTierResourceId(maxTierName),
      });
    }

    return new Ok(undefined);
  }

  static async listUserAllowedTierNames(
    auth: Authenticator
  ): Promise<UserAllowedModelTiersType[]> {
    this.assertIsAdmin(auth);

    const rows = await this.listAllTierGrantRows(auth);
    if (rows.length === 0) {
      return [];
    }

    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const groups = await GroupResource.fetchByModelIds(auth, groupIds);
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
      const tierName = this.tierNameFromResourceId(row.resourceId);
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

  static async listGroupAllowedTierNames(
    auth: Authenticator
  ): Promise<GroupAllowedModelTiersType[]> {
    this.assertIsAdmin(auth);

    const workspace = auth.getNonNullableWorkspace();
    const rows = await this.listAllTierGrantRows(auth);
    if (rows.length === 0) {
      return [];
    }

    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const groups = await GroupResource.fetchByModelIds(auth, groupIds);
    const overrideGroups = groups.filter((group) =>
      isModelTierOverrideGroupKind(group.kind)
    );

    const tiersByGroupId = new Map<ModelId, ModelsTierName[]>();
    for (const row of rows) {
      const tierName = this.tierNameFromResourceId(row.resourceId);
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

  private static async loadUserOverrideTierGrants({
    auth,
    user,
  }: {
    auth: Authenticator;
    user: UserResource;
  }): Promise<ModelsTierName[]> {
    const rows = await this.listAllTierGrantRows(auth);
    if (rows.length === 0) {
      return [];
    }

    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const groups = await GroupResource.fetchByModelIds(auth, groupIds);
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
        const tierName = this.tierNameFromResourceId(row.resourceId);
        if (tierName) {
          tierNames.add(tierName);
        }
      }
    }

    return this.expandExplicitTierNames([...tierNames]);
  }

  private static async listUserModelTierOverrideGroupModelIds(
    auth: Authenticator
  ): Promise<ModelId[]> {
    const groupModelIds = auth.groupModelIds();
    if (groupModelIds.length === 0) {
      return [];
    }

    const groups = await GroupResource.fetchByModelIds(auth, groupModelIds);
    return groups
      .filter((group) => isModelTierOverrideGroupKind(group.kind))
      .map((group) => group.id);
  }

  private static async loadGroupOverrideTierGrants({
    auth,
    groupModelIds,
  }: {
    auth: Authenticator;
    groupModelIds: ModelId[];
  }): Promise<Map<ModelId, ModelsTierName[]>> {
    if (groupModelIds.length === 0) {
      return new Map();
    }

    const grants = await GroupPermissionResource.listForGroups(auth, {
      groupModelIds,
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
    });

    const tiersByGroupId = new Map<ModelId, ModelsTierName[]>();
    for (const grant of grants) {
      const tierName = this.tierNameFromResourceId(grant.resourceId);
      if (!tierName) {
        continue;
      }
      const tiers = tiersByGroupId.get(grant.groupId) ?? [];
      tiers.push(tierName);
      tiersByGroupId.set(grant.groupId, tiers);
    }

    const expandedTiersByGroupId = new Map<ModelId, ModelsTierName[]>();
    for (const [groupId, rawTierNames] of tiersByGroupId) {
      expandedTiersByGroupId.set(
        groupId,
        this.expandExplicitTierNames(rawTierNames)
      );
    }

    return expandedTiersByGroupId;
  }

  static async resolveAllowedTierNames(auth: Authenticator) {
    const user = auth.user();

    const [workspaceTierGrants, userOverrideTierGrants, groupModelIds] =
      await Promise.all([
        this.loadWorkspaceTierGrants(auth),
        user
          ? this.loadUserOverrideTierGrants({
              auth,
              user,
            })
          : Promise.resolve([]),
        this.listUserModelTierOverrideGroupModelIds(auth),
      ]);

    const groupOverrideTierGrantsByGroupId =
      groupModelIds.length > 0
        ? await this.loadGroupOverrideTierGrants({
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
}
