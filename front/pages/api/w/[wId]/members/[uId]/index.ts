import type {
  UserTypeWithWorkspaces,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { assertNever, isMembershipRoleType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator, getSession } from "@app/lib/auth";
import { updateWorkspacePerSeatSubscriptionUsage } from "@app/lib/plans/subscription";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostMemberResponseBody = {
  member: UserTypeWithWorkspaces;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostMemberResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
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
        const revokeResult = await MembershipResource.revokeMembership({
          userId: user.id,
          workspace: owner,
        });
        if (revokeResult.isErr()) {
          switch (revokeResult.error.type) {
            case "not_found":
              return apiError(req, res, {
                status_code: 404,
                api_error: {
                  type: "workspace_user_not_found",
                  message: "Could not find the membership.",
                },
              });
            case "already_revoked":
              // Should not happen, but we ignore.
              break;
            default:
              assertNever(revokeResult.error.type);
          }
        }

        await updateWorkspacePerSeatSubscriptionUsage({
          workspaceId: owner.sId,
        });
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
        const updateRoleResult = await MembershipResource.updateMembershipRole({
          userId: user.id,
          workspace: owner,
          newRole: role,
          // We allow to re-activate a terminated membership when updating the role here.
          allowTerminated: true,
        });
        if (updateRoleResult.isErr()) {
          switch (updateRoleResult.error.type) {
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
            default:
              assertNever(updateRoleResult.error.type);
          }
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
        ...user,
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

export default withLogging(handler);
