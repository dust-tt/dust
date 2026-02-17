import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetNoWorkspaceAuthContextResponseType = {
  user: UserTypeWithWorkspaces;
  defaultWorkspaceId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetNoWorkspaceAuthContextResponseType>
  >,
  session: SessionWithUser
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  if (session.workspaceId) {
    const redirect = await getWorkspaceRegionRedirect(session.workspaceId);
    if (redirect) {
      return res.status(400).json({
        error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }
  }

  const user = await getUserFromSession(session);

  if (!user) {
    if (session) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "user_not_found",
          message: "User not found.",
        },
      });
    }

    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  return res.status(200).json({
    user,
    defaultWorkspaceId: session.workspaceId ?? null,
  });
}

export default withSessionAuthentication(handler);
