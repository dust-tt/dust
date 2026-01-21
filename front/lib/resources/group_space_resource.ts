import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  CombinedResourcePermissions,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

// Base class for group-space junction resources
// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceBaseResource extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupSpaceBaseResource extends BaseResource<GroupSpaceModel> {
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
   * Helper method to find the editor group for a space.
   * Returns the group with kind "project_editor" if it exists.
   */
  async getEditorGroupSpace(): Promise<GroupSpaceEditorResource | null> {
    return GroupSpaceEditorResource.fetchBySpace(
      this.space.workspaceId,
      this.space
    );
  }

  /**
   * Placeholder for requestedPermissions to be defined in subclasses.
   * Each subclass will implement its own permission logic.
   */
  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    throw new Error("requestedPermissions must be implemented in subclass");
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
    const addMembersRes = await this.group.addMembers(auth, {
      users,
      requestedPermissions,
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
    const requestedPermissions = await this.requestedPermissions();
    const removeMembersRes = await this.group.removeMembers(auth, {
      users,
      requestedPermissions,
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
    const requestedPermissions = await this.requestedPermissions();
    const setMembersRes = await this.group.setMembers(auth, {
      users,
      requestedPermissions,
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

      return new Ok(undefined);
    } catch (error) {
      return new Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// GroupSpaceMemberResource - represents member permission (kind=member)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceMemberResource extends ReadonlyAttributesType<GroupSpaceModel> {}
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

  static async fetchBySpace(
    auth: Authenticator,
    {
      space,
      transaction,
    }: {
      space: SpaceResource;
      transaction?: Transaction;
    }
  ): Promise<GroupSpaceMemberResource | null> {
    const groupSpace = await GroupSpaceModel.findOne({
      where: {
        kind: "member",
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    if (!groupSpace) {
      return null;
    }

    const groupModel = await GroupModel.findOne({
      where: {
        id: groupSpace.groupId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    assert(groupModel, "Group must exist for member group space");
    const group = new GroupResource(GroupModel, groupModel.get());

    return new GroupSpaceMemberResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    switch (this.space.kind) {
      case "system":
        return [
          {
            workspaceId: this.workspaceId,
            roles: [{ role: "admin", permissions: ["admin", "write"] }],
            groups: [
              {
                id: this.groupId,
                permissions: ["read", "write"],
              },
            ],
          },
        ];
      case "public":
        return [
          {
            workspaceId: this.workspaceId,
            roles: [
              { role: "admin", permissions: ["admin", "read", "write"] },
              { role: "builder", permissions: ["read", "write"] },
              { role: "user", permissions: ["read"] },
              // Everyone can read.
              { role: "none", permissions: ["read"] },
            ],
            groups: [
              {
                id: this.groupId,
                permissions: ["read", "write"],
              },
            ],
          },
        ];
      case "global":
      case "conversations":
        return [
          {
            workspaceId: this.workspaceId,
            roles: [
              { role: "admin", permissions: ["admin", "read", "write"] },
              { role: "builder", permissions: ["read", "write"] },
            ],
            groups: [
              {
                id: this.groupId,
                permissions: ["read"],
              },
            ],
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
        const editorGroupSpace = await this.getEditorGroupSpace();
        assert(
          editorGroupSpace,
          "Editor group space must exist for project spaces"
        );
        return [
          {
            groups: [
              {
                id: this.group.id,
                permissions: ["read"],
              },
              {
                id: editorGroupSpace.groupId,
                permissions: ["admin", "read", "write"],
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
      }
      default:
        assertNever(this.space.kind);
    }
  }
}

// GroupSpaceEditorResource - represents editor permission (kind=project_editor)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceEditorResource extends ReadonlyAttributesType<GroupSpaceModel> {}
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

  static async fetchBySpace(
    workspaceId: ModelId,
    space: SpaceResource,
    transaction?: Transaction
  ): Promise<GroupSpaceEditorResource | null> {
    assert(space.isProject(), "Editor groups only apply to project spaces");
    const groupSpace = await GroupSpaceModel.findOne({
      where: {
        kind: "project_editor",
        vaultId: space.id,
        workspaceId,
      },
    });

    if (!groupSpace) {
      return null;
    }

    const groupModel = await GroupModel.findOne({
      where: {
        id: groupSpace.groupId,
        workspaceId,
      },
      transaction,
    });
    assert(groupModel, "Group must exist for editor group space");
    const group = new GroupResource(GroupModel, groupModel.get());

    return new GroupSpaceEditorResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    if (this.space.isProject()) {
      const editorGroupSpace = await this.getEditorGroupSpace();
      return [
        {
          groups: editorGroupSpace
            ? [
                {
                  id: editorGroupSpace.groupId,
                  permissions: ["admin", "read", "write"],
                },
              ]
            : [],
          roles: [],
          workspaceId: this.space.workspaceId,
        },
      ];
    }
    return [];
  }
}

// GroupSpaceViewerResource - represents viewer permission (kind=project_viewer)
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceViewerResource extends ReadonlyAttributesType<GroupSpaceModel> {}
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

  static async fetchBySpace(
    auth: Authenticator,
    {
      space,
      transaction,
    }: {
      space: SpaceResource;
      transaction?: Transaction;
    }
  ): Promise<GroupSpaceViewerResource | null> {
    assert(space.isProject(), "Viewer groups only apply to project spaces");
    const groupSpace = await GroupSpaceModel.findOne({
      where: {
        kind: "project_viewer",
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    if (!groupSpace) {
      return null;
    }

    const groupModel = await GroupModel.findOne({
      where: {
        id: groupSpace.groupId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    assert(groupModel, "Group must exist for viewer group space");

    const group = new GroupResource(GroupModel, groupModel.get());

    return new GroupSpaceViewerResource(
      GroupSpaceModel,
      groupSpace.get(),
      space,
      group
    );
  }

  async requestedPermissions(): Promise<CombinedResourcePermissions[]> {
    assert(
      this.space.isProject(),
      "Viewer permissions only apply to project spaces"
    );
    const editorGroupSpace = await this.getEditorGroupSpace();
    assert(
      editorGroupSpace,
      "Editor group space must exist for project spaces"
    );
    return [
      {
        groups: [
          {
            id: this.group.id,
            permissions: ["read"],
          },
          {
            id: editorGroupSpace.groupId,
            permissions: ["admin", "read", "write"],
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
  }
}
