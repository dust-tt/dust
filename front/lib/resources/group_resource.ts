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
import type {
  GroupType,
  LightWorkspaceType,
  ModelId,
  ResourcePermission,
  Result,
  UserType,
} from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";

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

  static async makeDefaultsForWorkspace(workspace: LightWorkspaceType) {
    const existingGroups = (
      await GroupModel.findAll({
        where: {
          workspaceId: workspace.id,
        },
      })
    ).map((group) => new this(GroupModel, group.get()));
    const systemGroup =
      existingGroups.find((v) => v.kind === "system") ||
      (await GroupResource.makeNew({
        name: "System",
        kind: "system",
        workspaceId: workspace.id,
      }));
    const globalGroup =
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
  static async internalFetchAllWorkspaceGroups(
    workspaceId: ModelId
  ): Promise<GroupResource[]> {
    const groups = await this.model.findAll({
      where: {
        workspaceId,
      },
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async listWorkspaceGroupsFromKey(
    key: KeyResource
  ): Promise<GroupResource[]> {
    const whereCondition: WhereOptions<GroupModel> = key.isSystem
      ? // If the key is a system key, we include all groups in the workspace.
        {
          workspaceId: key.workspaceId,
        }
      : // If it's not a system key, we only fetch the associated group.
        {
          workspaceId: key.workspaceId,
          id: key.groupId,
        };

    const groups = await this.model.findAll({
      where: whereCondition,
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
    workspaceId: ModelId
  ): Promise<GroupResource | null> {
    const group = await this.model.findOne({
      where: {
        workspaceId,
        kind: "global",
      },
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
  ): Promise<Result<GroupResource, DustError>> {
    const groupRes = await this.fetchByIds(auth, [id]);

    if (groupRes.isErr()) {
      return groupRes;
    }

    return new Ok(groupRes.value[0]);
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<Result<GroupResource[], DustError>> {
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
          "resource_not_found",
          ids.length === 1 ? "Group not found" : "Some groups were not found"
        )
      );
    }

    if (groups.some((group) => !group.canRead(auth))) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only `admins` or members can view groups"
        )
      );
    }

    return new Ok(groups);
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
        new DustError("resource_not_found", "System group not found")
      );
    }

    return new Ok(group);
  }

  static async fetchWorkspaceGlobalGroup(
    auth: Authenticator
  ): Promise<Result<GroupResource, DustError>> {
    const [group] = await this.baseFetch(auth, {
      where: {
        kind: "global",
      },
    });

    if (!group) {
      return new Err(
        new DustError("resource_not_found", "Global group not found")
      );
    }

    // All members can fetch the global group.

    return new Ok(group);
  }

  static async listAllWorkspaceGroups(
    auth: Authenticator,
    options: { includeSystem?: boolean } = {}
  ): Promise<GroupResource[]> {
    const { includeSystem } = options;
    const groups = await this.baseFetch(auth, {});

    return groups
      .filter((group) => group.canRead(auth))
      .filter((group) => includeSystem || !group.isSystem());
  }

  static async listUserGroupsInWorkspace({
    user,
    workspace,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
  }): Promise<GroupResource[]> {
    // First we need to check if the user is a member of the workspace.
    const workspaceMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    if (!workspaceMembership) {
      return [];
    }

    // If yes, we can fetch the groups the user is a member of.
    // First the global group which has no db entries and is always present.
    const globalGroup = await this.model.findOne({
      where: {
        workspaceId: workspace.id,
        kind: "global",
      },
    });

    if (!globalGroup) {
      throw new Error("Global group not found.");
    }

    const regularGroups = await GroupModel.findAll({
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
    });

    const groups = [globalGroup, ...regularGroups];

    return groups.map((group) => new this(GroupModel, group.get()));
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

  async addMembers(
    auth: Authenticator,
    users: UserType[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, DustError>> {
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError("unauthorized", "Only `admins` can administer groups")
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
          "user_not_member",
          userIds.length === 1
            ? "User is not a member of the workspace"
            : "Users are not members of the workspace"
        )
      );
    }

    // Users can only be added to regular groups.
    if (this.kind !== "regular") {
      return new Err(
        new DustError(
          "system_or_global_group",
          "Users can only be added to regular groups."
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
            ? "User is already a member of the group"
            : "Users are already members of the group"
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
  ): Promise<Result<undefined, DustError>> {
    if (!this.canWrite(auth)) {
      return new Err(
        new DustError("unauthorized", "Only `admins` can administer groups")
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
            ? "User is not a member of the workspace"
            : "Users are not members of the workspace"
        )
      );
    }

    // Users can only be added to regular groups.
    if (this.kind !== "regular") {
      return new Err(
        new DustError(
          "system_or_global_group",
          "Users can only be added to regular groups."
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
            ? "User is not a member of the group"
            : "Users are not members of the group"
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
  ): Promise<Result<undefined, DustError>> {
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
      return new Err(err as Error);
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
   * @returns Array of ResourcePermission objects defining the default access configuration
   */
  requestedPermissions(): ResourcePermission[] {
    return [
      {
        groups: [
          {
            id: this.id,
            permissions: ["read"],
          },
        ],
        roles: [{ role: "admin", permissions: ["read", "write", "admin"] }],
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

  // JSON Serialization

  toJSON(): GroupType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      workspaceId: this.workspaceId,
      kind: this.kind,
    };
  }
}
