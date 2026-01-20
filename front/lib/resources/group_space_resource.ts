import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  CombinedResourcePermissions,
  GroupPermission,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { Err, Ok } from "@app/types";

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
   * Create a new group-space relationship and return the appropriate resource type.
   */
  static async makeNew(
    auth: Authenticator,
    {
      group,
      space,
      kind,
      transaction,
    }: {
      group: GroupResource;
      space: SpaceResource;
      kind: "member" | "project_editor" | "project_viewer";
      transaction?: Transaction;
    }
  ): Promise<
    | GroupSpaceMemberResource
    | GroupSpaceEditorResource
    | GroupSpaceViewerResource
  > {
    const groupSpace = await GroupSpaceModel.create(
      {
        groupId: group.id,
        vaultId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        kind,
      },
      { transaction }
    );

    switch (kind) {
      case "member":
        return new GroupSpaceMemberResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      case "project_editor":
        return new GroupSpaceEditorResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      case "project_viewer":
        return new GroupSpaceViewerResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
    }
  }

  static async fetchByGroupAndSpace(
    auth: Authenticator,
    {
      groupId,
      spaceId,
      transaction,
    }: {
      groupId: ModelId;
      spaceId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<
    | GroupSpaceMemberResource
    | GroupSpaceEditorResource
    | GroupSpaceViewerResource
    | null
  > {
    const groupSpace = await GroupSpaceModel.findOne({
      where: {
        groupId,
        vaultId: spaceId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: SpaceModel,
          as: "space",
          include: [
            {
              model: GroupModel,
            },
          ],
        },
        {
          model: GroupModel,
          as: "group",
        },
      ],
      transaction,
    });

    if (!groupSpace) {
      return null;
    }

    const space = SpaceResource.fromModel(
      groupSpace.get("space") as SpaceModel
    );
    const group = new GroupResource(
      GroupModel,
      (groupSpace.get("group") as GroupModel).get()
    );

    switch (groupSpace.kind) {
      case "member":
        return new GroupSpaceMemberResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      case "project_editor":
        return new GroupSpaceEditorResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
      case "project_viewer":
        return new GroupSpaceViewerResource(
          GroupSpaceModel,
          groupSpace.get(),
          space,
          group
        );
    }
  }

  /**
   * Helper method to find the editor group for a space.
   * Returns the group with kind "project_editor" if it exists.
   */
  protected getEditorGroup(): GroupResource | undefined {
    return this.space.groups.find(
      (g) => g.group_vaults?.kind === "project_editor"
    );
  }

  /**
   * Placeholder for requestedPermissions to be defined in subclasses.
   * Each subclass will implement its own permission logic.
   */
  requestedPermissions(): CombinedResourcePermissions[] {
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
    // Get the permissions for this specific group-space relationship.
    // We use the first permission set since our permission model returns an array
    // but each group-space relationship has a single permission configuration.
    const permissions = this.requestedPermissions();
    const requestedPermissions =
      permissions.length > 0 ? permissions[0] : undefined;

    return this.group.addMembers(auth, {
      users,
      requestedPermissions,
      transaction,
    });
  }

  /**
   * Add a single member to the group with permissions from this group-space relationship.
   */
  async addMember(
    auth: Authenticator,
    {
      user,
      transaction,
    }: {
      user: UserType;
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
    return this.addMembers(auth, {
      users: [user],
      transaction,
    });
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
    // Get the permissions for this specific group-space relationship.
    // We use the first permission set since our permission model returns an array
    // but each group-space relationship has a single permission configuration.
    const permissions = this.requestedPermissions();
    const requestedPermissions =
      permissions.length > 0 ? permissions[0] : undefined;

    return this.group.removeMembers(auth, {
      users,
      requestedPermissions,
      transaction,
    });
  }

  /**
   * Remove a single member from the group with permissions from this group-space relationship.
   */
  async removeMember(
    auth: Authenticator,
    {
      user,
      transaction,
    }: {
      user: UserType;
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
    return this.removeMembers(auth, {
      users: [user],
      transaction,
    });
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
    // Get the permissions for this specific group-space relationship.
    // We use the first permission set since our permission model returns an array
    // but each group-space relationship has a single permission configuration.
    const permissions = this.requestedPermissions();
    const requestedPermissions =
      permissions.length > 0 ? permissions[0] : undefined;

    return this.group.setMembers(auth, {
      users,
      requestedPermissions,
      transaction,
    });
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

  requestedPermissions(): CombinedResourcePermissions[] {
    if (this.space.isProject()) {
      const editorGroup = this.getEditorGroup();
      return [
        {
          groups: [
            {
              id: this.group.id,
              permissions: ["read", "write"],
            },
            ...((editorGroup
              ? [
                  {
                    id: editorGroup.id,
                    permissions: ["admin", "read", "write"],
                  },
                ]
              : []) as GroupPermission[]),
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

  requestedPermissions(): CombinedResourcePermissions[] {
    if (this.space.isProject()) {
      const editorGroup = this.getEditorGroup();
      return [
        {
          groups: editorGroup
            ? [
                {
                  id: editorGroup.id,
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

  requestedPermissions(): CombinedResourcePermissions[] {
    if (this.space.isProject()) {
      const editorGroup = this.getEditorGroup();
      return [
        {
          groups: [
            {
              id: this.group.id,
              permissions: ["read"],
            },
            ...((editorGroup
              ? [
                  {
                    id: editorGroup.id,
                    permissions: ["admin", "read", "write"],
                  },
                ]
              : []) as GroupPermission[]),
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
    return [];
  }
}
