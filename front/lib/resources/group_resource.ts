import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  batchInvalidateCacheWithRedis,
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type {
  GroupKind,
  GroupType,
  UserVisibleGroupKind,
} from "@app/types/groups";
import {
  AGENT_GROUP_PREFIX,
  CAP_ELIGIBLE_GROUP_KINDS,
  GROUP_KINDS,
  isAgentEditorGroupKind,
  isRegularManualGroupKind,
  USER_VISIBLE_GROUP_KINDS,
} from "@app/types/groups";
import type { AccessControlList } from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { MANAGER_ROLE_NAME } from "@app/types/user";
import type { DirectoryGroup } from "@workos-inc/node";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Includeable,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { col, fn, Op, QueryTypes } from "sequelize";

export const ADMIN_GROUP_NAME = "dust-admins";
export const MANAGER_GROUP_NAME = "dust-managers";

/**
 * ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 * ┃                                                                         ┃
 * ┃  IMPORTANT: GroupResource DOES NOT and SHOULD NOT have permissions      ┃
 * ┃  management of its own.                                                 ┃
 * ┃                                                                         ┃
 * ┃  Groups are designed to be used within the context of other resources   ┃
 * ┃  (e.g., SpaceResource, AgentConfigurationResource). The permissions     ┃
 * ┃  should be managed at the junction with parent resource level,          ┃
 * ┃  not at the group level.                                                ┃
 * ┃                                                                         ┃
 * ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 */

type CachedGroup = {
  id: ModelId;
  name: string;
  kind: GroupKind;
  workspaceId: ModelId;
  workOSGroupId: string | null;
  poolCapAwuCredits: number | null;
  createdAt: number;
  updatedAt: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupResource extends ReadonlyAttributesType<GroupModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupResource extends BaseResource<GroupModel> {
  static model: ModelStatic<GroupModel> = GroupModel;

  constructor(model: ModelStatic<GroupModel>, blob: Attributes<GroupModel>) {
    super(GroupModel, blob);
  }

  // Default group kinds for auth (excludes system groups).
  private static readonly defaultAuthGroupKinds: Exclude<
    GroupKind,
    "system"
  >[] = GROUP_KINDS.filter(
    (k): k is Exclude<GroupKind, "system"> => k !== "system"
  );

  // Group kinds returned to system API keys by listWorkspaceGroupsFromKey.
  // Excludes agent_editors which are per-agent
  // and not relevant to system auth.
  private static readonly groupKindsFromSystemKey: GroupKind[] =
    GROUP_KINDS.filter((k) => !isAgentEditorGroupKind(k));

  private static readonly workspaceGroupsFromSystemKeyCacheKeyResolver = (
    workspaceModelId: ModelId
  ) => `workspace-groups-from-system-key:${workspaceModelId}`;

  private static async _listWorkspaceGroupsFromSystemKeyUncached(
    workspaceModelId: ModelId
  ): Promise<CachedGroup[]> {
    const groups = await GroupModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        kind: { [Op.in]: GroupResource.groupKindsFromSystemKey },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      workspaceId: g.workspaceId,
      workOSGroupId: g.workOSGroupId,
      poolCapAwuCredits: g.poolCapAwuCredits,
      createdAt: g.createdAt.getTime(),
      updatedAt: g.updatedAt.getTime(),
    }));
  }

  private static listWorkspaceGroupsFromSystemKeyCached = cacheWithRedis(
    GroupResource._listWorkspaceGroupsFromSystemKeyUncached,
    GroupResource.workspaceGroupsFromSystemKeyCacheKeyResolver,
    { cacheNullValues: false }
  );

  private static _invalidateWorkspaceGroupsFromSystemKeyCache =
    invalidateCacheWithRedis(
      GroupResource._listWorkspaceGroupsFromSystemKeyUncached,
      GroupResource.workspaceGroupsFromSystemKeyCacheKeyResolver
    );

  static invalidateWorkspaceGroupsFromSystemKeyCache = async (
    workspaceModelId: ModelId
  ) => {
    logger.info(
      {
        workspaceModelId,
        method: "GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache",
      },
      "Invalidating workspace groups from system key cache"
    );
    return GroupResource._invalidateWorkspaceGroupsFromSystemKeyCache(
      workspaceModelId
    );
  };

  private static fromCachedGroup(data: CachedGroup): GroupResource {
    return new GroupResource(GroupModel, {
      id: data.id,
      name: data.name,
      kind: data.kind,
      workspaceId: data.workspaceId,
      workOSGroupId: data.workOSGroupId,
      poolCapAwuCredits: data.poolCapAwuCredits,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  }

  private static readonly groupIdsCacheKeyResolver = ({
    user,
    workspace,
  }: {
    user: { id: ModelId };
    workspace: { id: ModelId };
  }) => `groups:v2:user:${user.id}:workspace:${workspace.id}`;

  private static async dangerouslyListUserGroupsForAuthUncached({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<{
    globalGroupModelId: ModelId | null;
    groupModelIds: ModelId[];
  }> {
    return GroupResource.listUserGroupModelIdsInWorkspace({
      user,
      workspace,
      groupKinds: GroupResource.defaultAuthGroupKinds,
      transaction,
      dangerouslySkipMembershipCheck: true,
    });
  }

  // Cache eviction is handled by Redis's allkeys-lfu eviction policy.
  private static dangerouslyListUserGroupsForAuthCached = cacheWithRedis(
    ({
      user,
      workspace,
    }: {
      user: UserResource;
      workspace: LightWorkspaceType;
    }) =>
      GroupResource.dangerouslyListUserGroupsForAuthUncached({
        user,
        workspace,
      }),
    GroupResource.groupIdsCacheKeyResolver,
    { cacheNullValues: false }
  );

  private static _invalidateGroupIdsCacheForUser = invalidateCacheWithRedis(
    (_params: { user: { id: ModelId }; workspace: { id: ModelId } }) =>
      Promise.resolve([]),
    GroupResource.groupIdsCacheKeyResolver
  );

  static invalidateGroupIdsCacheForUser = async (params: {
    user: { id: ModelId };
    workspace: { id: ModelId };
  }) => {
    logger.info(
      {
        userModelId: params.user.id,
        workspaceModelId: params.workspace.id,
        method: "GroupResource.invalidateGroupIdsCacheForUser",
      },
      "Invalidating auth resource cache"
    );
    return GroupResource._invalidateGroupIdsCacheForUser(params);
  };

  private static _batchInvalidateGroupIdsCacheForUsers =
    batchInvalidateCacheWithRedis(
      (_params: { user: { id: ModelId }; workspace: { id: ModelId } }) =>
        Promise.resolve([]),
      GroupResource.groupIdsCacheKeyResolver
    );

  static batchInvalidateGroupIdsCacheForUsers = async (
    argsList: [{ user: { id: ModelId }; workspace: { id: ModelId } }][]
  ) => {
    logger.info(
      {
        workspaceModelId: argsList[0]?.[0]?.workspace.id,
        count: argsList.length,
        method: "GroupResource.batchInvalidateGroupIdsCacheForUsers",
      },
      "Invalidating auth resource cache (batch)"
    );
    return GroupResource._batchInvalidateGroupIdsCacheForUsers(argsList);
  };

  /**
   * WARNING: This method skips workspace membership checks. It is intended for use in
   * authentication/authorization contexts where the user's group membership
   * needs to be determined before permissions can be evaluated.
   */
  static async dangerouslyListUserGroupsForAuth({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<{
    globalGroupModelId: ModelId | null;
    groupModelIds: ModelId[];
  }> {
    if (transaction) {
      logger.info(
        {
          userModelId: user.id,
          workspaceModelId: workspace.id,
          method: "GroupResource.dangerouslyListUserGroupsForAuth",
        },
        "Skipping auth resource cache: transaction provided"
      );
      return this.dangerouslyListUserGroupsForAuthUncached({
        user,
        workspace,
        transaction,
      });
    }
    return this.dangerouslyListUserGroupsForAuthCached({ user, workspace });
  }

  /**
   * Migrates all group memberships from one user to another within a workspace.
   * Handles duplicate memberships by destroying them first.
   */
  static async migrateUserMemberships(
    auth: Authenticator,
    {
      primaryUser,
      secondaryUser,
    }: {
      primaryUser: UserResource;
      secondaryUser: UserResource;
    }
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const primaryMemberships = await GroupMembershipModel.findAll({
      where: { userId: primaryUser.id, workspaceId: workspace.id },
      attributes: ["groupId"],
    });
    const primaryGroupIds = primaryMemberships.map((m) => m.groupId);

    if (primaryGroupIds.length > 0) {
      await GroupMembershipModel.destroy({
        where: {
          userId: secondaryUser.id,
          groupId: primaryGroupIds,
          workspaceId: workspace.id,
        },
      });
    }

    await GroupMembershipModel.update(
      { userId: primaryUser.id },
      { where: { userId: secondaryUser.id, workspaceId: workspace.id } }
    );

    // Always invalidate
    await GroupResource.batchInvalidateGroupIdsCacheForUsers([
      [{ user: { id: primaryUser.id }, workspace: { id: workspace.id } }],
      [{ user: { id: secondaryUser.id }, workspace: { id: workspace.id } }],
    ]);
  }

  static async makeNew(
    blob: CreationAttributes<GroupModel>,
    {
      memberIds,
      transaction,
    }: { memberIds?: ModelId[]; transaction?: Transaction } = {}
  ) {
    const group = await GroupModel.create(blob, { transaction });
    const workspaceModelId = group.workspaceId;

    invalidateCacheAfterCommit(transaction, () =>
      GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache(
        workspaceModelId
      )
    );

    // If memberIds are provided, create memberships
    if (memberIds && memberIds.length > 0) {
      await GroupMembershipModel.bulkCreate(
        memberIds.map((userId) => ({
          groupId: group.id,
          userId,
          workspaceId: workspaceModelId,
          startAt: new Date(),
          status: "active" as const,
        })),
        { transaction }
      );

      invalidateCacheAfterCommit(transaction, async () => {
        await GroupResource.batchInvalidateGroupIdsCacheForUsers(
          memberIds.map((userModelId) => [
            { user: { id: userModelId }, workspace: { id: workspaceModelId } },
          ])
        );
      });
    }

    return new this(GroupModel, group.get());
  }

  /**
   * Creates a new agent editors group for the given agent and adds the creating
   * user to it.
   */
  static async makeNewAgentEditorsGroup(
    auth: Authenticator,
    agent: AgentConfigurationModel,
    { transaction, authorId }: { transaction?: Transaction; authorId: ModelId }
  ) {
    const workspace = auth.getNonNullableWorkspace();

    if (agent.workspaceId !== workspace.id) {
      throw new DustError(
        "internal_error",
        "Unexpected: agent and workspace mismatch"
      );
    }

    // Create a default group for the agent and add the author to it.
    const defaultGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `${AGENT_GROUP_PREFIX} ${agent.name} (${agent.sId})`,
        kind: "agent_editors",
      },
      { transaction, memberIds: [authorId] }
    );

    // Associate the group with the agent configuration.
    const groupAgentResult = await defaultGroup.addGroupToAgentConfiguration({
      auth,
      agentConfiguration: agent,
      transaction,
    });
    // If association fails, the transaction will automatically rollback.
    if (groupAgentResult.isErr()) {
      // Explicitly throw error to ensure rollback
      throw groupAgentResult.error;
    }

    return defaultGroup;
  }

  /**
   * Creates a new regular_manual group. These groups are created and managed
   * manually by workspace admins and managers from the UI to grant
   * permissions to their members.
   */
  static async makeNewRegularManual(
    auth: Authenticator,
    { name, memberIds }: { name: string; memberIds: string[] }
  ): Promise<
    Result<
      { group: GroupResource; addedUsers: UserType[] },
      DustError<
        | "unauthorized"
        | "name_conflict"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    // TODO(governance): gate on a type-level `group` "create" capability
    // (ROLE_REGISTRY entry) instead of the role, in a follow-up PR.
    if (!auth.isManager()) {
      return new Err(
        new DustError(
          "unauthorized",
          `Only workspace admins and ${MANAGER_ROLE_NAME}s can create groups.`
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();

    if (await GroupResource.groupExistsByName(auth, name)) {
      return new Err(
        new DustError(
          "name_conflict",
          `A group named "${name}" already exists in this workspace.`
        )
      );
    }

    const group = await GroupResource.makeNew({
      name,
      kind: "regular_manual",
      workspaceId: owner.id,
    });

    const uniqueMemberIds = [...new Set(memberIds)];
    const users = await UserResource.fetchByIds(uniqueMemberIds);
    if (users.length !== uniqueMemberIds.length) {
      return new Err(
        new DustError("user_not_found", "Some users were not found.")
      );
    }
    const memberUsers = users.map((u) => u.toJSON());
    const addResult = await group.dangerouslyAddMembers(auth, {
      users: memberUsers,
    });
    if (addResult.isErr()) {
      return new Err(addResult.error);
    }

    return new Ok({ group, addedUsers: memberUsers });
  }

  /**
   * TODO(governance): to be removed, replaced by permissions checks
   */
  static async findAgentIdsForGroups(
    auth: Authenticator,
    groupIds: ModelId[]
  ): Promise<{ agentConfigurationId: ModelId; groupId: ModelId }[]> {
    const owner = auth.getNonNullableWorkspace();

    const groupAgents = await GroupAgentModel.findAll({
      where: {
        groupId: {
          [Op.in]: groupIds,
        },
        workspaceId: owner.id,
      },
      attributes: ["agentConfigurationId", "groupId"],
    });

    return groupAgents.map((ga) => ({
      agentConfigurationId: ga.agentConfigurationId,
      groupId: ga.groupId,
    }));
  }

  /**
   * TODO(governance): to be removed, replaced by findRegularAutoGroupForGrant/listRegularAutoGroupsForResource
   * Finds the specific editor group associated with an agent configuration.
   */
  static async findEditorGroupForAgent(
    auth: Authenticator,
    agent: LightAgentConfigurationType
  ): Promise<
    Result<
      GroupResource,
      DustError<
        "group_not_found" | "internal_error" | "unauthorized" | "invalid_id"
      >
    >
  > {
    const owner = auth.getNonNullableWorkspace();

    const groupAgents = await GroupAgentModel.findAll({
      where: {
        agentConfigurationId: agent.id,
        workspaceId: owner.id,
      },
      attributes: ["groupId"],
    });
    if (groupAgents.length === 0) {
      return new Err(
        new DustError(
          "group_not_found",
          "Editor group association not found for agent."
        )
      );
    }

    if (groupAgents.length > 1) {
      return new Err(
        new DustError(
          "internal_error",
          "Multiple editor group associations found for agent."
        )
      );
    }

    const [groupAgent] = groupAgents;
    const groups = await this.baseFetch(auth, {
      where: {
        id: groupAgent.groupId,
      },
    });

    const [group] = groups;
    if (!group) {
      return new Err(
        new DustError("group_not_found", "Editor group not found for agent.")
      );
    }

    if (group.kind !== "agent_editors") {
      // Should not happen based on creation logic, but good to check.
      // Might change when we allow other group kinds to be associated with agents.
      return new Err(
        new DustError(
          "internal_error",
          "Associated group is not an agent_editors group."
        )
      );
    }

    return new Ok(group);
  }

  /**
   * TODO(governance): to be removed, replaced by findRegularAutoGroupForGrant/listRegularAutoGroupsForResource
   * Finds the specific editor groups associated with a set of agent configuration.
   */
  static async findEditorGroupsForAgents(
    auth: Authenticator,
    agent: LightAgentConfigurationType[]
  ): Promise<Result<Record<string, GroupResource>, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const groupAgents = await GroupAgentModel.findAll({
      where: {
        agentConfigurationId: agent.map((a) => a.id),
        workspaceId: owner.id,
      },
      attributes: ["groupId", "agentConfigurationId"],
    });

    if (groupAgents.length === 0) {
      return new Err(
        new DustError(
          "group_not_found",
          "Editor group association not found for agent."
        )
      );
    }

    const groups = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: groupAgents.map((ga) => ga.groupId),
        },
      },
    });

    const groupMap: Record<ModelId, GroupResource> = {};
    for (const group of groups) {
      groupMap[group.id] = group;
    }

    const r: Record<string, GroupResource> = {};
    for (const ga of groupAgents) {
      if (ga.agentConfigurationId) {
        const agentConfiguration = agent.find(
          (a) => a.id === ga.agentConfigurationId
        );
        const group = groupMap[ga.groupId];

        if (group.kind !== "agent_editors") {
          return new Err(
            new DustError(
              "group_not_found",
              "Associated group is not an agent_editors group."
            )
          );
        }
        if (agentConfiguration) {
          r[agentConfiguration.sId] = group;
        }
      }
    }

    return new Ok(r);
  }

  static async makeDefaultsForWorkspace(workspace: LightWorkspaceType) {
    const existingGroups = (
      await GroupModel.findAll({
        where: {
          workspaceId: workspace.id,
        },
      })
    ).map((group) => new this(GroupModel, group.get()));
    const systemGroup =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingGroups.find((v) => v.kind === "system") ||
      (await GroupResource.makeNew({
        name: "System",
        kind: "system",
        workspaceId: workspace.id,
      }));
    const globalGroup =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingGroups.find((v) => v.kind === "global") ||
      (await GroupResource.makeNew({
        name: "Workspace",
        kind: "global",
        workspaceId: workspace.id,
      }));
    return {
      systemGroup,
      globalGroup,
    };
  }
  // sId

  get sId(): string {
    return GroupResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("group", {
      id,
      workspaceId,
    });
  }

  // Internal fetcher for Authenticator only

  // Use with care as this gives access to all groups in the workspace.
  static async internalFetchAllWorkspaceGroups({
    workspaceId,
    groupKinds = GROUP_KINDS.filter((k) => !isAgentEditorGroupKind(k)),
    transaction,
  }: {
    workspaceId: ModelId;
    groupKinds?: GroupKind[];
    transaction?: Transaction;
  }): Promise<GroupResource[]> {
    const groups = await this.model.findAll({
      where: {
        workspaceId,
        kind: {
          [Op.in]: groupKinds,
        },
      },
      transaction,
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async listWorkspaceGroupsFromKey(
    key: KeyResource
  ): Promise<GroupResource[]> {
    if (key.isSystem) {
      const cached = await GroupResource.listWorkspaceGroupsFromSystemKeyCached(
        key.workspaceId
      );

      if (cached.length === 0) {
        throw new Error("Group for key not found.");
      }

      return cached.map((g) => GroupResource.fromCachedGroup(g));
    }

    const groups = await this.model.findAll({
      where: {
        workspaceId: key.workspaceId,
        id: { [Op.in]: key.groupIds },
      },
    });

    if (groups.length === 0) {
      throw new Error("Group for key not found.");
    }

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async listGroupsWithSystemKey(
    key: KeyResource,
    groupIds: string[]
  ): Promise<GroupResource[]> {
    if (!key.isSystem) {
      throw new Error("Only system keys are supported.");
    }

    const groups = await this.model.findAll({
      where: {
        workspaceId: key.workspaceId,
        id: {
          [Op.in]: removeNulls(groupIds.map((id) => getResourceIdFromSId(id))),
        },
      },
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async internalFetchWorkspaceGlobalGroup(
    workspaceId: ModelId,
    transaction?: Transaction
  ): Promise<GroupResource | null> {
    const group = await this.model.findOne({
      where: {
        workspaceId,
        kind: "global",
      },
      transaction,
    });

    if (!group) {
      return null;
    }

    return new this(GroupModel, group.get());
  }

  static async internalFetchWorkspaceSystemGroup(
    workspaceId: ModelId
  ): Promise<GroupResource> {
    const group = await this.model.findOne({
      where: {
        workspaceId,
        kind: "system",
      },
    });

    if (!group) {
      throw new Error("System group not found.");
    }

    return new this(GroupModel, group.get());
  }

  // Fetchers

  private static async baseFetch(
    auth: Authenticator,
    { includes, limit, order, where }: ResourceFindOptions<GroupModel> = {},
    transaction?: Transaction
  ) {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const includeClauses: Includeable[] = includes || [];

    const groupModels = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<GroupModel>,
      include: includeClauses,
      limit,
      order,
      transaction,
    });
    return groupModels.map((b) => new this(this.model, b.get()));
  }

  static async dangerouslyFetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    {
      groupKinds,
      transaction,
    }: { groupKinds?: GroupKind[]; transaction?: Transaction } = {}
  ): Promise<GroupResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          id: {
            [Op.in]: ids,
          },
          ...(groupKinds ? { kind: { [Op.in]: groupKinds } } : {}),
        },
      },
      transaction
    );
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<
    Result<
      GroupResource,
      DustError<"group_not_found" | "unauthorized" | "invalid_id">
    >
  > {
    const groupRes = await this.fetchByIds(auth, [id]);

    if (groupRes.isErr()) {
      return groupRes;
    }

    return new Ok(groupRes.value[0]);
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<
    Result<
      GroupResource[],
      DustError<"group_not_found" | "unauthorized" | "invalid_id">
    >
  > {
    const groupModelIds = removeNulls(
      ids.map((id) => getResourceIdFromSId(id))
    );
    if (groupModelIds.length !== ids.length) {
      return new Err(new DustError("invalid_id", "Invalid id"));
    }

    const groups = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: groupModelIds,
        },
      },
    });

    if (groups.length !== ids.length) {
      return new Err(
        new DustError(
          "group_not_found",
          ids.length === 1 ? "Group not found" : "Some groups were not found"
        )
      );
    }

    const unreadableGroups = groups.filter((group) => !group.canRead(auth));
    if (unreadableGroups.length > 0) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          unreadableGroupIds: unreadableGroups.map((g) => g.sId),
          authRole: auth.role(),
        },
        "[GroupResource.fetchByIds] User cannot read some groups"
      );
      return new Err(
        new DustError(
          "unauthorized",
          "Only `admins` or members can view groups"
        )
      );
    }

    return new Ok(groups);
  }

  static async fetchByWorkOSGroupId(
    auth: Authenticator,
    workOSGroupId: string
  ): Promise<GroupResource | null> {
    const [group] = await this.baseFetch(auth, {
      where: {
        workOSGroupId,
      },
    });
    if (!group || !group.canRead(auth)) {
      return null;
    }
    return group;
  }

  // Returns whether a group of the given name exists in the workspace, without
  // an ACL check. Used for name-conflict checks in `makeNew` and the
  // regular_manual rename path — those must detect any group in the workspace
  // regardless of caller visibility.
  static async groupExistsByName(
    auth: Authenticator,
    name: string
  ): Promise<boolean> {
    const [group] = await this.baseFetch(auth, {
      where: {
        name,
      },
    });
    return !!group;
  }

  static async fetchByName(
    auth: Authenticator,
    name: string
  ): Promise<GroupResource | null> {
    const [group] = await this.baseFetch(auth, {
      where: {
        name,
      },
    });
    if (group && !group.canRead(auth)) {
      return null;
    }

    return group ?? null;
  }

  static async upsertByWorkOSGroupId(
    auth: Authenticator,
    directoryGroup: DirectoryGroup
  ) {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        workOSGroupId: directoryGroup.id,
      },
    });

    if (group) {
      const groupResource = new this(this.model, group.get());
      await groupResource.dangerouslyUpdateName(directoryGroup.name);
      return groupResource;
    }

    return this.makeNew({
      name: directoryGroup.name,
      workOSGroupId: directoryGroup.id,
      updatedAt: new Date(),
      kind: "provisioned",
      workspaceId: owner.id,
    });
  }

  /**
   * TODO(governance): to be removed, replaced by findRegularAutoGroupForGrant/listRegularAutoGroupsForResource
   */
  static async fetchByAgentConfiguration({
    auth,
    agentConfiguration,
    isDeletionFlow = false,
  }: {
    auth: Authenticator;
    agentConfiguration: AgentConfigurationModel | AgentConfigurationType;
    isDeletionFlow?: boolean;
  }): Promise<GroupResource | null> {
    const workspace = auth.getNonNullableWorkspace();

    const agentGroups = await GroupAgentModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: workspace.id,
      },
    });

    const groups = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: agentGroups.map((ag) => ag.groupId),
        },
        kind: "agent_editors",
      },
    });

    if (
      agentConfiguration.status === "draft" ||
      agentConfiguration.scope === "global"
    ) {
      if (groups.length === 0) {
        return null;
      }

      throw new Error(
        "Unexpected: draft or global agent shouldn't have an editor group."
      );
    }

    // In the case of agents deletion, it is possible that the agent has no
    // editor group associated with it, because the group may have been deleted
    // when deleting another version of the agent with the same sId.
    if (isDeletionFlow && groups.length === 0) {
      return null;
    }

    // In other cases, the agent should always have exactly one editor group.
    if (groups.length !== 1) {
      throw new Error(
        "Unexpected: agent should have exactly one editor group."
      );
    }

    const [group] = groups;
    return group;
  }

  // Fetches the system group without any ACL check. Only used in scripts and
  // system-flow plumbing — the system group is deny-all in `getAccessControlLists`
  // and must never be exposed to interactive callers.
  static async dangerouslyFetchWorkspaceSystemGroup(
    auth: Authenticator
  ): Promise<Result<GroupResource, DustError>> {
    const [group] = await this.baseFetch(auth, {
      where: {
        kind: "system",
      },
    });

    if (!group) {
      return new Err(
        new DustError("group_not_found", "System group not found")
      );
    }

    return new Ok(group);
  }

  static async fetchWorkspaceGlobalGroup(
    auth: Authenticator
  ): Promise<Result<GroupResource, DustError<"group_not_found">>> {
    const [group] = await this.baseFetch(auth, {
      where: {
        kind: "global",
      },
    });

    if (!group) {
      return new Err(
        new DustError("group_not_found", "Global group not found")
      );
    }

    // All members can fetch the global group.

    return new Ok(group);
  }

  static async listAllWorkspaceGroups(
    auth: Authenticator,
    options: { groupKinds?: UserVisibleGroupKind[] } = {}
  ): Promise<GroupResource[]> {
    const { groupKinds = [...USER_VISIBLE_GROUP_KINDS] } = options;
    const groups = await this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: groupKinds,
        },
      },
    });
    return groups.filter((group) => group.canRead(auth));
  }

  /**
   * Group model ids the user was a member of at `at`, defaulting to now.
   *
   * Two caveats:
   * - `global` groups are included regardless of `at` if requested (they are not historized).
   * - `status` is mutated in place by suspend/restore, so a membership
   *   suspended today is filtered out even for a past `at`.
   */
  private static async listUserGroupModelIdsInWorkspace({
    user,
    workspace,
    groupKinds = GROUP_KINDS.filter((k) => k !== "system"),
    transaction,
    dangerouslySkipMembershipCheck = false,
    at = new Date(),
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    groupKinds?: Exclude<GroupKind, "system">[];
    transaction?: Transaction;
    dangerouslySkipMembershipCheck?: boolean;
    at?: Date;
  }): Promise<{
    globalGroupModelId: ModelId | null;
    groupModelIds: ModelId[];
  }> {
    if (!dangerouslySkipMembershipCheck) {
      const workspaceMembership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace,
          transaction,
          at,
        });
      if (!workspaceMembership) {
        return { globalGroupModelId: null, groupModelIds: [] };
      }
    }

    const includeGlobal = groupKinds.includes("global");

    // Single combined query to fetch both the global group (implicit membership for all workspace members)
    // and groups the user explicitly belongs to via group_memberships.
    // eslint-disable-next-line dust/no-raw-sql -- Raw query to optimize memory usage as people may have a lot of groups.
    // biome-ignore lint/plugin: Raw query to optimize memory usage as people may have a lot of groups.
    const groups = await frontSequelize.query<{ id: ModelId; kind: string }>(
      `
      SELECT id, kind FROM groups
      WHERE "workspaceId" = :workspaceId
      AND kind IN (:groupKinds)
      AND (
        kind = 'global'
        OR id IN (
          SELECT "groupId" FROM group_memberships
          WHERE "userId" = :userId
          AND "workspaceId" = :workspaceId
          AND "startAt" <= :now
          AND ("endAt" IS NULL OR "endAt" > :now)
          AND status = 'active'
        )
      )
    `,
      {
        replacements: {
          workspaceId: workspace.id,
          groupKinds,
          userId: user.id,
          now: at,
        },
        type: QueryTypes.SELECT,
        raw: true,
        transaction,
      }
    );

    const globalGroupModelId =
      groups.find((g) => g.kind === "global")?.id ?? null;
    if (includeGlobal && globalGroupModelId === null) {
      throw new Error("Global group not found.");
    }

    return {
      globalGroupModelId,
      groupModelIds: groups.map((group) => group.id),
    };
  }

  // Warning, this function can be very memory hungry if there are a lot of groups (such as a workspace with a lot of agents and editors groups).
  // If you can, just use the listUserGroupModelIdsInWorkspace instead that returns only the ids of the groups.
  static async listUserGroupsInWorkspace({
    user,
    workspace,
    groupKinds = GROUP_KINDS.filter((k) => k !== "system"),
    transaction,
    at,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    groupKinds?: Exclude<GroupKind, "system">[];
    transaction?: Transaction;
    at?: Date;
  }): Promise<GroupResource[]> {
    const { groupModelIds } = await this.listUserGroupModelIdsInWorkspace({
      user,
      workspace,
      groupKinds,
      transaction,
      at,
    });

    const groups = await GroupModel.findAll({
      where: {
        id: {
          [Op.in]: groupModelIds,
        },
        workspaceId: workspace.id,
      },
      transaction,
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async listGroupNamesByUserModelIdInWorkspace({
    workspace,
    userModelIds,
    groupKinds = ["regular_auto", "provisioned"],
  }: {
    workspace: LightWorkspaceType;
    userModelIds: ModelId[];
    groupKinds?: Exclude<GroupKind, "system">[];
  }): Promise<Map<ModelId, string[]>> {
    const result = new Map<ModelId, string[]>();
    if (userModelIds.length === 0) {
      return result;
    }

    const now = new Date();
    const memberships = await GroupMembershipModel.findAll({
      where: {
        workspaceId: workspace.id,
        userId: userModelIds,
        status: "active",
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      },
    });
    if (memberships.length === 0) {
      return result;
    }

    const groupModelIds = [...new Set(memberships.map((m) => m.groupId))];
    const groups = await GroupModel.findAll({
      where: {
        id: groupModelIds,
        workspaceId: workspace.id,
        kind: groupKinds,
      },
    });
    const nameByGroupId = new Map(groups.map((g) => [g.id, g.name]));

    for (const m of memberships) {
      const name = nameByGroupId.get(m.groupId);
      if (!name) {
        continue;
      }
      const existing = result.get(m.userId);
      if (existing) {
        existing.push(name);
      } else {
        result.set(m.userId, [name]);
      }
    }

    for (const names of result.values()) {
      names.sort((a, b) => a.localeCompare(b));
    }

    return result;
  }

  /**
   * For each user, the subset of `groupModelIds` they are an active member of.
   * Users with no matching membership are absent from the map. Restricting the
   * query to the caller's group ids keeps this to a single row-bounded query
   * regardless of how many groups the workspace has.
   */
  static async listGroupModelIdsByUserModelIdInWorkspace({
    workspace,
    userModelIds,
    groupModelIds,
  }: {
    workspace: LightWorkspaceType;
    userModelIds: ModelId[];
    groupModelIds: ModelId[];
  }): Promise<Map<ModelId, Set<ModelId>>> {
    const result = new Map<ModelId, Set<ModelId>>();
    if (userModelIds.length === 0 || groupModelIds.length === 0) {
      return result;
    }

    const now = new Date();
    const memberships = await GroupMembershipModel.findAll({
      attributes: ["userId", "groupId"],
      where: {
        workspaceId: workspace.id,
        userId: userModelIds,
        groupId: groupModelIds,
        status: "active",
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      },
    });

    for (const membership of memberships) {
      const existing = result.get(membership.userId);
      if (existing) {
        existing.add(membership.groupId);
      } else {
        result.set(membership.userId, new Set([membership.groupId]));
      }
    }

    return result;
  }

  // For each user, the highest per-group pool cap (excluding seat allowance)
  // among the cap-eligible (provisioned) groups they belong to. Users with no
  // capped group are absent from the map (the caller falls back to the workspace
  // default). Used to resolve the "max(group caps)" term of a user's effective
  // spend limit.
  static async listMaxPoolCapGroupByUserModelIdInWorkspace({
    workspace,
    userModelIds,
  }: {
    workspace: LightWorkspaceType;
    userModelIds: ModelId[];
  }): Promise<
    Map<ModelId, { capAwuCredits: number; groupName: string; groupId: ModelId }>
  > {
    const result = new Map<
      ModelId,
      { capAwuCredits: number; groupName: string; groupId: ModelId }
    >();
    if (userModelIds.length === 0) {
      return result;
    }

    const now = new Date();
    const memberships = await GroupMembershipModel.findAll({
      where: {
        workspaceId: workspace.id,
        userId: userModelIds,
        status: "active",
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      },
    });
    if (memberships.length === 0) {
      return result;
    }

    const groupModelIds = [...new Set(memberships.map((m) => m.groupId))];
    const groups = await GroupModel.findAll({
      where: {
        id: groupModelIds,
        workspaceId: workspace.id,
        kind: [...CAP_ELIGIBLE_GROUP_KINDS],
        poolCapAwuCredits: { [Op.ne]: null },
      },
    });
    const groupById = new Map(groups.map((g) => [g.id, g]));

    for (const m of memberships) {
      const group = groupById.get(m.groupId);
      const cap = group?.poolCapAwuCredits;
      if (group === undefined || cap === undefined || cap === null) {
        continue;
      }
      const existing = result.get(m.userId);
      // Tie-break on groupId so the pick is stable regardless of the
      // memberships query's row order.
      if (
        existing === undefined ||
        cap > existing.capAwuCredits ||
        (cap === existing.capAwuCredits && group.id < existing.groupId)
      ) {
        result.set(m.userId, {
          capAwuCredits: cap,
          groupName: group.name,
          groupId: group.id,
        });
      }
    }

    return result;
  }

  static async listMaxPoolCapAwuCreditsByUserModelIdInWorkspace(args: {
    workspace: LightWorkspaceType;
    userModelIds: ModelId[];
  }): Promise<Map<ModelId, number>> {
    const groupByUserModelId =
      await GroupResource.listMaxPoolCapGroupByUserModelIdInWorkspace(args);
    return new Map(
      [...groupByUserModelId].map(([userModelId, { capAwuCredits }]) => [
        userModelId,
        capAwuCredits,
      ])
    );
  }

  static async getMemberCountsForGroups(
    auth: Authenticator,
    groups: GroupResource[]
  ): Promise<Map<ModelId, number>> {
    const owner = auth.getNonNullableWorkspace();
    const counts = new Map<ModelId, number>();
    if (groups.length === 0) {
      return counts;
    }

    const globalGroup = groups.find((g) => g.isGlobal());
    const regularGroups = groups.filter((g) => !g.isGlobal());
    const { memberships: workspaceMemberships } =
      await MembershipResource.getActiveMemberships({ workspace: owner });
    const activeUserIds = new Set(
      workspaceMemberships.map((membership) => membership.userId)
    );

    // Global group count comes from workspace active memberships.
    if (globalGroup) {
      counts.set(globalGroup.id, workspaceMemberships.length);
    }

    // All regular group counts in one query, reusing the existing method.
    if (regularGroups.length > 0) {
      const membershipsByGroup =
        await GroupResource.getActiveMembershipsForGroups(auth, regularGroups);
      for (const [groupId, userIds] of Object.entries(membershipsByGroup)) {
        counts.set(
          Number(groupId),
          userIds.filter((userId) => activeUserIds.has(userId)).length
        );
      }
    }

    return counts;
  }

  static async getActiveMembershipsForGroups(
    auth: Authenticator,
    groups: GroupResource[]
  ): Promise<Record<ModelId, ModelId[]>> {
    const owner = auth.getNonNullableWorkspace();
    const res = await GroupMembershipModel.findAll({
      where: {
        workspaceId: owner.id,
        groupId: groups.map((g) => g.id),
        status: "active",
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
    });

    return res.reduce<Record<ModelId, ModelId[]>>((acc, m) => {
      acc[m.groupId] = [...(acc[m.groupId] || []), m.userId];
      return acc;
    }, {});
  }

  async isMember(user: UserResource): Promise<boolean> {
    if (this.isGlobal()) {
      return true;
    }
    if (this.isSystem()) {
      return false;
    }

    const membership = await GroupMembershipModel.findOne({
      where: {
        groupId: this.id,
        workspaceId: this.workspaceId,
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        userId: user.id,
        status: "active",
      },
    });

    return !!membership;
  }

  async getActiveMembers(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<UserResource[]> {
    const owner = auth.getNonNullableWorkspace();

    let memberships: GroupMembershipModel[] | MembershipResource[];

    // The global group does not have a DB entry for each workspace member.
    if (this.isGlobal()) {
      const { memberships: m } = await MembershipResource.getActiveMemberships({
        workspace: auth.getNonNullableWorkspace(),
        transaction,
      });
      memberships = m;
    } else {
      memberships = await GroupMembershipModel.findAll({
        where: {
          workspaceId: owner.id,
          groupId: this.id,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      });
    }

    const users = await UserResource.fetchByModelIds(
      memberships.map((m) => m.userId)
    );

    const { memberships: workspaceMemberships } =
      await MembershipResource.getActiveMemberships({
        users,
        workspace: owner,
        transaction,
      });

    // Only return users that have an active membership in the workspace.
    return users.filter((user) =>
      workspaceMemberships.some((m) => m.userId === user.id)
    );
  }

  async getAllMembers(auth: Authenticator): Promise<UserResource[]> {
    const owner = auth.getNonNullableWorkspace();

    let memberships: GroupMembershipModel[] | MembershipResource[];

    // The global group does not have a DB entry for each workspace member.
    if (this.isGlobal()) {
      const { memberships: m } = await MembershipResource.getActiveMemberships({
        workspace: auth.getNonNullableWorkspace(),
      });
      memberships = m;
    } else {
      // Get all members regardless of status (active, suspended)
      memberships = await GroupMembershipModel.findAll({
        where: {
          workspaceId: owner.id,
          groupId: this.id,
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          // Note: No status filter here - we want all statuses
        },
      });
    }

    const users = await UserResource.fetchByModelIds(
      memberships.map((m) => m.userId)
    );

    const { memberships: workspaceMemberships } =
      await MembershipResource.getActiveMemberships({
        users,
        workspace: owner,
      });

    // Only return users that have an active membership in the workspace.
    return users.filter((user) =>
      workspaceMemberships.some((m) => m.userId === user.id)
    );
  }

  async getMemberCount(auth: Authenticator): Promise<number> {
    const owner = auth.getNonNullableWorkspace();

    // The global group does not have a DB entry for each workspace member.
    if (this.isGlobal()) {
      const { memberships } = await MembershipResource.getActiveMemberships({
        workspace: auth.getNonNullableWorkspace(),
      });
      return memberships.length;
    } else {
      return GroupMembershipModel.count({
        where: {
          workspaceId: owner.id,
          groupId: this.id,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
      });
    }
  }

  /**
   * WARNING: Permissions are not checked inside this function and must be checked before calling it.
   */
  async dangerouslyAddMembers(
    auth: Authenticator,
    {
      users,
      transaction,
      allowProvisionedGroups = false,
    }: {
      users: UserType[];
      transaction?: Transaction;
      allowProvisionedGroups?: boolean;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    assert(
      this.isRegularAuto() ||
        this.isRegularManual() ||
        this.kind === "agent_editors" ||
        (allowProvisionedGroups && this.kind === "provisioned"),
      `You can't add members to ${this.kind} groups.`
    );
    const owner = auth.getNonNullableWorkspace();

    if (users.length === 0) {
      return new Ok(undefined);
    }

    const userIds = users.map((u) => u.sId);
    const userResources = await UserResource.fetchByIds(userIds);

    if (userResources.length !== userIds.length) {
      return new Err(
        new DustError(
          "user_not_found",
          userIds.length === 1 ? "User not found" : "Some users were not found"
        )
      );
    }

    const { memberships: workspaceMemberships } =
      await MembershipResource.getActiveMemberships({
        users: userResources,
        workspace: owner,
      });

    if (
      new Set(workspaceMemberships.map((m) => m.userId)).size !== userIds.length
    ) {
      return new Err(
        new DustError(
          "user_not_found",
          userIds.length === 1
            ? "Cannot add: user is not a member of the workspace"
            : "Cannot add: users are not members of the workspace"
        )
      );
    }

    // Check if the user is already a member of the group.
    const activeMembers = await this.getActiveMembers(auth, { transaction });
    const activeMembersIds = activeMembers.map((m) => m.sId);
    const alreadyActiveUserIds = userIds.filter((userId) =>
      activeMembersIds.includes(userId)
    );
    if (alreadyActiveUserIds.length > 0) {
      return new Err(
        new DustError(
          "user_already_member",
          alreadyActiveUserIds.length === 1
            ? "Cannot add: user is already a member of the group"
            : "Cannot add: users are already members of the group"
        )
      );
    }

    // Create a new membership.
    await GroupMembershipModel.bulkCreate(
      users.map((user) => ({
        groupId: this.id,
        userId: user.id,
        workspaceId: owner.id,
        startAt: new Date(),
        status: "active" as const,
      })),
      { transaction }
    );

    const workspaceModelId = owner.id;
    const userModelIds = users.map((u) => u.id);
    invalidateCacheAfterCommit(transaction, async () => {
      await GroupResource.batchInvalidateGroupIdsCacheForUsers(
        userModelIds.map((userModelId) => [
          { user: { id: userModelId }, workspace: { id: workspaceModelId } },
        ])
      );
    });

    return new Ok(undefined);
  }

  /**
   * WARNING: Permissions are not checked inside this function and must be checked before calling it.
   */
  async dangerouslyAddMember(
    auth: Authenticator,
    {
      user,
      transaction,
      allowProvisionedGroups = false,
    }: {
      user: UserType;
      transaction?: Transaction;
      allowProvisionedGroups?: boolean;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    return this.dangerouslyAddMembers(auth, {
      users: [user],
      transaction,
      allowProvisionedGroups,
    });
  }

  /**
   * WARNING: Permissions are not checked inside this function and must be checked before calling it.
   */
  async dangerouslyRemoveMembers(
    auth: Authenticator,
    {
      users,
      transaction,
      allowProvisionedGroups = false,
    }: {
      users: UserType[];
      transaction?: Transaction;
      allowProvisionedGroups?: boolean;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
      >
    >
  > {
    assert(
      this.isRegularAuto() ||
        this.isRegularManual() ||
        this.kind === "agent_editors" ||
        (allowProvisionedGroups && this.kind === "provisioned"),
      `You can't remove members from ${this.kind} groups.`
    );
    const owner = auth.getNonNullableWorkspace();
    if (users.length === 0) {
      return new Ok(undefined);
    }

    const userIds = users.map((u) => u.sId);
    const userResources = await UserResource.fetchByIds(userIds);
    if (userResources.length !== userIds.length) {
      return new Err(
        new DustError(
          "user_not_found",
          userIds.length === 1 ? "User not found" : "Users not found"
        )
      );
    }
    const { total } = await MembershipResource.getActiveMemberships({
      users: userResources,
      workspace: owner,
    });

    if (total !== userIds.length) {
      return new Err(
        new DustError(
          "user_not_member",
          userIds.length === 1
            ? "Cannot remove: user is not a member of the workspace"
            : "Cannot remove: users are not members of the workspace"
        )
      );
    }

    // Check if the users are already a member of the group.
    const activeMembers = await this.getActiveMembers(auth);
    const activeMembersIds = activeMembers.map((m) => m.sId);
    const notActiveUserIds = userIds.filter(
      (userId) => !activeMembersIds.includes(userId)
    );
    if (notActiveUserIds.length > 0) {
      return new Err(
        new DustError(
          "user_not_member",
          notActiveUserIds.length === 1
            ? "Cannot remove: user is not a member of the group"
            : "Cannot remove: users are not members of the group"
        )
      );
    }

    // Remove group membership.
    await GroupMembershipModel.update(
      { endAt: new Date() },
      {
        where: {
          groupId: this.id,
          userId: users.map((u) => u.id),
          workspaceId: owner.id,
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      }
    );

    const workspaceModelId = owner.id;
    const userModelIds = users.map((u) => u.id);
    invalidateCacheAfterCommit(transaction, async () => {
      await GroupResource.batchInvalidateGroupIdsCacheForUsers(
        userModelIds.map((userModelId) => [
          { user: { id: userModelId }, workspace: { id: workspaceModelId } },
        ])
      );
    });

    return new Ok(undefined);
  }

  /**
   * WARNING: Permissions are not checked inside this function and must be checked before calling it.
   */
  async dangerouslyRemoveMember(
    auth: Authenticator,
    {
      user,
      transaction,
      allowProvisionedGroups = false,
    }: {
      user: UserType;
      transaction?: Transaction;
      allowProvisionedGroups?: boolean;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
      >
    >
  > {
    return this.dangerouslyRemoveMembers(auth, {
      users: [user],
      transaction,
      allowProvisionedGroups,
    });
  }

  /**
   * Allows the authenticated user to leave the group.
   *
   * Unlike removeMembers(), this method does not require admin/editor permissions.
   * Users can always remove themselves from groups they are members of.
   *
   * Only works for "regular_auto" groups.
   * TODO(remy): Replace this with dangerouslyRemoveMembers once available
   */
  async leaveGroup(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<
    Result<undefined, DustError<"user_not_member" | "system_or_global_group">>
  > {
    const user = auth.getNonNullableUser();
    const workspace = auth.getNonNullableWorkspace();

    if (!this.isRegularAuto()) {
      return new Err(
        new DustError(
          "system_or_global_group",
          "Users can only leave regular groups."
        )
      );
    }

    const now = new Date();

    const [updatedCount] = await GroupMembershipModel.update(
      { endAt: now },
      {
        where: {
          groupId: this.id,
          userId: user.id,
          workspaceId: workspace.id,
          startAt: { [Op.lte]: now },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
        },
        transaction,
      }
    );

    if (updatedCount === 0) {
      return new Err(
        new DustError("user_not_member", "User is not a member of this group.")
      );
    }

    const userId = user.id;
    const workspaceId = workspace.id;
    invalidateCacheAfterCommit(transaction, async () => {
      await GroupResource.invalidateGroupIdsCacheForUser({
        user: { id: userId },
        workspace: { id: workspaceId },
      });
    });

    return new Ok(undefined);
  }

  /**
   * WARNING: Permissions are not checked inside this function and must be checked before calling it.
   */
  async dangerouslySetMembers(
    auth: Authenticator,
    {
      users,
      transaction,
    }: {
      users: UserType[];
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      { addedUsers: UserType[]; removedUsers: UserType[] },
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    const userIds = users.map((u) => u.sId);
    const currentMembers = await this.getActiveMembers(auth, { transaction });
    const currentMemberIds = currentMembers.map((member) => member.sId);

    // Add new members.
    const usersToAdd = users.filter(
      (user) => !currentMemberIds.includes(user.sId)
    );
    if (usersToAdd.length > 0) {
      const addResult = await this.dangerouslyAddMembers(auth, {
        users: usersToAdd,
        transaction,
      });
      if (addResult.isErr()) {
        return addResult;
      }
    }

    // Remove users that are not in the new list.
    const usersToRemove = currentMembers
      .filter((currentMember) => !userIds.includes(currentMember.sId))
      .map((m) => m.toJSON());
    if (usersToRemove.length > 0) {
      const removeResult = await this.dangerouslyRemoveMembers(auth, {
        users: usersToRemove,
        transaction,
      });
      if (removeResult.isErr()) {
        return removeResult;
      }
    }

    return new Ok({ addedUsers: usersToAdd, removedUsers: usersToRemove });
  }

  /**
   * Suspends all active members of this group.
   * Returns array of affected user ModelIds.
   */
  async suspendMembers(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ModelId[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const affectedMemberships = await GroupMembershipModel.findAll({
      where: {
        groupId: this.id,
        workspaceId,
        status: "active",
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
      attributes: ["userId"],
      transaction,
    });
    const affectedUserIds = [
      ...new Set(affectedMemberships.map((m) => m.userId)),
    ];

    await GroupMembershipModel.update(
      { status: "suspended" },
      {
        where: {
          groupId: this.id,
          workspaceId,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      }
    );

    if (affectedUserIds.length > 0) {
      invalidateCacheAfterCommit(transaction, async () => {
        await GroupResource.batchInvalidateGroupIdsCacheForUsers(
          affectedUserIds.map((userId) => [
            { user: { id: userId }, workspace: { id: workspaceId } },
          ])
        );
      });
    }

    return affectedUserIds;
  }

  /**
   * Restores group memberships for a user that were ended at approximately the
   * same time as a workspace membership revocation. Called when a user rejoins
   * a workspace to preserve their previously-held group memberships (e.g. agent
   * editor access).
   *
   * Only restores memberships that were active (not suspended) and whose `endAt`
   * falls within `toleranceMs` of `revokedAt`. Skips global and system groups
   * (membership is implicit). Skips groups that no longer exist or where the
   * user already has an active membership.
   *
   * Returns the number of group memberships restored.
   */
  static async restoreGroupMembershipsRevokedWith({
    user,
    workspace,
    revokedAt,
    toleranceMs = 60_000,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    revokedAt: Date;
    toleranceMs?: number;
    transaction?: Transaction;
  }): Promise<number> {
    const rangeStart = new Date(revokedAt.getTime() - toleranceMs);
    const rangeEnd = new Date(revokedAt.getTime() + toleranceMs);

    const revokedMemberships = await GroupMembershipModel.findAll({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        status: "active",
        endAt: {
          [Op.gte]: rangeStart,
          [Op.lte]: rangeEnd,
        },
      },
      transaction,
    });

    if (revokedMemberships.length === 0) {
      return 0;
    }

    const groupIds = [...new Set(revokedMemberships.map((m) => m.groupId))];

    // Verify groups still exist and are not global/system (implicit membership).
    const groups = await GroupModel.findAll({
      where: {
        id: { [Op.in]: groupIds },
        workspaceId: workspace.id,
        kind: { [Op.notIn]: ["global", "system"] },
      },
      transaction,
    });

    if (groups.length === 0) {
      return 0;
    }

    const validGroupIds = new Set(groups.map((g) => g.id));

    // Exclude groups where the user already has an active membership.
    const now = new Date();
    const existingActive = await GroupMembershipModel.findAll({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        groupId: { [Op.in]: [...validGroupIds] },
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      },
      attributes: ["groupId"],
      transaction,
    });
    const alreadyActiveGroupIds = new Set(existingActive.map((m) => m.groupId));

    const groupIdsToRestore = [...validGroupIds].filter(
      (id) => !alreadyActiveGroupIds.has(id)
    );

    if (groupIdsToRestore.length === 0) {
      return 0;
    }

    await GroupMembershipModel.bulkCreate(
      groupIdsToRestore.map((groupId) => ({
        groupId,
        userId: user.id,
        workspaceId: workspace.id,
        startAt: now,
        endAt: null,
        status: "active" as const,
      })),
      { transaction }
    );

    const workspaceModelId = workspace.id;
    const userModelId = user.id;
    invalidateCacheAfterCommit(transaction, async () => {
      await GroupResource.invalidateGroupIdsCacheForUser({
        user: { id: userModelId },
        workspace: { id: workspaceModelId },
      });
    });

    return groupIdsToRestore.length;
  }

  /**
   * Restores all suspended members of this group.
   * Returns array of affected user ModelIds.
   */
  async restoreMembers(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ModelId[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const affectedMemberships = await GroupMembershipModel.findAll({
      where: {
        groupId: this.id,
        workspaceId,
        status: "suspended",
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
      attributes: ["userId"],
      transaction,
    });
    const affectedUserIds = [
      ...new Set(affectedMemberships.map((m) => m.userId)),
    ];

    await GroupMembershipModel.update(
      { status: "active" },
      {
        where: {
          groupId: this.id,
          workspaceId,
          status: "suspended",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      }
    );

    if (affectedUserIds.length > 0) {
      invalidateCacheAfterCommit(transaction, async () => {
        await GroupResource.batchInvalidateGroupIdsCacheForUsers(
          affectedUserIds.map((userId) => [
            { user: { id: userId }, workspace: { id: workspaceId } },
          ])
        );
      });
    }

    return affectedUserIds;
  }

  // Updates

  async updateName(
    auth: Authenticator,
    newName: string
  ): Promise<Result<undefined, Error>> {
    if (!auth.hasPermission("admin", this)) {
      return new Err(new Error("Only admins can update group names."));
    }

    await this.update({ name: newName });
    return new Ok(undefined);
  }

  // Renames a group whose name is owned by an external system of record: a
  // regular_auto group (its space/agent) or a provisioned group (its SCIM
  // directory). The caller is that system of record, so no permission check
  // applies here — user-facing renames must go through `updateName`.
  async dangerouslyUpdateName(
    newName: string
  ): Promise<Result<undefined, Error>> {
    if (!this.isRegularAuto() && !this.isProvisioned()) {
      return new Err(
        new Error(
          "dangerouslyUpdateName is only valid for regular_auto and provisioned groups."
        )
      );
    }

    await this.update({ name: newName });
    return new Ok(undefined);
  }

  async updateRegularManualGroup(
    auth: Authenticator,
    { name, memberIds }: { name?: string; memberIds?: string[] }
  ): Promise<
    Result<
      { addedUsers: UserType[]; removedUsers: UserType[] },
      DustError<
        | "unauthorized"
        | "name_conflict"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_not_found"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    if (!this.isRegularManual()) {
      return new Err(new DustError("group_not_found", "Group not found."));
    }

    // Editing a regular_manual group (name/members) requires `write` on it
    // (workspace admins and managers).
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          `Only workspace admins and ${MANAGER_ROLE_NAME}s can update groups.`
        )
      );
    }

    if (name !== undefined) {
      // Only check for a collision when the name actually changes, so renaming
      // to the same name never raises a conflict against self.
      if (
        name !== this.name &&
        (await GroupResource.groupExistsByName(auth, name))
      ) {
        return new Err(
          new DustError(
            "name_conflict",
            `A group named "${name}" already exists in this workspace.`
          )
        );
      }

      const updateRes = await this.updateName(auth, name);
      if (updateRes.isErr()) {
        return new Err(new DustError("unauthorized", updateRes.error.message));
      }
    }

    if (memberIds !== undefined) {
      const uniqueMemberIds = [...new Set(memberIds)];
      const users = await UserResource.fetchByIds(uniqueMemberIds);
      if (users.length !== uniqueMemberIds.length) {
        return new Err(
          new DustError("user_not_found", "Some users were not found.")
        );
      }

      const setResult = await this.dangerouslySetMembers(auth, {
        users: users.map((u) => u.toJSON()),
      });
      if (setResult.isErr()) {
        return new Err(setResult.error);
      }

      return new Ok(setResult.value);
    }

    return new Ok({ addedUsers: [], removedUsers: [] });
  }

  /**
   * Adds and/or removes members of a manually-managed group, leaving the other members untouched.
   */
  async updateRegularManualGroupMembers(
    auth: Authenticator,
    {
      addUserIds,
      removeUserIds,
    }: { addUserIds: string[]; removeUserIds: string[] }
  ): Promise<
    Result<
      { addedUsers: UserType[]; removedUsers: UserType[] },
      DustError<
        | "unauthorized"
        | "group_not_found"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    if (!this.isRegularManual()) {
      return new Err(new DustError("group_not_found", "Group not found."));
    }

    // Editing a regular_manual group (name/members) requires `write` on it
    // (workspace admins and managers).
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          `Only workspace admins and ${MANAGER_ROLE_NAME}s can update groups.`
        )
      );
    }

    // Both sides are fetched at once, then split back by id.
    const uniqueAddUserIds = [...new Set(addUserIds)];
    const uniqueRemoveUserIds = [...new Set(removeUserIds)];
    const users = await UserResource.fetchByIds([
      ...new Set([...uniqueAddUserIds, ...uniqueRemoveUserIds]),
    ]);
    const usersById = new Map(users.map((u) => [u.sId, u.toJSON()]));

    const addedUsers = removeNulls(
      uniqueAddUserIds.map((userId) => usersById.get(userId))
    );
    const removedUsers = removeNulls(
      uniqueRemoveUserIds.map((userId) => usersById.get(userId))
    );
    if (
      addedUsers.length !== uniqueAddUserIds.length ||
      removedUsers.length !== uniqueRemoveUserIds.length
    ) {
      return new Err(
        new DustError("user_not_found", "Some users were not found.")
      );
    }

    if (addedUsers.length > 0) {
      const addRes = await this.dangerouslyAddMembers(auth, {
        users: addedUsers,
      });
      if (addRes.isErr()) {
        return addRes;
      }
    }

    if (removedUsers.length > 0) {
      const removeRes = await this.dangerouslyRemoveMembers(auth, {
        users: removedUsers,
      });
      if (removeRes.isErr()) {
        return removeRes;
      }
    }

    return new Ok({ addedUsers, removedUsers });
  }

  async deleteRegularManualGroup(
    auth: Authenticator
  ): Promise<
    Result<
      undefined,
      DustError<"unauthorized" | "group_not_found" | "internal_error">
    >
  > {
    if (!this.isRegularManual()) {
      return new Err(new DustError("group_not_found", "Group not found."));
    }

    // Deleting a regular_manual group requires `admin` on it (workspace admins
    // and managers).
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          `Only workspace admins and ${MANAGER_ROLE_NAME}s can delete groups.`
        )
      );
    }

    const deleteRes = await this.delete(auth);
    if (deleteRes.isErr()) {
      return new Err(new DustError("internal_error", deleteRes.error.message));
    }

    return new Ok(undefined);
  }

  // Per-group usage spend limit (excluding seat allowance), applied per member.
  // Pass null to clear the cap.
  // Authorization is handled the same way as user and workspace spend limits:
  // by the route (`ensureIsManager`), and `setGroupSpendLimit` validates the
  // group kind. This is a plain setter, mirroring `updatePoolCapOverride`.
  async updatePoolCap(
    poolCapAwuCredits: number | null
  ): Promise<Result<undefined, Error>> {
    await this.update({ poolCapAwuCredits });
    return new Ok(undefined);
  }

  // Deletion

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();
    try {
      // Fetch active member user IDs before deletion for cache invalidation
      const activeMemberships = await GroupMembershipModel.findAll({
        where: {
          groupId: this.id,
          workspaceId: owner.id,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        attributes: ["userId"],
        transaction,
      });
      const memberUserIds = activeMemberships.map((m) => m.userId);

      await KeyModel.update(
        {
          groupIds: fn("array_remove", col("groupIds"), this.id),
        },
        {
          where: {
            groupIds: { [Op.contains]: [this.id] },
            workspaceId: owner.id,
          },
          transaction,
        }
      );

      await GroupAgentModel.destroy({
        where: {
          groupId: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });

      await GroupMembershipModel.destroy({
        where: {
          groupId: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });

      await GroupPermissionModel.destroy({
        where: {
          groupId: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });

      if (memberUserIds.length > 0) {
        const workspaceId = owner.id;
        invalidateCacheAfterCommit(transaction, async () => {
          await GroupResource.batchInvalidateGroupIdsCacheForUsers(
            memberUserIds.map((userId) => [
              { user: { id: userId }, workspace: { id: workspaceId } },
            ])
          );
        });
      }

      const workspaceId = owner.id;
      invalidateCacheAfterCommit(transaction, () =>
        GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache(workspaceId)
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Permissions

  /**
   * Returns the requested permissions for this resource.
   *
   * Configures two types of access:
   * 1. Group-based: The group's members get read access
   * 2. Role-based: Workspace admins get read and write access
   *
   * For agent_editors groups, the permissions are:
   * 1. Group-based: The group's members get full access
   * 2. Role-based: Workspace admins get read and admin access. All users can
   *    read "agent_editors" groups.
   *    Admin do not have write access, they can however add themselves to
   *    groups to gain it.
   *
   * CAUTION: if / when editing, note that for role permissions, permissions are
   * NOT inherited, i.e., if you set a permission for role "user", an "admin"
   * will NOT have it
   *
   * @returns Array of AccessControlList objects defining the default access
   * configuration
   */
  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    // regular_manual: admins and managers manage the group; everyone can read.
    if (this.isRegularManual()) {
      return [
        {
          roles: [
            { role: "admin", permissions: ["read", "write", "admin"] },
            { role: "manager", permissions: ["read", "write", "admin"] },
            { role: "user", permissions: ["read"] },
            { role: "builder", permissions: ["read"] },
          ],
          workspaceId: this.workspaceId,
        },
      ];
    }

    // global, provisioned, regular_auto: read-only for every workspace member.
    // Write/admin are gated through the associated resource (space/agent).
    if (this.isGlobal() || this.isProvisioned() || this.isRegularAuto()) {
      return [
        {
          roles: [
            { role: "admin", permissions: ["read"] },
            { role: "manager", permissions: ["read"] },
            { role: "user", permissions: ["read"] },
            { role: "builder", permissions: ["read"] },
          ],
          workspaceId: this.workspaceId,
        },
      ];
    }

    // system: internal group — no one can read or write. The single empty grant
    // denies every verb (an empty ACL array would instead vacuously allow).
    return [
      {
        roles: [],
        workspaceId: this.workspaceId,
      },
    ];
  }

  canRead(auth: Authenticator): boolean {
    return auth.hasPermission("read", this);
  }

  canWrite(auth: Authenticator): boolean {
    return auth.hasPermission("write", this);
  }

  canAdministrate(auth: Authenticator): boolean {
    return auth.hasPermission("admin", this);
  }

  isSystem(): boolean {
    return this.kind === "system";
  }

  isGlobal(): boolean {
    return this.kind === "global";
  }

  isRegularAuto(): boolean {
    return this.kind === "regular_auto";
  }

  isRegularManual(): boolean {
    return isRegularManualGroupKind(this.kind);
  }

  isProvisioned(): boolean {
    return this.kind === "provisioned";
  }

  /**
   * Checks if dust-admins, dust-managers groups exist and are actively provisioned in the workspace.
   * This indicates that role management should be restricted in the UI.
   */
  static async listRoleProvisioningGroupsForWorkspace(
    auth: Authenticator
  ): Promise<GroupResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Check if workspace has WorkOS organization ID (required for provisioning)
    if (!owner.workOSOrganizationId) {
      return [];
    }

    const provisionedGroups = await this.baseFetch(auth, {
      where: {
        kind: "provisioned",
        name: {
          [Op.in]: [ADMIN_GROUP_NAME, MANAGER_GROUP_NAME],
        },
      },
    });

    return provisionedGroups;
  }

  /**
   * Associates a group with an agent configuration.
   */
  async addGroupToAgentConfiguration({
    auth,
    agentConfiguration,
    transaction,
  }: {
    auth: Authenticator;
    agentConfiguration: AgentConfigurationModel;
    transaction?: Transaction;
  }): Promise<Result<void, Error>> {
    assert(
      this.kind === "agent_editors",
      "Group must be an agent editors group"
    );
    const owner = auth.getNonNullableWorkspace();
    if (
      owner.id !== this.workspaceId ||
      owner.id !== agentConfiguration.workspaceId
    ) {
      return new Err(
        new Error(
          "Group and agent configuration must belong to the same workspace."
        )
      );
    }

    try {
      await GroupAgentModel.create(
        {
          groupId: this.id,
          agentConfigurationId: agentConfiguration.id,
          workspaceId: owner.id,
        },
        { transaction }
      );
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  // JSON Serialization

  toJSON(): GroupType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      workspaceId: this.workspaceId,
      kind: this.kind,
      memberCount: 0, // Default value, use toJSONWithMemberCount for actual count
      poolCapAwuCredits: this.poolCapAwuCredits,
    };
  }

  async toJSONWithMemberCount(auth: Authenticator): Promise<GroupType> {
    const memberCount = await this.getMemberCount(auth);
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      workspaceId: this.workspaceId,
      kind: this.kind,
      memberCount,
      poolCapAwuCredits: this.poolCapAwuCredits,
    };
  }

  /**
   * Batched counterpart of `toJSONWithMemberCount`: resolves the member counts of all the groups in
   * a single query instead of one per group.
   */
  static async toJSONWithMemberCounts(
    auth: Authenticator,
    groups: GroupResource[]
  ): Promise<GroupType[]> {
    const memberCounts = await GroupResource.getMemberCountsForGroups(
      auth,
      groups
    );

    return groups.map((group) => ({
      ...group.toJSON(),
      memberCount: memberCounts.get(group.id) ?? 0,
    }));
  }

  /**
   * Batched counterpart of `toJSONWithMemberCount` that also carries each
   * group's active member sIds, resolved in two queries total regardless of
   * group count.
   */
  static async fetchJSONWithMembers(
    auth: Authenticator,
    groups: GroupResource[]
  ): Promise<(GroupType & { memberIds: string[] })[]> {
    const membershipsByGroup =
      await GroupResource.getActiveMembershipsForGroups(auth, groups);
    const userModelIds = [...new Set(Object.values(membershipsByGroup).flat())];
    const users = await UserResource.fetchByModelIds(userModelIds);
    const sIdByModelId = new Map(users.map((user) => [user.id, user.sId]));

    return groups.map((group) => {
      const memberIds = removeNulls(
        (membershipsByGroup[group.id] ?? []).map((userModelId) =>
          sIdByModelId.get(userModelId)
        )
      );
      return {
        ...group.toJSON(),
        memberCount: memberIds.length,
        memberIds,
      };
    });
  }
}
