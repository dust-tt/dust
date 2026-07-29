import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { SandboxFunctionAuthenticationPolicy } from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

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

export async function authorizeSandboxFunctionInvocation(
  auth: Authenticator,
  {
    authentication,
    workspaceId,
  }: {
    authentication: SandboxFunctionAuthenticationPolicy | null;
    workspaceId: number;
  }
): Promise<{ authorized: boolean; user: UserResource | null }> {
  if (auth.getNonNullableWorkspace().id !== workspaceId) {
    return { authorized: false, user: null };
  }

  const user = await getAuthenticatedWorkspaceUser(auth);
  const policy = authentication ?? "optional";
  switch (policy) {
    case "optional":
      return { authorized: true, user };
    case "workspace_user_required":
      return { authorized: user !== null, user };
    default:
      assertNeverAndIgnore(policy);
      return { authorized: false, user: null };
  }
}
