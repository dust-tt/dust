import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { isSandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { assertNever } from "@app/types/shared/utils/assert_never";

type SandboxFunctionAuthorization =
  | { authorized: true; user: UserResource | null }
  | { authorized: false; errorMessage: string };

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
    origin,
  }: {
    userIdentity: SandboxFunctionUserIdentityPolicy | null;
    origin: SandboxFunctionInvocationOrigin;
  }
): Promise<SandboxFunctionAuthorization> {
  const user = await getAuthenticatedWorkspaceUser(auth);
  const policy: unknown = userIdentity ?? "optional";
  if (!isSandboxFunctionUserIdentityPolicy(policy)) {
    return {
      authorized: false,
      errorMessage:
        "This Pod Function uses an unsupported user identity policy.",
    };
  }
  switch (policy) {
    case "optional":
      return { authorized: true, user };
    case "workspace_user_required":
      return user
        ? { authorized: true, user }
        : {
            authorized: false,
            errorMessage:
              "This Pod Function requires a logged-in user from its workspace.",
          };
    case "interactive_workspace_user_required": {
      const authorized =
        user !== null &&
        origin === "interactive_session" &&
        auth.authMethod() === "session";
      return authorized
        ? { authorized: true, user }
        : {
            authorized: false,
            errorMessage:
              "This Pod Function requires a logged-in workspace member in a live Dust session.",
          };
    }
    default:
      return assertNever(policy);
  }
}
