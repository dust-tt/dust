import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { SandboxFunctionAuthenticationPolicy } from "@app/types/api/sandbox_functions";
import { isSandboxFunctionAuthenticationPolicy } from "@app/types/api/sandbox_functions";
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
    authentication,
  }: {
    authentication: SandboxFunctionAuthenticationPolicy | null;
  }
): Promise<{ authorized: boolean; user: UserResource | null }> {
  const user = await getAuthenticatedWorkspaceUser(auth);
  const policy: unknown = authentication ?? "optional";
  if (!isSandboxFunctionAuthenticationPolicy(policy)) {
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
