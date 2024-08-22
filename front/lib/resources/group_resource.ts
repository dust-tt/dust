import type {
  GroupType,
  LightWorkspaceType,
  ModelId,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupVaultModel } from "@app/lib/resources/storage/models/group_vaults";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";

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

  static async makeNew(blob: CreationAttributes<GroupModel>) {
    const group = await GroupModel.create(blob);

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

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await GroupVaultModel.destroy({
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

  static async deleteAllForWorkspace(
    workspace: LightWorkspaceType,
    transaction?: Transaction
  ) {
    await GroupMembershipModel.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction,
    });
    await this.model.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction,
    });
  }

  static async deleteAllForWorkspaceExceptDefaults(auth: Authenticator) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const groups = await this.model.findAll({
      attributes: ["id"],
      where: {
        workspaceId,
        kind: {
          [Op.notIn]: ["system", "global"],
        },
      },
    });

    const groupIds = groups.map((group) => group.id);

    await GroupMembershipModel.destroy({
      where: {
        workspaceId,
        groupId: {
          [Op.in]: groupIds,
        },
      },
    });

    await this.model.destroy({
      where: {
        id: {
          [Op.in]: groupIds,
        },
        workspaceId,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<GroupResource | null> {
    const owner = auth.getNonNullableWorkspace();

    const groupModelId = getResourceIdFromSId(id);
    if (!groupModelId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        id: groupModelId,
        workspaceId: owner.id,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<GroupResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const groupModelIds = removeNulls(
      ids.map((id) => getResourceIdFromSId(id))
    );
    if (groupModelIds.length === 0) {
      return [];
    }

    const blobs = await this.model.findAll({
      where: {
        id: {
          [Op.in]: groupModelIds,
        },
        workspaceId: owner.id,
      },
    });

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return blobs.map((b) => new this(this.model, b.get()));
  }

  static async superAdminFetchWorkspaceGroups(
    userResource: UserResource,
    workspaceId: ModelId
  ): Promise<GroupResource[]> {
    if (!userResource.isDustSuperUser) {
      throw new Error("User is not a super admin.");
    }

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
    // TODO(GROUPS_INFRA): we need to pull the groups associated with the key once that's built.
    const groups = await this.model.findAll({
      where: {
        workspaceId: key.workspaceId,
        [Op.or]: [
          { kind: key.isSystem ? "system" : "global" },
          { id: key.groupId },
        ],
      },
    });

    if (groups.length === 0) {
      throw new Error("Group for key not found.");
    }

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async getGroupsFromSystemKey(
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

    if (groups.length === 0) {
      throw new Error("Group for key not found.");
    }

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async internalFetchWorkspaceGlobalGroup(
    workspaceId: ModelId
  ): Promise<GroupResource> {
    const group = await this.model.findOne({
      where: {
        workspaceId,
        kind: "global",
      },
    });

    if (!group) {
      throw new Error("Global group not found.");
    }

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceSystemGroup(
    auth: Authenticator
  ): Promise<GroupResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        kind: "system",
      },
    });

    if (!group) {
      throw new Error("System group not found.");
    }

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceGlobalGroup(
    auth: Authenticator
  ): Promise<GroupResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        kind: "global",
      },
    });

    if (!group) {
      throw new Error("Global group not found.");
    }

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceGroups(
    auth: Authenticator
  ): Promise<GroupResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const groups = await this.model.findAll({
      where: {
        workspaceId: owner.id,
      },
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async fetchActiveGroupsOfUserInWorkspace({
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
    const memberships = await GroupMembershipModel.findAll({
      where: {
        groupId: this.id,
        workspaceId: owner.id,
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
    });

    return UserResource.fetchByModelIds(memberships.map((m) => m.userId));
  }

  async addMembers(
    auth: Authenticator,
    users: UserType[]
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    if (users.length === 0) {
      return new Ok(undefined);
    }

    const userIds = users.map((u) => u.sId);
    const userResources = await UserResource.fetchByIds(userIds);
    if (userResources.length !== userIds.length) {
      return new Err(
        userIds.length === 1
          ? new Error("The user was not found.")
          : new Error("Some users were not found.")
      );
    }
    const workspaceMemberships = await MembershipResource.getActiveMemberships({
      users: userResources,
      workspace: owner,
    });

    if (
      new Set(workspaceMemberships.map((m) => m.userId)).size !== userIds.length
    ) {
      return new Err(
        userIds.length === 1
          ? new Error("The user is not member of the workspace.")
          : new Error("Some users are not members of the workspace.")
      );
    }

    // Users can only be added to regular groups.
    if (this.kind !== "regular") {
      return new Err(new Error("Not a regular group, cannot be updated."));
    }

    // Check if the user is already a member of the group.
    const activeMembers = await this.getActiveMembers(auth);
    const activeMembersIds = activeMembers.map((m) => m.sId);
    const alreadyActiveUserIds = userIds.filter((userId) =>
      activeMembersIds.includes(userId)
    );
    if (alreadyActiveUserIds.length > 0) {
      return alreadyActiveUserIds.length === 1
        ? new Err(new Error(`User ${alreadyActiveUserIds} is already member.`))
        : new Err(
            new Error(`Users ${alreadyActiveUserIds} are already members.`)
          );
    }

    // Create a new membership.
    await GroupMembershipModel.bulkCreate(
      users.map((user) => ({
        groupId: this.id,
        userId: user.id,
        workspaceId: owner.id,
        startAt: new Date(),
      }))
    );

    return new Ok(undefined);
  }

  async addMember(
    auth: Authenticator,
    user: UserType
  ): Promise<Result<undefined, Error>> {
    return this.addMembers(auth, [user]);
  }

  async removeMembers(
    auth: Authenticator,
    users: UserType[]
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();
    if (users.length === 0) {
      return new Ok(undefined);
    }

    const userIds = users.map((u) => u.sId);
    const userResources = await UserResource.fetchByIds(userIds);
    if (userResources.length !== userIds.length) {
      return new Err(
        userIds.length === 1
          ? new Error("The user was not found.")
          : new Error("Some users were not found.")
      );
    }
    const workspaceMemberships = await MembershipResource.getActiveMemberships({
      users: userResources,
      workspace: owner,
    });

    if (workspaceMemberships.length !== userIds.length) {
      return new Err(
        userIds.length === 1
          ? new Error("The user is not member of the workspace.")
          : new Error("Some users are not members of the workspace.")
      );
    }

    // Users can only be added to regular groups.
    if (this.kind !== "regular") {
      return new Err(new Error("Not a regular group, cannot be updated."));
    }

    // Check if the users are already a member of the group.
    const activeMembers = await this.getActiveMembers(auth);
    const activeMembersIds = activeMembers.map((m) => m.sId);
    const notActiveUserIds = userIds.filter(
      (userId) => !activeMembersIds.includes(userId)
    );
    if (notActiveUserIds.length > 0) {
      return notActiveUserIds.length === 1
        ? new Err(new Error(`User ${notActiveUserIds} not a member.`))
        : new Err(new Error(`Users ${notActiveUserIds} are not members.`));
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
      }
    );

    return new Ok(undefined);
  }

  async removeMember(
    auth: Authenticator,
    users: UserType
  ): Promise<Result<undefined, Error>> {
    return this.removeMembers(auth, [users]);
  }

  async setMembers(
    auth: Authenticator,
    users: UserType[]
  ): Promise<Result<undefined, Error>> {
    const userIds = users.map((u) => u.sId);
    const currentMembers = await this.getActiveMembers(auth);
    const currentMemberIds = currentMembers.map((member) => member.sId);

    // Add new members.
    const usersToAdd = users.filter(
      (user) => !currentMemberIds.includes(user.sId)
    );
    if (usersToAdd.length > 0) {
      const addResult = await this.addMembers(auth, usersToAdd);
      if (addResult.isErr()) {
        return addResult;
      }
    }

    // Remove users that are not in the new list.
    const usersToRemove = currentMembers
      .filter((currentMember) => !userIds.includes(currentMember.sId))
      .map((m) => m.toJSON());
    if (usersToRemove.length > 0) {
      const removeResult = await this.removeMembers(auth, usersToRemove);
      if (removeResult.isErr()) {
        return removeResult;
      }
    }

    return new Ok(undefined);
  }

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
