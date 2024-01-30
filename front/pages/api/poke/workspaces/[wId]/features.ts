import type {
  ReturnedAPIErrorType,
  WhitelistableFeature,
} from "@dust-tt/types";
import { isWhitelistableFeature } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetPokeFeaturesResponseBody = {
  features: WhitelistableFeature[];
};

export type CreateOrDeleteFeatureFlagResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | CreateOrDeleteFeatureFlagResponseBody
    | GetPokeFeaturesResponseBody
    | ReturnedAPIErrorType
  >
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

  const { name: flag } = req.body;
  if (flag && !isWhitelistableFeature(flag)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid feature flag name.",
      },
    });
  }

  let existingFlag: FeatureFlag | null = null;
  if (flag) {
    existingFlag = await FeatureFlag.findOne({
      where: {
        workspaceId: owner.id,
        name: flag,
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

    case "POST":
      if (!flag) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The name of the feature flag is required.",
          },
        });
      }
      if (existingFlag) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "feature_flag_already_exists",
            message: "The feature flag already exists.",
          },
        });
      }

      await FeatureFlag.create({
        workspaceId: owner.id,
        name: flag,
      });

      return res.status(200).json({ success: true });

    case "DELETE":
      if (!flag) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The name of the feature flag is required.",
          },
        });
      }
      if (!existingFlag) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "feature_flag_not_found",
            message: "Could not find the feature flag.",
          },
        });
      }

      await existingFlag.destroy();
      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
