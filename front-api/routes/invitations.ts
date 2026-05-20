import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import { fetchInvitationsFromOtherRegion } from "@app/lib/api/regions/lookup";
import { getUserFromSession } from "@app/lib/iam/session";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import logger from "@app/logger/logger";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import { sessionAuth } from "../middleware/session_auth";

export const invitationsApp = new Hono();

invitationsApp.use("*", sessionAuth);

invitationsApp.get("/", async (ctx) => {
  const session = ctx.get("session");

  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "user_not_found", message: "User not found." },
    });
  }

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

  return ctx.json({ pendingInvitations });
});
