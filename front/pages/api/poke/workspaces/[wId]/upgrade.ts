import type { LightWorkspaceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { pokeUpgradeWorkspaceToPlan } from "@app/lib/plans/subscription";
import { apiError } from "@app/logger/withlogging";

export type UpgradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UpgradeWorkspaceResponseBody>>
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
      const planCode = req.query.planCode;
      if (typeof planCode !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The planCode parameter is missing.",
          },
        });
      }

      await pokeUpgradeWorkspaceToPlan(auth, planCode);

      return res.status(200).json({
        workspace: {
          id: owner.id,
          sId: owner.sId,
          name: owner.name,
          role: "admin",
          segmentation: owner.segmentation || null,
          whiteListedProviders: owner.whiteListedProviders,
          defaultEmbeddingProvider: owner.defaultEmbeddingProvider,
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

export default withSessionAuthentication(handler);
