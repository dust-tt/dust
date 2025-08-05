import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";

/**
 * Checks if the current user has access to a workspace-shared file.
 * Returns true if the user is authenticated and is a member of the workspace.
 * Returns false if not authenticated or not a member.
 */
export async function checkWorkspaceShareAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  workspaceId: string
): Promise<boolean> {
  const session = await getSession(req, res);
  if (!session) {
    return false;
  }

  const auth = await Authenticator.fromSession(session, workspaceId);

  return auth.isUser();
}
