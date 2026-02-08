import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { CombinedResourcePermissions, Result, UserType } from "@app/types";
import { Err, Ok } from "@app/types";

// Base class for group-space junction resources
// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceBaseResource
  extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class GroupSpaceBaseResource extends BaseResource<GroupSpaceModel> {
  static model: ModelStatic<GroupSpaceModel> = GroupSpaceModel;

  constructor(
    model: ModelStatic<GroupSpaceModel>,
    blob: Attributes<GroupSpaceModel>,
    readonly space: SpaceResource,
    readonly group: GroupResource
  ) {
    super(GroupSpaceModel, blob);
  }

  abstract requestedPermissions(): Promise<CombinedResourcePermissions[]>;
  abstract canAddMember(auth: Authenticator, userId: string): Promise<boolean>;
  abstract canRemoveMember(
    auth: Authenticator,
    userId: string
  ): Promise<boolean>;

  /**
   * Add multiple members to the group with permissions from this group-space relationship.
   */
  async addMembers(
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
    const addMembersRes = await this.group.addMembers(auth, {
      users,
      transaction,
    });
    if (addMembersRes.isErr()) {
      return new Err(addMembersRes.error);
    }
    return new Ok(addMembersRes.value);
  }

  /**
   * Remove multiple members from the group with permissions from this group-space relationship.
   */
  async removeMembers(
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
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
      >
    >
  > {
    const removeMembersRes = await this.group.removeMembers(auth, {
      users,
      transaction,
    });
    if (removeMembersRes.isErr()) {
      return new Err(removeMembersRes.error);
    }
    return new Ok(removeMembersRes.value);
  }

  /**
   * Set the exact list of members for the group with permissions from this group-space relationship.
   * This will add new members and remove members not in the list.
   */
  async setMembers(
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
      undefined,
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
    const setMembersRes = await this.group.setMembers(auth, {
      users,
      transaction,
    });
    if (setMembersRes.isErr()) {
      return new Err(setMembersRes.error);
    }
    return new Ok(setMembersRes.value);
  }

  /**
   * Delete the group-space relationship.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await GroupSpaceModel.destroy({
        where: {
          groupId: this.groupId,
          vaultId: this.vaultId,
          workspaceId: auth.getNonNullableWorkspace().id,
          kind: this.kind,
        },
        transaction,
      });

      await GroupModel.destroy({
        where: {
          id: this.groupId,
          workspaceId: auth.getNonNullableWorkspace().id,
          // Delete the corresponding group if it's regular or space_editors (system, global, provisioned groups should not be deleted)
          kind: ["regular", "space_editors"],
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
