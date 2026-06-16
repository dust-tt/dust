import { getUserWithWorkspaces } from "@app/lib/api/user";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import type { UserTypeWithWorkspaces } from "@app/types/user";

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
