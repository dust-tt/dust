import type { GetPendingInvitationsResponseBody } from "@app/lib/api/invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { getMembershipInvitationToken } from "@app/lib/utils/invitation_token";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/me/pending-invitations.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPendingInvitationsResponseBody> => {
  const auth = ctx.get("auth");
  const user = auth.getNonNullableUser();

  const invitationResources =
    await MembershipInvitationResource.listPendingForEmail({
      email: user.email,
    });

  const pendingInvitations: PendingInvitationOption[] = invitationResources.map(
    (invitation) => {
      const workspace = invitation.workspace;
      return {
        workspaceName: workspace.name,
        initialRole: invitation.initialRole,
        createdAt: invitation.createdAt.getTime(),
        token: getMembershipInvitationToken(invitation.toJSON()),
        isExpired: invitation.isExpired(),
      };
    }
  );

  return ctx.json({ pendingInvitations });
});

export default app;
