import { Hono } from "hono";

import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import { fetchInvitationsFromOtherRegion } from "@app/lib/api/regions/lookup";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import logger from "@app/logger/logger";
import type { PendingInvitationOption } from "@app/types/membership_invitation";

export const invitationsApp = new Hono();

invitationsApp.get("/", async (c) => {
  const user = c.get("userResource");

  const invitationResources =
    await MembershipInvitationResource.listPendingForEmail({
      email: user.email,
    });

  const localInvitations: PendingInvitationOption[] = invitationResources.map(
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

  const crossRegionRes = await fetchInvitationsFromOtherRegion(user.email);
  let pendingInvitations = localInvitations;
  if (crossRegionRes.isOk()) {
    pendingInvitations = [...localInvitations, ...crossRegionRes.value];
  } else {
    logger.error(
      { err: crossRegionRes.error },
      "Failed to fetch cross-region invitations, returning local only"
    );
  }

  return c.json({ pendingInvitations });
});
