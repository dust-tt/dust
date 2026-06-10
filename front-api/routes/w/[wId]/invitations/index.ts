import type {
  GetWorkspaceInvitationsResponseBody,
  PostInvitationResponseBody,
} from "@app/lib/api/invitation";
import {
  handleMembershipInvitations,
  PostInvitationRequestBodySchema,
} from "@app/lib/api/invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import invitationById from "./[iId]";

// Mounted under /api/w/:wId/invitations.
const app = workspaceApp();

app.use("*", ensureHasPermission("workspace:manage_members"));

/** @ignoreswagger */
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

    // Escalation guard: inviting a member as admin requires the
    // manage_admin_role permission, so business admins cannot invite new admins.
    if (
      invitationRequests.some((r) => r.role === "admin") &&
      !auth.hasPermission("workspace:manage_admin_role")
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have permission to invite members.",
        },
      });
    }

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
