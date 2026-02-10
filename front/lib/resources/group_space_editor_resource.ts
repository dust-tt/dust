import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceBaseResource } from "@app/lib/resources/group_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { CombinedResourcePermissions, GroupPermission } from "@app/types";
import { removeNulls } from "@app/types";

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

  async canAddMember(auth: Authenticator, _userId: string): Promise<boolean> {
    const requestedPermissions = await this.requestedPermissions();
    return auth.canWrite(requestedPermissions);
  }

  async canRemoveMember(
    auth: Authenticator,
    _userId: string
  ): Promise<boolean> {
    const editorsCount = await this.group.getMemberCount(auth);
    if (editorsCount <= 1) {
      return false;
    }
    const requestedPermissions = await this.requestedPermissions();
    return auth.canWrite(requestedPermissions);
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
