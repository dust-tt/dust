import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import { fetchUserWithAuth0Sub } from "@app/lib/iam/users";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";

export async function handleLookupUser(userLookup: {
  sub: string;
  email: string;
}): Promise<boolean> {
  // Check if user exists, has pending invitations or has a workspace with verified domain
  const [user, pendingInvite, workspaceWithVerifiedDomain] = await Promise.all([
    fetchUserWithAuth0Sub(userLookup.sub),
    getPendingMembershipInvitationWithWorkspaceForEmail(userLookup.email),
    findWorkspaceWithVerifiedDomain({
      email: userLookup.email,
      email_verified: true,
    }),
  ]);

  if (user || pendingInvite || workspaceWithVerifiedDomain) {
    return true;
  }

  return false;
}

export async function handleLookupWorkspace(workspaceLookup: {
  workspace: string;
}) {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceLookup.workspace },
  });
  return {
    workspace: workspace?.sId ? { sId: workspace.sId } : null,
  };
}
