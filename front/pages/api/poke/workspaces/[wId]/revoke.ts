import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { revokeAndTrackMembership } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

export type RevokeUserResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RevokeUserResponseBody>>,
  session: SessionWithUser
): Promise<void> {
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

      const revokeResult = await revokeAndTrackMembership(owner, user);

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
          case "invalid_end_at":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "invalid_request_error",
                message: "Can't revoke membership before it has started.",
              },
            });
            break;
          default:
            assertNever(revokeResult.error.type);
        }
      }

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

export default withSessionAuthentication(handler);
