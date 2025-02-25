import type {
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { assertNever, isMembershipRoleType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { revokeAndTrackMembership } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { showDebugTools } from "@app/lib/development";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type PostMemberResponseBody = {
  member: UserTypeWithWorkspaces;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMemberResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  // Allow Dust Super User to force role for testing
  const allowForSuperUserTesting =
    showDebugTools(featureFlags) &&
    auth.isDustSuperUser() &&
    req.body.force === "true";

  if (!auth.isAdmin() && !allowForSuperUserTesting) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can see memberships or modify it.",
      },
    });
  }

  const userId = req.query.uId;
  if (!(typeof userId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `uId` (string) is required.",
      },
    });
  }

  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      // TODO(@fontanierh): use DELETE for revoking membership
      if (req.body.role === "revoked") {
        const revokeResult = await revokeAndTrackMembership(owner, user);

        if (revokeResult.isErr()) {
          switch (revokeResult.error.type) {
            case "not_found":
              logger.error(
                { panic: true, revokeResult },
                "Failed to revoke membership and track usage."
              );
              return apiError(req, res, {
                status_code: 404,
                api_error: {
                  type: "workspace_user_not_found",
                  message: "Could not find the membership.",
                },
              });
            case "already_revoked":
            case "invalid_end_at":
              logger.error(
                { panic: true, revokeResult },
                "Failed to revoke membership and track usage."
              );
              break;
            default:
              assertNever(revokeResult.error.type);
          }
        }
      } else {
        const role = req.body.role;
        if (!isMembershipRoleType(role)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The request body is invalid, expects { role: 'admin' | 'builder' | 'user' }.",
            },
          });
        }

        const featureFlags = await getFeatureFlags(owner);
        const allowLastAdminRemoval = showDebugTools(featureFlags);

        const updateRes = await MembershipResource.updateMembershipRole({
          user,
          workspace: owner,
          newRole: role,
          // We allow to re-activate a terminated membership when updating the role here.
          allowTerminated: true,
          allowLastAdminRemoval,
        });

        if (updateRes.isErr()) {
          switch (updateRes.error.type) {
            case "not_found":
              return apiError(req, res, {
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
              return apiError(req, res, {
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
          void ServerSideTracking.trackUpdateMembershipRole({
            user: user.toJSON(),
            workspace: owner,
            previousRole: updateRes.value.previousRole,
            role: updateRes.value.newRole,
          });
        }
      }

      const w = { ...owner };
      w.role = "none";

      switch (req.body.role) {
        case "admin":
        case "builder":
        case "user":
          w.role = req.body.role;
          break;
        default:
          w.role = "none";
      }

      const member = {
        ...user.toJSON(),
        workspaces: [w],
      };

      res.status(200).json({ member });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
