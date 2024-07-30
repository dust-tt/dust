import type {
  GroupType,
  LightWorkspaceType,
  ModelId,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
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
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

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
    const existingGroups = await GroupModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    const systemGroup =
      existingGroups.find((v) => v.type === "system") ||
      (await GroupResource.makeNew({
        name: "System",
        type: "system",
        workspaceId: workspace.id,
      }));
    const globalGroup =
      existingGroups.find((v) => v.type === "global") ||
      (await GroupResource.makeNew({
        name: "Workspace",
        type: "global",
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
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        stack: new Error().stack,
      },
      "About to delete group"
    );

    try {
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
    logger.info(
      {
        workspaceId: workspace.sId,
        stack: new Error().stack,
      },
      "About to delete all groups for workspace"
    );

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

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<GroupResource | null> {
    const owner = auth.getNonNullableWorkspace();

    const groupModelId = getResourceIdFromSId(sId);
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

  static async fetchWorkspaceGroupsFromKey(
    key: KeyResource
  ): Promise<GroupResource[]> {
    // TODO(GROUPS_INFRA): we need to pull the groups associated with the key once that's built.
    const group = await this.model.findOne({
      where: {
        workspaceId: key.workspaceId,
        type: key.isSystem ? "system" : "global",
      },
    });

    if (!group) {
      throw new Error("Group for key not found.");
    }

    return [new this(GroupModel, group.get())];
  }

  static async internalFetchWorkspaceGlobalGroup(
    workspaceId: ModelId
  ): Promise<GroupResource> {
    const group = await this.model.findOne({
      where: {
        workspaceId,
        type: "global",
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
        type: "system",
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
        type: "global",
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

  static async fetchWorkspaceGroup(
    auth: Authenticator,
    groupId: string
  ): Promise<GroupResource | null> {
    const owner = auth.getNonNullableWorkspace();
    const groupModelId = getResourceIdFromSId(groupId);

    if (!groupModelId) {
      throw new Error("Invalid group ID.");
    }

    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        id: groupModelId,
      },
    });

    if (!group) {
      return null;
    }

    return new this(GroupModel, group.get());
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
        type: "global",
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

  async addMember(
    auth: Authenticator,
    user: UserType,
    transaction?: Transaction
  ): Promise<
    Result<
      undefined,
      {
        type:
          | "user_not_found"
          | "user_not_workspace_member"
          | "group_not_regular"
          | "user_already_group_member";
      }
    >
  > {
    // Checking that the user is a member of the workspace.
    const owner = auth.getNonNullableWorkspace();
    const userResource = await UserResource.fetchById(user.sId);
    if (!userResource) {
      return new Err({ type: "user_not_found" });
    }
    const workspaceMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: userResource,
        workspace: owner,
        transaction,
      });

    if (!workspaceMembership) {
      return new Err({ type: "user_not_workspace_member" });
    }

    // Users can only be added to regular groups.
    if (this.type !== "regular") {
      return new Err({ type: "group_not_regular" });
    }

    // Check if the user is already a member of the group.
    const existingMembership = await GroupMembershipModel.findOne({
      where: {
        groupId: this.id,
        userId: user.id,
        workspaceId: owner.id,
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
      transaction,
    });

    if (existingMembership) {
      return new Err({ type: "user_already_group_member" });
    }

    // Create a new membership.
    await GroupMembershipModel.create(
      {
        groupId: this.id,
        userId: user.id,
        workspaceId: owner.id,
        startAt: new Date(),
      },
      { transaction }
    );

    return new Ok(undefined);
  }

  toJSON(): GroupType {
    return {
      id: this.id,
      name: this.name,
      workspaceId: this.workspaceId,
      type: this.type,
    };
  }
}
