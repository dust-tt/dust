import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { RegionType } from "@app/lib/api/regions/config";
import { config, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetRegionResponseType = {
  region: RegionType;
  regionUrls: Record<RegionType, string>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRegionResponseType>>,
  session: SessionWithUser
) {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
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
      const currentRegion = config.getCurrentRegion();
      return res.status(200).json({
        region: currentRegion,
        regionUrls: SUPPORTED_REGIONS.reduce(
          (acc, region) => {
            acc[region] = config.getRegionUrl(region);
            return acc;
          },
          {} as Record<string, string>
        ),
      });

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

export default withSessionAuthenticationForPoke(handler);
