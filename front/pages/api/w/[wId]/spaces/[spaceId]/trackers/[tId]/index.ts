import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";
import type { GetTrackersResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers";
import { PostTrackersRequestBodySchema } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTrackersResponseBody | { success: true }>
  >,
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
  if (
    !flags.includes("labs_trackers") ||
    !auth.isBuilder() ||
    !space.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access Trackers.",
      },
    });
  }

  if (!space.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Missing permission to edit the space's trackers.",
      },
    });
  }

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
  const tracker = await TrackerConfigurationResource.fetchById(auth, trackerId);

  if (!tracker) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Tracker not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
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
          status: body.status,
          name: body.name,
          description: body.description,
          prompt: body.prompt,
          modelId: body.modelId,
          providerId: body.providerId,
          temperature: body.temperature,
          frequency: body.frequency,
          skipEmptyEmails: body.skipEmptyEmails,
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

    case "DELETE":
      const deletedTrackerRes = await tracker.delete(auth, {
        hardDelete: false,
      });
      if (deletedTrackerRes.isOk()) {
        return res.status(201).json({
          success: true,
        });
      }
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to delete tracker.",
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
