import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";
import type { GetTrackersResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers";
import { PostTrackersRequestBodySchema } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTrackersResponseBody>>,
  auth: Authenticator
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
  if (!flags.includes("labs_trackers") || !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access Trackers.",
      },
    });
  }
  switch (req.method) {
    case "PATCH":
      if (typeof req.query.tId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid tracker id provided.",
          },
        });
      }
      const trackerId = req.query.tId;
      const bodyValidation = PostTrackersRequestBodySchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const tracker = await TrackerConfigurationResource.fetchById(
        auth,
        trackerId
      );

      if (!tracker) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Tracker not found.",
          },
        });
      }

      if (!tracker.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You are not authorized to update this tracker.",
          },
        });
      }

      const body = bodyValidation.right;

      const updatedTrackerRes = await tracker.updateConfig(
        auth,
        {
          name: body.name,
          description: body.description,
          prompt: body.prompt,
          modelId: body.modelId,
          providerId: body.providerId,
          temperature: body.temperature,
          status: "active",
          frequency: body.frequency,
          recipients: body.recipients,
        },
        body.maintainedDataSources,
        body.watchedDataSources
      );

      if (updatedTrackerRes.isOk()) {
        return res.status(201).json({
          trackers: [updatedTrackerRes.value.toJSON()],
        });
      }
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update tracker.",
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, "space")
);
