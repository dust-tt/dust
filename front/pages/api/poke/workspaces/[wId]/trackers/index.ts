import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  TrackerConfigurationType,
  WithAPIErrorResponse,
} from "@app/types";

export type PokeListTrackers = {
  trackers: TrackerConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListTrackers>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
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
        message: "Could not find trackers.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const trackers = await TrackerConfigurationResource.listByWorkspace(auth);

      return res.status(200).json({
        trackers: trackers.map((t) => t.toJSON()),
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

export default withSessionAuthentication(handler);
