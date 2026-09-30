import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { GroupGrantableRole } from "@app/types/groups";
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

  static async regularManual(
    workspace: WorkspaceType,
    name: string,
    { grantedRole = null }: { grantedRole?: GroupGrantableRole | null } = {}
  ) {
    return GroupResource.makeNew({
      name,
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole,
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

  // Writes the group limit columns directly, bypassing `GroupResource.updateGroupLimit`, to create
  // states it forbids so that code reading them can be tested.
  static async withRawGroupLimit(
    group: GroupResource,
    {
      groupLimitAwuCredits,
      groupLimitPriority,
    }: {
      groupLimitAwuCredits: number | null;
      groupLimitPriority: number | null;
    }
  ) {
    await GroupModel.update(
      { groupLimitAwuCredits, groupLimitPriority },
      { where: { id: group.id, workspaceId: group.workspaceId } }
    );
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

  static async withoutMembers(
    auth: Authenticator,
    group: GroupResource,
    users: UserResource[]
  ) {
    return group.dangerouslyRemoveMembers(auth, {
      users: users.map((u) => u.toJSON()),
      allowProvisionedGroups: true,
    });
  }
}
