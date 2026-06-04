import type { HandleMembershipInvitationResult } from "@app/lib/api/invitation";
import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  iId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/invitations/:iId.
const app = pokeApp();

app.patch(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<HandleMembershipInvitationResult> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const user = auth.user();
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    const { iId: invitationId } = ctx.req.valid("param");

    const workspaceAdminAuth = await Authenticator.internalAdminForWorkspace(
      owner.sId
    );

    const subscription = workspaceAdminAuth.subscription();
    if (!subscription) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The subscription was not found.",
        },
      });
    }

    const invitation = await MembershipInvitationResource.fetchById(
      workspaceAdminAuth,
      invitationId
    );
    if (!invitation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invitation_not_found",
          message: "The invitation was not found.",
        },
      });
    }

    // Revoke the existing invitation so that a brand new one is created
    // with a fresh createdAt (and therefore a fresh 7-day token).
    await invitation.revoke();

    const invitationRes = await handleMembershipInvitations(
      workspaceAdminAuth,
      {
        owner,
        user: user.toJSON(),
        subscription,
        invitationRequests: [
          { email: invitation.inviteEmail, role: invitation.initialRole },
        ],
        force: true,
      }
    );

    if (invitationRes.isErr()) {
      return apiError(ctx, invitationRes.error);
    }

    return ctx.json(invitationRes.value[0]);
  }
);

export default app;
