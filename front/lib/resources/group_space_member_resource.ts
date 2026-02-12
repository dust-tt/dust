import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceBaseResource } from "@app/lib/resources/group_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  CombinedResourcePermissions,
  GroupPermission,
} from "@app/types/resource_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";

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

    const groupSpacesResources = await concurrentExecutor(
      groupSpaces,
      async (groupSpace) => {
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
      },
      { concurrency: 1 }
    );
    return removeNulls(groupSpacesResources);
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

  async canAddMember(auth: Authenticator, userId: string): Promise<boolean> {
    if (this.space.isProject() && this.space.isOpen()) {
      const currentUser = auth.getNonNullableUser();
      if (userId === currentUser.sId) {
        // Users can add themselves to open projects.
        return true;
      }
    }
    const requestedPermissions = await this.requestedPermissions();
    return auth.canWrite(requestedPermissions);
  }

  async canRemoveMember(
    auth: Authenticator,
    userId: string,
    _skipCheckLastMember?: boolean
  ): Promise<boolean> {
    if (this.space.isProject()) {
      const currentUser = auth.getNonNullableUser();
      if (userId === currentUser.sId) {
        // Users can remove themselves from any project.
        return true;
      }
    }
    const requestedPermissions = await this.requestedPermissions();
    return auth.canWrite(requestedPermissions);
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
