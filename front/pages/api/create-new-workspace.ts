import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { createWorkspace } from "@app/lib/iam/workspaces";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import { createAndLogMembership } from "@app/pages/api/login";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ sId: string }>>,
  session: SessionWithUser
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "The user is not found.",
      },
    });
  }

  if (user.workspaces.length > 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The user already has a workspace.",
      },
    });
  }

  const workspace = await createWorkspace(session);
  const u = await UserResource.fetchByModelId(user.id);

  if (!u) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  await createAndLogMembership({
    user: u,
    workspace,
    role: "admin",
  });

  res.status(200).json({ sId: workspace.sId });
}

export default withSessionAuthentication(handler);
