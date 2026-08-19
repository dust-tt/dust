import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import assert from "assert";

export class GroupSpaceFactory {
  static async associate(
    space: SpaceResource,
    group: GroupResource,
    kind: "member" | "project_editor" | "project_viewer" = "member"
  ): Promise<GroupSpaceModel> {
    const groupSpace = await GroupSpaceModel.create({
      groupId: group.id,
      groupKind: group.kind,
      vaultId: space.id,
      workspaceId: space.workspaceId,
      kind,
    });

    // Production rewrites the space's `group_permissions` on every association change, and space
    // membership is now read from those grants, so writing only the `group_vaults` row would leave
    // the association invisible to `isMember`.
    const workspace = await WorkspaceResource.fetchByModelId(space.workspaceId);
    assert(workspace, `Workspace ${space.workspaceId} not found.`);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await space.writeGroupPermissions(
      auth,
      await space.fetchAssociatedGroups()
    );

    return groupSpace;
  }
}
