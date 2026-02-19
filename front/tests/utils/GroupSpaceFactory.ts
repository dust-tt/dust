import type { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";

export class GroupSpaceFactory {
  static async associate(
    space: SpaceResource,
    group: GroupResource,
    kind: "member" | "project_editor" | "project_viewer" = "member"
  ): Promise<GroupSpaceModel> {
    return GroupSpaceModel.create({
      groupId: group.id,
      vaultId: space.id,
      workspaceId: space.workspaceId,
      kind,
    });
  }
}
