import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { apiError } from "@app/logger/withlogging";
import type { WhitelistableFeature, WithAPIErrorResponse } from "@app/types";
import { isWhitelistableFeature } from "@app/types";

export type GetPokeFeaturesResponseBody = {
  features: {
    name: WhitelistableFeature;
    createdAt: string;
  }[];
};

export type CreateOrDeleteFeatureFlagResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      CreateOrDeleteFeatureFlagResponseBody | GetPokeFeaturesResponseBody
    >
  >,
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

  switch (req.method) {
    case "GET":
      const flags = await FeatureFlagResource.listForWorkspace(owner);

      const features = flags.map((f) => ({
        name: f.name,
        createdAt: f.createdAt.toISOString(),
      }));

      return res.status(200).json({ features });

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

export default withSessionAuthenticationForPoke(handler);
