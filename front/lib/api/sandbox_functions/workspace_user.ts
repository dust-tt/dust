import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

export async function getAuthenticatedWorkspaceUser(
  auth: Authenticator
): Promise<UserResource | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  const role = await MembershipResource.getActiveRoleForUserInWorkspace({
    user,
    workspace: auth.getNonNullableWorkspace(),
  });

  return Authenticator.isMember(role) ? user : null;
}
