import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import assert from "assert";

export class GroupSpaceFactory {
  // Associate a group with a space in tests. `group_vaults` is gone, so this rewrites the space's
  // `group_permissions` (the sole source of truth): it takes the space's current member/editor set
  // from its grants (`admin` grant = editor, everything else = member), adds `group` to the bucket
  // implied by `kind`, and re-writes the grants — the same shape production's `writeGroupPermissions`
  // expects. `project_viewer` (the global group) goes in `members`; only editors are told apart.
  static async associate(
    space: SpaceResource,
    group: GroupResource,
    kind: "member" | "project_editor" | "project_viewer" = "member"
  ): Promise<void> {
    const workspace = await WorkspaceResource.fetchByModelId(space.workspaceId);
    assert(workspace, `Workspace ${space.workspaceId} not found.`);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const grants = await GroupPermissionModel.findAll({
      where: {
        workspaceId: space.workspaceId,
        resourceType: "space",
        resourceId: space.id,
      },
    });
    const editorGroupIds = new Set(
      grants.filter((g) => g.grantType === "admin").map((g) => g.groupId)
    );
    const memberGroupIds = new Set(
      grants.filter((g) => g.grantType !== "admin").map((g) => g.groupId)
    );
    if (kind === "project_editor") {
      editorGroupIds.add(group.id);
    } else {
      memberGroupIds.add(group.id);
    }

    const [members, editors] = await Promise.all([
      GroupResource.fetchByModelIds(auth, [...memberGroupIds]),
      GroupResource.fetchByModelIds(auth, [...editorGroupIds]),
    ]);

    await space.writeGroupPermissions(auth, { members, editors });
  }
}
