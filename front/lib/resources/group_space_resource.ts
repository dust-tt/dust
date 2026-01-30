import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  CombinedResourcePermissions,
  GroupPermission,
} from "@app/types/resource_permissions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";

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

  /**
   * Helper method to find the editor groups for a space.
   * Returns the group_vaults with kind "project_editor".
   */
  async getEditorGroupSpaces(
    filterOnManagementMode: boolean = true
  ): Promise<GroupSpaceEditorResource[]> {
    return GroupSpaceEditorResource.fetchBySpace({
      space: this.space,
      filterOnManagementMode,
    });
  }

  abstract requestedPermissions(): Promise<CombinedResourcePermissions[]>;

  canAddMember(
    auth: Authenticator,
    userId: string,
    requestedPermissions: CombinedResourcePermissions[]
  ): boolean {
    if (this.space.isProject() && this.space.isOpen()) {
      const currentUser = auth.getNonNullableUser();
      if (userId === currentUser.sId) {
        // Users can add themselves to open projects.
        return true;
      }
    }
    return (
      this.space.canAdministrate(auth) && auth.canWrite(requestedPermissions)
    );
  }

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
    const requestedPermissions = await this.requestedPermissions();
    if (
      !users.every((user) =>
        this.canAddMember(auth, user.sId, requestedPermissions)
      )
    ) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to add group members"
        )
      );
    }
    const addMembersRes = await this.group.dangerouslyAddMembers(auth, {
      users,
      transaction,
    });
    if (addMembersRes.isErr()) {
      return new Err(addMembersRes.error);
    }
    return new Ok(addMembersRes.value);
  }

  canRemoveMember(
    auth: Authenticator,
    userId: string,
    requestedPermissions: CombinedResourcePermissions[]
  ): boolean {
    if (this.space.isProject()) {
      const currentUser = auth.getNonNullableUser();
      if (userId === currentUser.sId) {
        // Users can remove themselves from any project.
        return true;
      }
    }
    return (
      this.space.canAdministrate(auth) && auth.canWrite(requestedPermissions)
    );
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
    const requestedPermissions = await this.requestedPermissions();
    if (
      !users.every((user) =>
        this.canRemoveMember(auth, user.sId, requestedPermissions)
      )
    ) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to remove group members"
        )
      );
    }
    const removeMembersRes = await this.group.dangerouslyRemoveMembers(auth, {
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
    // We can probably be smarter here and check only addition and removal permissions separately (only on added and removed users)
    const requestedPermissions = await this.requestedPermissions();
    if (
      !users.every((user) =>
        this.canAddMember(auth, user.sId, requestedPermissions)
      ) ||
      !users.every((user) =>
        this.canRemoveMember(auth, user.sId, requestedPermissions)
      )
    ) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to change group members"
        )
      );
    }
    const setMembersRes = await this.group.dangerouslySetMembers(auth, {
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

// GroupSpaceMemberResource - represents member permission (kind=member)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceMemberResource
  extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupSpaceMemberResource extends GroupSpaceBaseResource {
  constructor(
    model: ModelStatic<GroupSpaceModel>,
    blob: Attributes<GroupSpaceModel>,
    space: SpaceResource,
    group: GroupResource
  ) {
    super(model, blob, space, group);
  }

  static async makeNew(
    auth: Authenticator,
    {
      group,
      space,
      transaction,
    }: {
      group: GroupResource;
      space: SpaceResource;
      transaction?: Transaction;
    }
  ): Promise<GroupSpaceMemberResource> {
    const groupSpace = await GroupSpaceModel.create(
      {
        groupId: group.id,
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        kind: "member",
      },
      { transaction }
    );

    return new GroupSpaceMemberResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  static async fetchBySpace({
    space,
    filterOnManagementMode = false, // if true, filters groups based on space management mode
    transaction,
  }: {
    space: SpaceResource;
    filterOnManagementMode?: boolean;
    transaction?: Transaction;
  }): Promise<GroupSpaceMemberResource[]> {
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        kind: "member",
        vaultId: space.id,
        workspaceId: space.workspaceId,
      },
      transaction,
    });

    const groupSpacesResources = await Promise.all(
      groupSpaces.map(async (groupSpace) => {
        const groupModels = await GroupModel.findAll({
          where: {
            id: groupSpace.groupId,
            workspaceId: space.workspaceId,
          },
          transaction,
        });
        assert(
          groupModels.length === 1,
          "One and only one group must exist for member group space"
        );
        const groupModel = groupModels[0];
        assert(
          groupModel.kind !== "space_editors",
          "Editors groups cannot be member groups"
        );
        if (filterOnManagementMode) {
          // Keep only regular groups in manual mode, provisioned groups in provisioned mode
          const filterOnKind =
            space.managementMode === "manual" ? "regular" : "provisioned";
          if (groupModel.kind !== filterOnKind) {
            return null;
          }
        }
        const group = new GroupResource(GroupModel, groupModel.get());

        return new GroupSpaceMemberResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      })
    );
    return removeNulls(groupSpacesResources);
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    switch (this.space.kind) {
      case "system":
        return [
          {
            groups: [
              {
                id: this.groupId,
                permissions: ["read", "write"],
              },
            ],
            roles: [{ role: "admin", permissions: ["admin", "write"] }],
            workspaceId: this.workspaceId,
          },
        ];
      case "global":
      case "conversations":
        return [
          {
            groups: [
              {
                id: this.groupId,
                permissions: ["read"],
              },
            ],
            roles: [
              { role: "admin", permissions: ["admin", "read", "write"] },
              { role: "builder", permissions: ["read", "write"] },
            ],
            workspaceId: this.workspaceId,
          },
        ];
      case "regular":
        return [
          {
            groups: [
              {
                id: this.group.id,
                permissions: ["read"],
              },
            ],
            roles: [
              {
                role: "admin",
                permissions: ["admin", "read", "write"],
              },
            ],
            workspaceId: this.space.workspaceId,
          },
        ];
      case "project": {
        // Only gets the editor groups correponding to the space management mode
        const editorGroupSpaces = await this.getEditorGroupSpaces(true);
        const editorGroupsPermissions: GroupPermission[] =
          editorGroupSpaces.map((egs) => ({
            id: egs.groupId,
            permissions: ["admin", "read", "write"],
          }));
        return [
          {
            groups: [
              {
                id: this.group.id,
                permissions: ["read"],
              },
              ...editorGroupsPermissions,
            ],
            roles: [
              {
                role: "admin",
                permissions: ["admin", "read", "write"],
              },
            ],
            workspaceId: this.space.workspaceId,
          },
        ];
      }
      default:
        assertNever(this.space.kind);
    }
  }
}

// GroupSpaceEditorResource - represents editor permission (kind=project_editor)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceEditorResource
  extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupSpaceEditorResource extends GroupSpaceBaseResource {
  constructor(
    model: ModelStatic<GroupSpaceModel>,
    blob: Attributes<GroupSpaceModel>,
    space: SpaceResource,
    group: GroupResource
  ) {
    super(model, blob, space, group);
  }

  static async makeNew(
    auth: Authenticator,
    {
      group,
      space,
      transaction,
    }: {
      group: GroupResource;
      space: SpaceResource;
      transaction?: Transaction;
    }
  ): Promise<GroupSpaceEditorResource> {
    assert(space.isProject(), "Editor groups only apply to project spaces");
    assert(
      group.isSpaceEditor() || group.isProvisioned(),
      "Only space editor or provisioned groups can be an editor group"
    );
    const groupSpace = await GroupSpaceModel.create(
      {
        groupId: group.id,
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        kind: "project_editor",
      },
      { transaction }
    );

    return new GroupSpaceEditorResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  static async fetchBySpace({
    space,
    filterOnManagementMode = false, // if true, filters groups based on space management mode
    transaction,
  }: {
    space: SpaceResource;
    filterOnManagementMode?: boolean;
    transaction?: Transaction;
  }): Promise<GroupSpaceEditorResource[]> {
    assert(space.isProject(), "Editor groups only apply to project spaces");
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        kind: "project_editor",
        vaultId: space.id,
        workspaceId: space.workspaceId,
      },
    });

    const groupSpacesResources = await Promise.all(
      groupSpaces.map(async (groupSpace) => {
        const groupModels = await GroupModel.findAll({
          where: {
            id: groupSpace.groupId,
            workspaceId: space.workspaceId,
          },
          transaction,
        });
        assert(
          groupModels.length === 1,
          "One and only one group must exist for editor group space"
        );
        const groupModel = groupModels[0];
        assert(
          groupModel.kind === "space_editors" ||
            groupModel.kind === "provisioned",
          "Only space_editors or provisioned groups can be editor groups"
        );

        if (filterOnManagementMode) {
          // Keep only space_editors groups in manual mode, provisioned groups in provisioned mode
          const filterOnKind =
            space.managementMode === "manual" ? "space_editors" : "provisioned";
          if (groupModel.kind !== filterOnKind) {
            return null;
          }
        }

        const group = new GroupResource(GroupModel, groupModel.get());
        assert(
          group.isSpaceEditor() || group.isProvisioned(),
          "Only space editors or provisioned groups can be an editor group"
        );

        return new GroupSpaceEditorResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      })
    );
    return removeNulls(groupSpacesResources);
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    if (this.space.isProject()) {
      // Only gets the editor groups correponding to the space management mode
      const editorGroupSpaces = await this.getEditorGroupSpaces(true);
      const editorGroupsPermissions: GroupPermission[] = editorGroupSpaces.map(
        (egs) => ({
          id: egs.groupId,
          permissions: ["admin", "read", "write"],
        })
      );
      return [
        {
          groups: editorGroupsPermissions,
          roles: [
            {
              role: "admin",
              permissions: ["admin", "read", "write"],
            },
          ],
          workspaceId: this.space.workspaceId,
        },
      ];
    }
    return [];
  }
}

// GroupSpaceViewerResource - represents viewer permission (kind=project_viewer)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceViewerResource
  extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupSpaceViewerResource extends GroupSpaceBaseResource {
  constructor(
    model: ModelStatic<GroupSpaceModel>,
    blob: Attributes<GroupSpaceModel>,
    space: SpaceResource,
    group: GroupResource
  ) {
    super(model, blob, space, group);
  }

  static async makeNew(
    auth: Authenticator,
    {
      group,
      space,
      transaction,
    }: {
      group: GroupResource;
      space: SpaceResource;
      transaction?: Transaction;
    }
  ): Promise<GroupSpaceViewerResource> {
    assert(space.isProject(), "Viewer groups only apply to project spaces");
    assert(group.isGlobal(), "Only the global group can be a viewer group");
    const groupSpace = await GroupSpaceModel.create(
      {
        groupId: group.id,
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        kind: "project_viewer",
      },
      { transaction }
    );

    return new GroupSpaceViewerResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  static async fetchBySpace({
    space,
    transaction,
  }: {
    space: SpaceResource;
    transaction?: Transaction;
  }): Promise<GroupSpaceViewerResource | null> {
    assert(space.isProject(), "Viewer groups only apply to project spaces");
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        kind: "project_viewer",
        vaultId: space.id,
        workspaceId: space.workspaceId,
      },
      transaction,
    });

    assert(
      groupSpaces.length <= 1,
      "There should be at most one viewer group per project"
    );
    if (groupSpaces.length === 0) {
      return null;
    }

    const groupModels = await GroupModel.findAll({
      where: {
        id: groupSpaces[0].groupId,
        workspaceId: space.workspaceId,
      },
      transaction,
    });
    assert(
      groupModels.length === 1,
      "One and only one group must exist for viewer group space"
    );
    const groupModel = groupModels[0];
    assert(
      groupModel.kind === "global",
      "Only the global group can be a viewer group"
    );

    const group = new GroupResource(GroupModel, groupModel.get());
    assert(group.isGlobal(), "Only the global group can be a viewer group");

    return new GroupSpaceViewerResource(
      GroupSpaceModel,
      groupSpaces[0].get(),
      space,
      group
    );
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    assert(
      this.space.isProject(),
      "Viewer permissions only apply to project spaces"
    );
    // Only gets the editor groups correponding to the space management mode
    const editorGroupSpaces = await this.getEditorGroupSpaces(true);
    const editorGroupsPermissions: GroupPermission[] = editorGroupSpaces.map(
      (egs) => ({
        id: egs.groupId,
        permissions: ["admin", "read", "write"],
      })
    );
    return [
      {
        groups: [
          {
            id: this.group.id,
            permissions: ["read"],
          },
          ...editorGroupsPermissions,
        ],
        roles: [
          {
            role: "admin",
            permissions: ["admin", "read", "write"],
          },
        ],
        workspaceId: this.space.workspaceId,
      },
    ];
  }
}
