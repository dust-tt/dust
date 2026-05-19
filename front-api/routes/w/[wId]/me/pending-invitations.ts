import { Hono } from "hono";

import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import type { PendingInvitationOption } from "@app/types/membership_invitation";

export type GetPendingInvitationsResponseBody = {
  pendingInvitations: PendingInvitationOption[];
};

// Mounted at /api/w/:wId/me/pending-invitations.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
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

  const body: GetPendingInvitationsResponseBody = { pendingInvitations };
  return c.json(body);
});

export default app;
