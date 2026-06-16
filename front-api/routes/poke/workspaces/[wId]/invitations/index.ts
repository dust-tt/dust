import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import invitationId from "./[iId]";

const DeleteInvitationBodySchema = z.object({
  email: z.string(),
});

export type PokeDeleteInvitationResponseBody = {
  success: boolean;
  email: string;
};

// Mounted at /api/poke/workspaces/:wId/invitations.
const app = pokeApp();

/** @ignoreswagger */
app.delete(
  "/",
  validate("json", DeleteInvitationBodySchema),
  async (ctx): HandlerResult<PokeDeleteInvitationResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { email } = ctx.req.valid("json");

    // !! this is ok because we're in Poke as dust super user, do not copy paste
    // this mindlessly !!
    const workspaceAdminAuth = await Authenticator.internalAdminForWorkspace(
      owner.sId
    );

    const pendingInvitations =
      await MembershipInvitationResource.getPendingInvitations(
        workspaceAdminAuth,
        { includeExpired: true }
      );

    const invitation = pendingInvitations.find(
      (inv) => inv.inviteEmail === email
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

    await invitation.revoke();

    return ctx.json({ success: true, email });
  }
);

app.route("/:iId", invitationId);

export default app;
