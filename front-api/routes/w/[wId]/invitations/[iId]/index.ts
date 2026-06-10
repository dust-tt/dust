import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { PostMemberInvitationsResponseBody } from "@app/lib/api/invitation";
import { PostMemberInvitationBodySchema } from "@app/lib/api/invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  iId: z.string(),
});

// Mounted under /api/w/:wId/invitations/:iId.
const app = workspaceApp();

app.use("*", ensureHasPermission("workspace:manage_members"));

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostMemberInvitationBodySchema),
  async (ctx): HandlerResult<PostMemberInvitationsResponseBody> => {
    const auth = ctx.get("auth");
    const { iId: invitationId } = ctx.req.valid("param");

    const invitation = await MembershipInvitationResource.fetchById(
      auth,
      invitationId
    );
    if (!invitation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invitation_not_found",
          message: "The invitation requested was not found.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const previousStatus = invitation.status;
    const previousRole = invitation.initialRole;

    // Escalation guard: elevating an invitation to `admin`, or modifying/
    // revoking one that is already `admin`, requires the manage_admin_role
    // permission — so business admins cannot use the edit path to grant admin.
    const targetsAdmin =
      previousRole === "admin" || body.initialRole === "admin";
    if (targetsAdmin && !auth.hasPermission("workspace:manage_admin_role")) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have permission to manage admin invitations.",
        },
      });
    }

    await invitation.updateStatus(body.status);
    await invitation.updateRole(body.initialRole);

    if (body.status === "revoked" && previousStatus !== "revoked") {
      void emitAuditLogEvent({
        auth,
        action: "invitation.revoked",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("invitation", {
            sId: invitation.sId,
            name: invitation.inviteEmail,
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          invited_email: invitation.inviteEmail,
        },
      });
    }

    if (body.initialRole !== previousRole) {
      void emitAuditLogEvent({
        auth,
        action: "invitation.role_updated",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("invitation", {
            sId: invitation.sId,
            name: invitation.inviteEmail,
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          invited_email: invitation.inviteEmail,
          previous_role: String(previousRole),
          new_role: String(body.initialRole),
        },
      });
    }

    return ctx.json({ invitation: invitation.toJSON() });
  }
);

export default app;
