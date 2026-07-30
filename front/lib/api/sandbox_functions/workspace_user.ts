import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { isSandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { assertNever } from "@app/types/shared/utils/assert_never";

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
    userIdentity,
  }: {
    userIdentity: SandboxFunctionUserIdentityPolicy | null;
  }
): Promise<{ authorized: boolean; user: UserResource | null }> {
  const user = await getAuthenticatedWorkspaceUser(auth);
  const policy: unknown = userIdentity ?? "optional";
  if (!isSandboxFunctionUserIdentityPolicy(policy)) {
    return { authorized: false, user: null };
  }
  switch (policy) {
    case "optional":
      return { authorized: true, user };
    case "workspace_user_required":
      return { authorized: user !== null, user };
    default:
      return assertNever(policy);
  }
}
