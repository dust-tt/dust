import type { LightWorkspaceType, WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { internalSubscribeWorkspaceToFreeNoPlan } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/scrub_workspace/temporal/client";

export type DowngradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<DowngradeWorkspaceResponseBody>>
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
      await internalSubscribeWorkspaceToFreeNoPlan({
        workspaceId: owner.sId,
      });

      // On downgrade, start a worklflow to pause all connectors + scrub the data after a specified retention period.
      await launchScheduleWorkspaceScrubWorkflow({ workspaceId: owner.sId });

      return res.status(200).json({
        workspace: {
          id: owner.id,
          sId: owner.sId,
          name: owner.name,
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
