import type { IncomingMessage, ServerResponse } from "http";

import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { UserTypeWithWorkspaces } from "@app/types/user";

async function checkAcademyAccessForUser(
  user: UserTypeWithWorkspaces
): Promise<boolean> {
  for (const workspace of user.workspaces) {
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (workspaceResource) {
      const hasFlag = await FeatureFlagResource.isEnabledForWorkspace(
        workspaceResource,
        "dust_academy"
      );
      if (hasFlag) {
        return true;
      }
    }
  }

  return false;
}

export async function hasAcademyAccess(
  req: IncomingMessage & { cookies: Partial<{ [key: string]: string }> },
  res: ServerResponse
): Promise<boolean> {
  const session = await getSession(req, res);
  if (!session) {
    return false;
  }

  const user = await getUserFromSession(session);
  if (!user) {
    return false;
  }

  return checkAcademyAccessForUser(user);
}

interface AcademyAccessResult {
  hasAccess: boolean;
  user: UserResource | null;
}

export async function getAcademyAccessAndUser(
  req: IncomingMessage & { cookies: Partial<{ [key: string]: string }> },
  res: ServerResponse
): Promise<AcademyAccessResult> {
  const session = await getSession(req, res);
  if (!session) {
    return { hasAccess: false, user: null };
  }

  const userWithWorkspaces = await getUserFromSession(session);
  if (!userWithWorkspaces) {
    return { hasAccess: false, user: null };
  }

  const hasAccess = await checkAcademyAccessForUser(userWithWorkspaces);
  if (!hasAccess) {
    return { hasAccess: false, user: null };
  }

  // Resolve the UserResource from the session.
  const userResource = await fetchUserFromSession(session);

  return { hasAccess: true, user: userResource };
}
