import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceBaseResource } from "@app/lib/resources/group_space_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  AccessControlList,
  GroupGrant,
} from "@app/types/resource_permissions";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

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
      group.isRegularAuto() || group.isProvisioned(),
      "Only regular_auto or provisioned groups can be an editor group"
    );
    const groupSpace = await GroupSpaceModel.create(
      {
        groupId: group.id,
        groupKind: group.kind,
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

    if (groupSpaces.length === 0) {
      return [];
    }

    const groupModels = await GroupModel.findAll({
      where: {
        id: groupSpaces.map((groupSpace) => groupSpace.groupId),
        workspaceId: space.workspaceId,
      },
      transaction,
    });
    const groupModelsByModelId = new Map(
      groupModels.map((groupModel) => [groupModel.id, groupModel])
    );

    const groupSpacesResources = groupSpaces.map((groupSpace) => {
      const groupModel = groupModelsByModelId.get(groupSpace.groupId);
      assert(
        groupModel,
        "One and only one group must exist for editor group space"
      );
      assert(
        groupModel.kind === "regular_auto" || groupModel.kind === "provisioned",
        "Only regular_auto or provisioned groups can be editor groups"
      );

      if (filterOnManagementMode) {
        // Manual mode uses the regular_auto editor group; provisioned mode uses the provisioned
        // group.
        const isProvisionedGroup = groupModel.kind === "provisioned";
        const keep =
          space.managementMode === "manual"
            ? !isProvisionedGroup
            : isProvisionedGroup;
        if (!keep) {
          return null;
        }
      }

      const group = new GroupResource(GroupModel, groupModel.get());
      assert(
        group.isRegularAuto() || group.isProvisioned(),
        "Only regular_auto or provisioned groups can be an editor group"
      );

      return new this(GroupSpaceModel, groupSpace.get(), space, group);
    });
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
    if (await this.space.fetchIsAdminControlled()) {
      // Editor group stays empty while admin-controlled.
      return false;
    }
    // Editing the editor group is gated on administrating the space; never rely on the editor
    // group's own ACL / canWrite.
    return this.space.canAdministrate(auth);
  }

  async canRemoveMember(
    auth: Authenticator,
    _userId: string,
    skipCheckLastMember?: boolean
  ): Promise<boolean> {
    const editorsCount = await this.group.getMemberCount(auth);
    if (!skipCheckLastMember && editorsCount <= 1) {
      return false;
    }
    // Editing the editor group is gated on administrating the space; never rely on the editor
    // group's own ACL / canWrite.
    return this.space.canAdministrate(auth);
  }

  async getAccessControlLists(
    auth: Authenticator
  ): Promise<AccessControlList[]> {
    if (this.space.isProject()) {
      // Only gets the editor groups correponding to the space management mode
      const editorGroupSpaces = await this.getEditorGroupSpaces(true);
      const editorGroupsPermissions: GroupGrant[] = editorGroupSpaces.map(
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
