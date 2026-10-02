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

// OAuth bearer sessions (extension, CLI) carry no authentication method: WorkOS access tokens do
// not expose it, so `isSSO` is always false for them and they cannot be checked here.
/**
 * @cc [owner:tdraier,label:security] sso-enforced-workspace-requires-sso-session
 * When `workspace.ssoEnforced` is true, a cookie session MUST satisfy the enforcement only if it
 * was authenticated through SSO (`session.isSSO`). OAuth bearer sessions
 * (`authenticationMethod === "bearer"`) are exempt. Workspaces without enforcement are always
 * satisfied.
 */
export function sessionSatisfiesSSOEnforcement(
  workspace: Pick<WorkspaceType, "ssoEnforced">,
  session: SessionWithUser
): boolean {
  if (!workspace.ssoEnforced || session.authenticationMethod === "bearer") {
    return true;
  }

  return session.isSSO;
}
