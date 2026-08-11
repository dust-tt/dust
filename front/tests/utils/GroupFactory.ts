import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceType } from "@app/types/user";

export class GroupFactory {
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }

  static async regularAuto(workspace: WorkspaceType, name: string) {
    return GroupResource.makeNew({
      name,
      kind: "regular_auto",
      workspaceId: workspace.id,
    });
  }

  static async regularManual(workspace: WorkspaceType, name: string) {
    return GroupResource.makeNew({
      name,
      kind: "regular_manual",
      workspaceId: workspace.id,
    });
  }

  static async provisioned(workspace: WorkspaceType, name: string) {
    return GroupResource.makeNew({
      name,
      kind: "provisioned",
      workspaceId: workspace.id,
      workOSGroupId: `workos-group-${name}`,
    });
  }

  static async withMembers(
    auth: Authenticator,
    group: GroupResource,
    users: UserResource[]
  ) {
    return group.dangerouslyAddMembers(auth, {
      users: users.map((u) => u.toJSON()),
      // Provisioned membership is owned by the IdP in production; tests seed it directly.
      allowProvisionedGroups: true,
    });
  }
}
