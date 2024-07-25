import type { LightWorkspaceType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

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

  static async fetchWorkspaceGroups(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const groups = await this.model.findAll({
      where: {
        workspaceId: owner.id,
      },
      transaction,
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  static async fetchWorkspaceSystemGroup(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        type: "system",
      },
      transaction,
    });

    if (!group) {
      throw new Error("System group not found.");
    }

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceGlobalGroup(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<GroupResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        type: "global",
      },
      transaction,
    });

    if (!group) {
      throw new Error("Global group not found.");
    }

    return new this(GroupModel, group.get());
  }

  static async fetchWorkspaceGroup(
    auth: Authenticator,
    groupId: string,
    transaction?: Transaction
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
      transaction,
    });

    if (!group) {
      return null;
    }

    return new this(GroupModel, group.get());
  }

  async addMember(
    auth: Authenticator,
    userId: string,
    transaction?: Transaction
  ): Promise<void> {
    const owner = auth.getNonNullableWorkspace();
    const user = await UserResource.fetchById(userId);

    if (!user) {
      throw new Error("User not found.");
    }
    if (this.type !== "regular") {
      throw new Error("Cannot add members to non-regular groups.");
    }

    const workspace = renderLightWorkspaceType({ workspace: owner });
    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
        transaction,
      });

    if (!membership) {
      throw new Error("User is not a member of the workspace.");
    }

    await GroupMembershipModel.create(
      {
        groupId: this.id,
        userId: user.id,
        workspaceId: owner.id,
        startAt: new Date(),
      },
      { transaction }
    );
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      workspaceId: this.workspaceId,
      type: this.type,
    };
  }
}
