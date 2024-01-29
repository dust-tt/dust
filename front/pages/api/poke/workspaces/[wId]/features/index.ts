import type {
  ReturnedAPIErrorType,
  WhitelistableFeature,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { apiError, withLogging } from "@app/logger/withlogging";

export type FeatureFlagsResponseBody = {
  features: WhitelistableFeature[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FeatureFlagsResponseBody | ReturnedAPIErrorType>
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
    case "GET":
      const flags = (
        await FeatureFlag.findAll({
          where: {
            workspaceId: owner.id,
          },
        })
      ).map((f) => f.name);

      return res.status(200).json({ features: flags });

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
