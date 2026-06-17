import { getUserWithWorkspaces } from "@app/lib/api/user";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";

/**
 * Retrieves the user for a given session
 * @param session any workos session
 * @returns Promise<UserType | null>
 */
export async function getUserFromSession(
  session: SessionWithUser | null
): Promise<UserTypeWithWorkspaces | null> {
  if (!session) {
    return null;
  }

  const user = await fetchUserFromSession(session);
  if (!user) {
    return null;
  }

  await maybeUpdateFromExternalUser(user, session.user);

  return getUserWithWorkspaces(user);
}

export function sessionSatisfiesWorkspaceSsoEnforcement({
  session,
  workspace,
}: {
  session: SessionWithUser;
  workspace: Pick<
    WorkspaceType,
    "ssoEnforced" | "workOSOrganizationId"
  > | null;
}): boolean {
  if (!workspace?.ssoEnforced) {
    return true;
  }

  if (session.isSSO) {
    return true;
  }

  // OAuth bearer tokens do not carry WorkOS' `authenticationMethod` once they
  // are re-verified server-side. Treat a bearer token bound to the workspace's
  // WorkOS organization as satisfying SSO enforcement so OAuth clients that
  // authenticated through the enterprise organization do not get stuck in an
  // SSO re-auth loop.
  return (
    session.authenticationMethod === "bearer" &&
    !!session.organizationId &&
    !!workspace.workOSOrganizationId &&
    session.organizationId === workspace.workOSOrganizationId
  );
}
