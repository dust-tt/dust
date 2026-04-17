import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceType } from "@app/types/user";

export class GroupFactory {
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }

  static async regular(workspace: WorkspaceType, name: string) {
    return GroupResource.makeNew({
      name,
      kind: "regular",
      workspaceId: workspace.id,
    });
  }

  static async withMembers(
    auth: Authenticator,
    group: GroupResource,
    users: UserResource[]
  ) {
    return group.dangerouslyAddMembers(auth, {
      users: users.map((u) => u.toJSON()),
    });
  }
}
