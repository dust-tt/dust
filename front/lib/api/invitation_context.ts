import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";

export interface InvitationContext {
  hasExplicitToken: boolean;
  hasWorkspaceContext: boolean;
  pendingInvitations: MembershipInvitationResource[];
  shouldAutoRedirect: boolean;
  warningMessage?: string;
}

export async function analyzeInvitationContext(
  user: UserResource,
  {
    inviteToken,
    targetWorkspaceId,
  }: {
    inviteToken?: string;
    targetWorkspaceId?: string;
  }
): Promise<InvitationContext> {
  const pendingInvitations =
    await MembershipInvitationResource.getAllPendingForEmail(user.email);

  const context: InvitationContext = {
    hasExplicitToken: !!inviteToken,
    hasWorkspaceContext: !!targetWorkspaceId,
    pendingInvitations,
    shouldAutoRedirect: false,
  };

  // Never auto-redirect if user has explicit context (token or workspace ID)
  if (context.hasExplicitToken || context.hasWorkspaceContext) {
    return context;
  }

  // One invitation - auto-redirect
  if (pendingInvitations.length === 1) {
    context.shouldAutoRedirect = true;
    logger.info(
      {
        userId: user.id,
        workspaceId: pendingInvitations[0].workspace.sId,
        email: user.email,
      },
      "[analyzeInvitationContext] Auto-redirecting user to single pending invitation"
    );
  } else if (pendingInvitations.length > 1) {
    // Multiple invitations - don't auto-redirect
    context.warningMessage = `User has ${pendingInvitations.length} pending invitations - not auto-redirecting`;
    logger.warn(
      {
        userId: user.id,
        invitationCount: pendingInvitations.length,
        workspaces: pendingInvitations.map((i) => ({
          id: i.workspace.sId,
        })),
      },
      "[analyzeInvitationContext] User has multiple pending invitations - creating new workspace"
    );
  }

  return context;
}
