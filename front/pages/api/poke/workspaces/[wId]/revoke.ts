import type { WithAPIErrorReponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator, getSession } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";

export type RevokeUserResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<RevokeUserResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
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
      const { userId } = req.body;
      if (!userId || typeof userId !== "string") {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "Could not find the user.",
          },
        });
      }

      const user = await getUserForWorkspace(auth, { userId });
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "Could not find the user.",
          },
        });
      }

      const revokeResult = await MembershipResource.revokeMembership({
        user,
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

      await launchUpdateUsageWorkflow({ workspaceId: owner.sId });

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
