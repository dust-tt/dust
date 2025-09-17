import type {
  DirectoryGroup,
  DirectoryGroup as WorkOSGroup,
} from "@workos-inc/node";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Includeable,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  GroupKind,
  GroupType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  ModelId,
  ResourcePermission,
  Result,
  RolePermission,
  UserType,
} from "@app/types";
import {
  AGENT_GROUP_PREFIX,
  Err,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";

export const ADMIN_GROUP_NAME = "dust-admins";
export const BUILDER_GROUP_NAME = "dust-builders";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface GroupResource extends ReadonlyAttributesType<GroupModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupResource extends BaseResource<GroupModel> {
  static model: ModelStatic<GroupModel> = GroupModel;

  constructor(model: ModelStatic<GroupModel>, blob: Attributes<GroupModel>) {
    super(GroupModel, blob);
  }

  static async makeNew(
    blob: CreationAttributes<GroupModel>,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const group = await GroupModel.create(blob, { transaction });

    return new this(GroupModel, group.get());
  }

  /**
   * Creates a new agent editors group for the given agent and adds the creating
   * user to it.
   */
  static async makeNewAgentEditorsGroup(
    auth: Authenticator,
    agent: AgentConfiguration,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const user = auth.getNonNullableUser();
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
      { transaction }
    );

    // Add user to the newly created group. For the specific purpose of
    // agent_editors group creation, we don't use addMembers, since admins or
    // existing members of the group can add/remove members this way. We create
    // the relation directly.
    await GroupMembershipModel.create(
      {
        groupId: defaultGroup.id,
        userId: user.id,
        workspaceId: workspace.id,
        startAt: new Date(),
      },
      { transaction }
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

    const groupAgent = groupAgents[0];

    const group = await GroupResource.fetchById(
      auth,
      GroupResource.modelIdToSId({
        id: groupAgent.groupId,
        workspaceId: owner.id,
      })
    );

    if (group.isErr()) {
      return group;
    }

    if (group.value.kind !== "agent_editors") {
      // Should not happen based on creation logic, but good to check.
      // Might change when we allow other group kinds to be associated with agents.
      return new Err(
        new DustError(
          "internal_error",
          "Associated group is not an agent_editors group."
        )
      );
    }

    return group;
  }

  /**
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

    const groups = await GroupResource.fetchByIds(
      auth,
      groupAgents.map((ga) =>
        GroupResource.modelIdToSId({
          id: ga.groupId,
          workspaceId: owner.id,
        })
      )
    );

    if (groups.isErr()) {
      return groups;
    }

    if (groups.value.some((g) => g.kind !== "agent_editors")) {
      // Should not happen based on creation logic, but good to check.
      // Might change when we allow other group kinds to be associated with agents.
      return new Err(
        new Error("Associated group is not an agent_editors group.")
      );
    }

    const r = groupAgents.reduce<Record<string, GroupResource>>((acc, ga) => {
      if (ga.agentConfigurationId) {
        const agentConfiguration = agent.find(
          (a) => a.id === ga.agentConfigurationId
        );
        const group = groups.value.find((g) => g.id === ga.groupId);
        if (group && agentConfiguration) {
          acc[agentConfiguration.sId] = group;
        }
      }
      return acc;
    }, {});

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

  static async makeNewProvisionedGroup(
    auth: Authenticator,
    {
      workspace,
      workOSGroup,
    }: {
      workspace: LightWorkspaceType;
      workOSGroup: WorkOSGroup;
    }
  ): Promise<{ success: boolean }> {
    const groupsWithSameName = await this.baseFetch(auth, {
      where: {
        name: workOSGroup.name, // Relying on the index (workspaceId, name).
      },
    });
    if (groupsWithSameName.length > 0) {
      return { success: false };
    }

    await this.makeNew({
      kind: "provisioned",
      name: workOSGroup.name,
      workOSGroupId: workOSGroup.id,
      workspaceId: workspace.id,
    });

    return { success: true };
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
    groupKinds = ["global", "regular", "system", "provisioned"],
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
    key: KeyResource,
    groupKinds: GroupKind[] = ["global", "regular", "system", "provisioned"]
  ): Promise<GroupResource[]> {
    let groups: GroupModel[] = [];

    if (key.isSystem) {
      groups = await this.model.findAll({
        where: {
          workspaceId: key.workspaceId,
          kind: {
            [Op.in]: groupKinds,
          },
        },
      });
    } else if (key.scope === "restricted_group_only") {
      // Special case for restricted keys.
      // Those are regular keys for witch we want to restrict access to the global group.
      groups = await this.model.findAll({
        where: {
          workspaceId: key.workspaceId,
          id: key.groupId,
        },
      });
    } else {
      // We fetch the associated group and the global group.
      groups = await this.model.findAll({
        where: {
          workspaceId: key.workspaceId,
          [Op.or]: [{ id: key.groupId }, { kind: "global" }],
        },
      });
    }

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
    { includes, limit, order, where }: ResourceFindOptions<GroupModel> = {}
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
    });
    return groupModels.map((b) => new this(this.model, b.get()));
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
          authGroupIds: auth.groups().map((g) => g.sId),
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
      await groupResource.updateName(auth, directoryGroup.name);
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

  static async fetchByAgentConfiguration({
    auth,
    agentConfiguration,
    isDeletionFlow = false,
  }: {
    auth: Authenticator;
    agentConfiguration: AgentConfiguration | AgentConfigurationType;
    isDeletionFlow?: boolean;
  }): Promise<GroupResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const groupAgents = await GroupAgentModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: GroupModel,
          where: {
            workspaceId: workspace.id,
            kind: "agent_editors",
          },
          required: true,
        },
      ],
    });

    if (
      agentConfiguration.status === "draft" ||
      agentConfiguration.scope === "global"
    ) {
      if (groupAgents.length === 0) {
        return null;
      }
      throw new Error(
        "Unexpected: draft or global agent shouldn't have an editor group."
      );
    }

    // In the case of agents deletion, it is possible that the agent has no
    // editor group associated with it, because the group may have been deleted
    // when deleting another version of the agent with the same sId.
    if (isDeletionFlow && groupAgents.length === 0) {
      return null;
    }

    // In other cases, the agent should always have exactly one editor group.
    if (groupAgents.length !== 1) {
      throw new Error(
        "Unexpected: agent should have exactly one editor group."
      );
    }

    const group = await groupAgents[0].getGroup();

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceSystemGroup(
    auth: Authenticator
  ): Promise<Result<GroupResource, DustError>> {
    // Only admins can fetch the system group.
    if (!auth.isAdmin()) {
      return new Err(
        new DustError("unauthorized", "Only `admins` can view the system group")
      );
    }

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
    options: { groupKinds?: GroupKind[] } = {}
  ): Promise<GroupResource[]> {
    const { groupKinds = ["global", "regular", "provisioned"] } = options;
    const groups = await this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: groupKinds,
        },
      },
    });

    return groups.filter((group) => group.canRead(auth));
  }

  static async listForSpaceById(
    auth: Authenticator,
    spaceId: string,
    options: { groupKinds?: GroupKind[] } = {}
  ): Promise<GroupResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const spaceModelId = getResourceIdFromSId(spaceId);

    if (!spaceModelId) {
      return [];
    }

    // Find groups associated with the space through GroupSpaceModel
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        vaultId: spaceModelId,
        workspaceId: workspace.id,
      },
      attributes: ["groupId"],
    });

    if (groupSpaces.length === 0) {
      return [];
    }

    const groupIds = groupSpaces.map((gs) => gs.groupId);
    const { groupKinds } = options;

    const whereClause: any = {
      id: {
        [Op.in]: groupIds,
      },
    };

    // Apply groupKinds filter if provided
    if (groupKinds && groupKinds.length > 0) {
      whereClause.kind = {
        [Op.in]: groupKinds,
      };
    }

    const groups = await this.baseFetch(auth, {
      where: whereClause,
    });

    return groups.filter((group) => group.canRead(auth));
  }

  static async listUserGroupsInWorkspace({
    user,
    workspace,
    groupKinds = ["global", "regular", "provisioned", "agent_editors"],
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    groupKinds?: Omit<GroupKind, "system">[];
    transaction?: Transaction;
  }): Promise<GroupResource[]> {
    // First we need to check if the user is a member of the workspace.
    const workspaceMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
        transaction,
      });
    if (!workspaceMembership) {
      return [];
    }

    // If yes, we can fetch the groups the user is a member of.
    // First the global group which has no db entries and is always present.
    let globalGroup = null;
    if (groupKinds.includes("global")) {
      globalGroup = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          kind: "global",
        },
        transaction,
      });

      if (!globalGroup) {
        throw new Error("Global group not found.");
      }
    }

    const userGroups = await GroupModel.findAll({
      include: [
        {
          model: GroupMembershipModel,
          where: {
            userId: user.id,
            workspaceId: workspace.id,
            startAt: { [Op.lte]: new Date() },
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          },
          required: true,
        },
      ],
      where: {
        workspaceId: workspace.id,
        kind: {
          // The 'as' clause is tautological but required by TS who does not
          // understand that groupKinds.filter() returns a GroupKind[]
          [Op.in]: groupKinds.filter((k) => k !== "global") as GroupKind[],
        },
      },
      transaction,
    });

    const groups = [...(globalGroup ? [globalGroup] : []), ...userGroups];

    return groups.map((group) => new this(GroupModel, group.get()));
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
      },
    });

    return !!membership;
  }

  async getActiveMembers(auth: Authenticator): Promise<UserResource[]> {
    const owner = auth.getNonNullableWorkspace();

    let memberships: GroupMembershipModel[] | MembershipResource[];

    // The global group does not have a DB entry for each workspace member.
    if (this.isGlobal()) {
      const { memberships: m } = await MembershipResource.getActiveMemberships({
        workspace: auth.getNonNullableWorkspace(),
      });
      memberships = m;
    } else {
      memberships = await GroupMembershipModel.findAll({
        where: {
          groupId: this.id,
          workspaceId: owner.id,
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
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
          groupId: this.id,
          workspaceId: owner.id,
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
      });
    }
  }

  async addMembers(
    auth: Authenticator,
    users: UserType[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "system_or_global_group"
      >
    >
  > {
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only admins or group editors can change group members"
        )
      );
    }
    const owner = auth.getNonNullableWorkspace();

    if (users.length === 0) {
      return new Ok(undefined);
    }

    const userIds = users.map((u) => u.sId);
    const userResources = await UserResource.fetchByIds(userIds);
    if (userResources.length !== userIds.length) {
      new Err(
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

    // Users can only be added to regular, agent_editors or provisioned groups.
    if (!["regular", "agent_editors", "provisioned"].includes(this.kind)) {
      return new Err(
        new DustError(
          "system_or_global_group",
          "Users can only be added to regular, agent_editors or provisioned groups."
        )
      );
    }

    // Check if the user is already a member of the group.
    const activeMembers = await this.getActiveMembers(auth);
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
      })),
      { transaction }
    );

    return new Ok(undefined);
  }

  async addMember(
    auth: Authenticator,
    user: UserType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, DustError>> {
    return this.addMembers(auth, [user], { transaction });
  }

  async removeMembers(
    auth: Authenticator,
    users: UserType[],
    { transaction }: { transaction?: Transaction } = {}
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
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only admins or group editors can change group members"
        )
      );
    }
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

    // Users can only be added to regular, agent_editors or provisioned groups.
    if (!["regular", "agent_editors", "provisioned"].includes(this.kind)) {
      return new Err(
        new DustError(
          "system_or_global_group",
          "Users can only be removed from regular, agent_editors or provisioned groups."
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

    return new Ok(undefined);
  }

  async removeMember(
    auth: Authenticator,
    users: UserType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, DustError>> {
    return this.removeMembers(auth, [users], { transaction });
  }

  async setMembers(
    auth: Authenticator,
    users: UserType[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "system_or_global_group"
      >
    >
  > {
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only `admins` are authorized to manage groups"
        )
      );
    }

    const userIds = users.map((u) => u.sId);
    const currentMembers = await this.getActiveMembers(auth);
    const currentMemberIds = currentMembers.map((member) => member.sId);

    // Add new members.
    const usersToAdd = users.filter(
      (user) => !currentMemberIds.includes(user.sId)
    );
    if (usersToAdd.length > 0) {
      const addResult = await this.addMembers(auth, usersToAdd, {
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
      const removeResult = await this.removeMembers(auth, usersToRemove, {
        transaction,
      });
      if (removeResult.isErr()) {
        return removeResult;
      }
    }

    return new Ok(undefined);
  }

  // Updates

  async updateName(
    auth: Authenticator,
    newName: string
  ): Promise<Result<undefined, Error>> {
    if (!auth.canAdministrate(this.requestedPermissions())) {
      return new Err(new Error("Only admins can update group names."));
    }

    await this.update({ name: newName });
    return new Ok(undefined);
  }

  // Deletion

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await KeyModel.destroy({
        where: {
          groupId: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });

      await GroupSpaceModel.destroy({
        where: {
          groupId: this.id,
        },
        transaction,
      });

      await GroupAgentModel.destroy({
        where: {
          groupId: this.id,
        },
        transaction,
      });

      await GroupMembershipModel.destroy({
        where: {
          groupId: this.id,
        },
        transaction,
      });

      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

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
   * 1. Group-based: The group's members get read and write access
   * 2. Role-based: Workspace admins get read and write access. All users can
   *    read "agent_editors" groups.
   *
   * CAUTION: if / when editing, note that for role permissions, permissions are
   * NOT inherited, i.e. if you set a permission for role "user", an "admin"
   * will NOT have it
   *
   * @returns Array of ResourcePermission objects defining the default access
   * configuration
   */
  requestedPermissions(): ResourcePermission[] {
    const userReadPermissions: RolePermission[] = [
      {
        role: "user",
        permissions: ["read"],
      },
      {
        role: "builder",
        permissions: ["read"],
      },
    ];
    return [
      {
        groups: [
          {
            id: this.id,
            permissions:
              this.kind === "agent_editors" ? ["read", "write"] : ["read"],
          },
        ],
        roles: [
          { role: "admin", permissions: ["read", "write", "admin"] },
          ...(this.kind === "agent_editors" ? userReadPermissions : []),
        ],
        workspaceId: this.workspaceId,
      },
    ];
  }

  canRead(auth: Authenticator): boolean {
    return auth.canRead(this.requestedPermissions());
  }

  canWrite(auth: Authenticator): boolean {
    return auth.canWrite(this.requestedPermissions());
  }

  isSystem(): boolean {
    return this.kind === "system";
  }

  isGlobal(): boolean {
    return this.kind === "global";
  }

  isRegular(): boolean {
    return this.kind === "regular";
  }

  isProvisioned(): boolean {
    return this.kind === "provisioned";
  }

  /**
   * Checks if dust-builders and dust-admins groups exist and are actively provisioned
   * in the workspace. This indicates that role management should be restricted in the UI.
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
          [Op.in]: [ADMIN_GROUP_NAME, BUILDER_GROUP_NAME],
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
    agentConfiguration: AgentConfiguration;
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
    };
  }
}
