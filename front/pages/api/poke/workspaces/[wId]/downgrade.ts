import type { WorkspaceType } from "@dust-tt/types";
import type { ReturnedAPIErrorType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { internalSubscribeWorkspaceToFreeTestPlan } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";

export type DowngradeWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DowngradeWorkspaceResponseBody | ReturnedAPIErrorType>
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
      await internalSubscribeWorkspaceToFreeTestPlan({
        workspaceId: owner.sId,
      });

      return res.status(200).json({
        workspace: {
          id: owner.id,
          sId: owner.sId,
          name: owner.name,
          allowedDomain: owner.allowedDomain || null,
          role: "admin",
          segmentation: owner.segmentation || null,
        },
      });

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
