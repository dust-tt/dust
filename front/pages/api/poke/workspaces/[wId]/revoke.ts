import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Membership, Workspace } from "@app/lib/models";
import { updateWorkspacePerSeatSubscriptionUsage } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";

export type RevokeUserResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevokeUserResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(session, null);
  const user = auth.user();

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }

      const workspace = await Workspace.findOne({
        where: {
          sId: wId,
        },
      });

      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Could not find the workspace.",
          },
        });
      }

      const { userId } = req.body;
      if (!userId || typeof userId !== "number") {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "Could not find the user.",
          },
        });
      }

      const m = await Membership.findOne({
        where: {
          userId,
          workspaceId: workspace.id,
        },
      });

      if (!m) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_user_not_found",
            message: "Could not find the membership.",
          },
        });
      }

      await m.update({
        role: "revoked",
      });
      await updateWorkspacePerSeatSubscriptionUsage({
        workspaceId: workspace.sId,
      });

      return res.status(200).json({ success: true });

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
