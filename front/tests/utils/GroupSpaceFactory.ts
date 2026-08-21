import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
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
    // the association invisible to `isMember`. Re-derive the `{ members, editors }` set from the
    // space's `group_vaults` rows (the factory's association mechanism) and rewrite the grants.
    const workspace = await WorkspaceResource.fetchByModelId(space.workspaceId);
    assert(workspace, `Workspace ${space.workspaceId} not found.`);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        vaultId: space.id,
        workspaceId: space.workspaceId,
      },
    });
    const memberGroupIds = groupSpaces
      .filter((gs) => gs.kind === "member" || gs.kind === "project_viewer")
      .map((gs) => gs.groupId);
    const editorGroupIds = groupSpaces
      .filter((gs) => gs.kind === "project_editor")
      .map((gs) => gs.groupId);
    const members = await GroupResource.fetchByModelIds(auth, memberGroupIds);
    const editors = await GroupResource.fetchByModelIds(auth, editorGroupIds);

    await space.writeGroupPermissions(auth, { members, editors });

    return groupSpace;
  }
}
