import type { TrackerGenerationType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";

export type GetTrackerGenerationsResponseBody = {
  generations: TrackerGenerationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTrackerGenerationsResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("labs_trackers") || !auth.isBuilder() || !space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` for the current workspace can access Trackers.",
      },
    });
  }

  const { trackerId } = req.query;
  if (!trackerId || typeof trackerId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid trackerId parameter.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const tracker = await TrackerConfigurationResource.fetchWithGenerationsToConsume(
        auth,
        parseInt(trackerId, 10)
      );

      if (!tracker) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "not_found",
            message: "Tracker not found.",
          },
        });
      }

      return res.status(200).json({
        generations: tracker.generations || [],
      });
    }

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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
