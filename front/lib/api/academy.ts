import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { IncomingMessage, ServerResponse } from "http";

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
