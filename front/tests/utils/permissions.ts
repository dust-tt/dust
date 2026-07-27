import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import type {
  GrantType,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import type { WorkspaceType } from "@app/types/user";

// Grants a workspace-level (type-wide) capability to a non-admin user by placing them in a group
// that holds the grant, mirroring how governance grants capabilities to groups.
export async function grantWorkspacePermission(
  workspace: WorkspaceType,
  user: UserResource,
  {
    grantType,
    resourceType,
  }: { grantType: GrantType; resourceType: GroupPermissionResourceType }
) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const group = await GroupFactory.regularAuto(
    workspace,
    `${grantType}-${resourceType}-${user.sId}`
  );
  await GroupFactory.withMembers(adminAuth, group, [user]);
  await GroupPermissionResource.grantTypeWide(adminAuth, {
    group,
    grantType,
    resourceType,
  });
}
