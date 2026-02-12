import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceBaseResource } from "@app/lib/resources/group_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  CombinedResourcePermissions,
  GroupPermission,
} from "@app/types/resource_permissions";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

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

  /**
   * Helper method to find the editor groups for a space.
   * Returns the group_vaults with kind "project_editor".
   */
  
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
async  getEditorGroupSpaces(
    filterOnManagementMode: boolean = true
  ): Promise<GroupSpaceEditorResource[]> {
    return GroupSpaceEditorResource.fetchBySpace({
      space: this.space,
      filterOnManagementMode,
    });
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async canAddMember(_auth: Authenticator, _userId: string): Promise<boolean> {
    // No one can add members to the viewer group except through system processes
    return false;
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async canRemoveMember(
    _auth: Authenticator,
    _userId: string,
    _skipCheckLastMember?: boolean
  ): Promise<boolean> {
    // No one can remove members from the viewer group except through system processes
    return false;
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
