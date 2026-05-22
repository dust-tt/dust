import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import type {
  GetWorkspaceInvitationsResponseBody,
  PostInvitationResponseBody,
} from "@app/pages/api/w/[wId]/invitations/index";
import { PostInvitationRequestBodySchema } from "@app/pages/api/w/[wId]/invitations/index";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureRole } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import invitationById from "./[iId]";

// Mounted under /api/w/:wId/invitations.
const app = workspaceApp();

app.use("*", ensureRole({ admin: true }));

app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceInvitationsResponseBody> => {
    const auth = ctx.get("auth");
    const includeExpired = ctx.req.query("includeExpired") === "true";

    const invitations =
      await MembershipInvitationResource.getPendingInvitations(auth, {
        includeExpired,
      });

    return ctx.json({ invitations: invitations.map((i) => i.toJSON()) });
  }
);

app.post(
  "/",
  validate("json", PostInvitationRequestBodySchema),
  async (ctx): HandlerResult<PostInvitationResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const subscription = auth.getNonNullableSubscription();

    if (subscription.paymentFailingSince) {
      return apiError(ctx, {
        status_code: 402,
        api_error: {
          type: "subscription_payment_failed",
          message:
            "The subscription payment has failed, impossible to add new members.",
        },
      });
    }

    const invitationRequests = ctx.req.valid("json");

    const invitationRes = await handleMembershipInvitations(auth, {
      owner,
      user: user.toJSON(),
      subscription,
      invitationRequests,
    });

    if (invitationRes.isErr()) {
      return apiError(ctx, invitationRes.error);
    }

    return ctx.json(invitationRes.value);
  }
);

app.route("/:iId", invitationById);

export default app;
