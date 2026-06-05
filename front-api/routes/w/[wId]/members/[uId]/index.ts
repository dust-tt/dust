import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  revokeAndTrackMembership,
  updateMembershipRoleAndTrack,
} from "@app/lib/api/membership";
import type {
  GetMemberResponseBody,
  PostMemberResponseBody,
} from "@app/lib/api/user";
import { getUserForWorkspace } from "@app/lib/api/user";
import { getFeatureFlags } from "@app/lib/auth";
import { showDebugTools } from "@app/lib/development";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import { isMembershipRoleType } from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import seatType from "./seat-type";
import spendLimit from "./spend_limit";

const PostMemberBodySchema = z.object({
  role: z.string(),
  force: z.string().optional(),
});

const ParamsSchema = z.object({
  uId: z.string(),
});

// Mounted at /api/w/:wId/members/:uId.
const app = workspaceApp();

app.route("/seat-type", seatType);
app.route("/spend_limit", spendLimit);

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const { uId } = ctx.req.valid("param");

  const user = await getUserForWorkspace(auth, { userId: uId });
  if (!user) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: owner,
    });

  if (!membership) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find membership for the user.",
      },
    });
  }

  const response: GetMemberResponseBody = {
    member: {
      id: user.sId,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName(),
      image: user.imageUrl,
      revoked: membership.isRevoked(),
      role: membership.isRevoked() ? "none" : membership.role,
      startAt: membership.startAt?.toISOString() ?? null,
      endAt: membership.endAt?.toISOString() ?? null,
    },
  };

  return ctx.json(response);
});

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostMemberBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { uId } = ctx.req.valid("param");

    const featureFlags = await getFeatureFlags(auth);
    const body = ctx.req.valid("json");
    const isAdmin = auth.isAdmin();

    // Allow Dust Super User to force role for testing
    const allowForSuperUserTesting =
      showDebugTools(featureFlags) &&
      auth.isDustSuperUser() &&
      body.force === "true";

    if (!isAdmin && !allowForSuperUserTesting) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can modify memberships.",
        },
      });
    }

    const user = await getUserForWorkspace(auth, { userId: uId });
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: "The user requested was not found.",
        },
      });
    }

    // TODO(@fontanierh): use DELETE for revoking membership
    if (body.role === "revoked") {
      const revokeResult = await revokeAndTrackMembership(auth, user);

      if (revokeResult.isErr()) {
        switch (revokeResult.error.type) {
          case "not_found":
            logger.error(
              {
                panic: true,
                revokeResult,
                userId: user.sId,
                workspaceId: owner.sId,
              },
              "Failed to revoke membership and track usage."
            );
            return apiError(ctx, {
              status_code: 404,
              api_error: {
                type: "workspace_user_not_found",
                message: "Could not find the membership.",
              },
            });
          case "last_admin":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Cannot revoke the last admin of a workspace.",
              },
            });
          case "already_revoked":
          case "invalid_end_at":
            break;
          default:
            assertNever(revokeResult.error.type);
        }
      }
    } else {
      const role = body.role;
      if (!isMembershipRoleType(role)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { role: 'admin' | 'builder' | 'user' }.",
          },
        });
      }

      // Check if this is an admin trying to change their own role and they are the sole admin
      const currentUser = auth.user();
      if (currentUser && currentUser.id === user.id && auth.isAdmin()) {
        // Count active admins to prevent sole admin from changing their own role
        const adminsCount =
          await MembershipResource.getMembersCountForWorkspace({
            workspace: owner,
            activeOnly: true,
            rolesFilter: ["admin"],
          });

        if (adminsCount < 2 && role !== "admin") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Cannot change your role as you are the sole admin of this workspace.",
            },
          });
        }
      }

      const allowLastAdminRemoval = showDebugTools(featureFlags);

      const updateRes = await updateMembershipRoleAndTrack({
        user,
        workspace: owner,
        newRole: role,
        allowTerminated: true,
        allowLastAdminRemoval,
        author: auth.user()?.toJSON() ?? "no-author",
      });

      if (updateRes.isErr()) {
        switch (updateRes.error.type) {
          case "not_found":
            return apiError(ctx, {
              status_code: 404,
              api_error: {
                type: "workspace_user_not_found",
                message: "Could not find the membership.",
              },
            });
          case "membership_already_terminated":
            // This cannot happen because we allow updating terminated memberships
            // by setting `allowTerminated` to true.
            throw new Error("Unreachable.");
          case "already_on_role":
            // Should not happen, but we ignore.
            break;
          case "last_admin":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Cannot remove the last admin of a workspace.",
              },
            });
          default:
            assertNever(updateRes.error.type);
        }
      }

      if (updateRes.isOk()) {
        void emitAuditLogEvent({
          auth,
          action: "membership.role_updated",
          targets: [
            buildAuditLogTarget("workspace", owner),
            buildAuditLogTarget("user", {
              sId: user.sId,
              name: user.fullName() ?? "unknown",
            }),
          ],
          context: getAuditLogContext(auth),
          metadata: {
            previous_role: updateRes.value.previousRole,
            new_role: updateRes.value.newRole,
          },
        });
      }
    }

    const w = { ...owner };
    w.role = "none";

    switch (body.role) {
      case "admin":
      case "builder":
      case "user":
        w.role = body.role;
        break;
      default:
        w.role = "none";
    }

    const member = {
      ...user.toJSON(),
      workspaces: [w],
    };

    return ctx.json<PostMemberResponseBody>({ member });
  }
);

export default app;
