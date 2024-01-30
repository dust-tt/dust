import type {
  ReturnedAPIErrorType,
  WhitelistableFeature,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getFeatureFlags } from "@app/lib/api/feature_flags";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetFeaturesResponseBody = {
  features: WhitelistableFeature[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetFeaturesResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace are authorized to access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const features = await getFeatureFlags(owner);
      res.status(200).json({ features });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
