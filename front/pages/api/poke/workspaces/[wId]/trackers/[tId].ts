import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  TrackerConfigurationType,
  WithAPIErrorResponse,
} from "@app/types";
import { isString } from "@app/types";

export type PokeFetchTrackerResponse = {
  tracker: TrackerConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeFetchTrackerResponse>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, tId } = req.query;
  if (!isString(wId) || !isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "tracker_not_found",
        message: "The tracker was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "tracker_not_found",
        message: "Could not find the tracker.",
      },
    });
  }

  const tracker = await TrackerConfigurationResource.fetchById(auth, tId);
  if (!tracker) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "tracker_not_found",
        message: "Could not find the tracker.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        tracker: tracker.toJSON(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
