import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import { fetchUserWithAuth0Sub } from "@app/lib/iam/users";
import { Workspace } from "@app/lib/models/workspace";

export async function handleLookupUser(userLookup: {
  sub: string;
  email: string;
}) {
  // Check if user exists or has pending invitations
  const [user, pendingInvite] = await Promise.all([
    fetchUserWithAuth0Sub(userLookup.sub),
    getPendingMembershipInvitationWithWorkspaceForEmail(userLookup.email),
  ]);

  if (user) {
    return {
      user: { email: user.email },
    };
  } else if (pendingInvite) {
    return {
      user: { email: pendingInvite.invitation.inviteEmail },
    };
  }

  return {
    user: null,
  };
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
