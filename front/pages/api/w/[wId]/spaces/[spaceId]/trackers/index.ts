import type {
  TrackerConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ModelIdCodec, ModelProviderIdCodec } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { apiError } from "@app/logger/withlogging";

export type GetTrackersResponseBody = {
  trackers: TrackerConfigurationType[];
};

const TrackerDataSourcesConfigurationBodySchema = t.array(
  t.type({
    dataSourceViewId: t.string,
    workspaceId: t.string,
    filter: t.type({
      parents: t.union([
        t.type({
          in: t.array(t.string),
          not: t.array(t.string),
        }),
        t.null,
      ]),
    }),
  })
);

export const PostTrackersRequestBodySchema = t.type({
  name: t.string,
  description: t.union([t.string, t.null]),
  prompt: t.union([t.string, t.null]),
  modelId: ModelIdCodec,
  providerId: ModelProviderIdCodec,
  frequency: t.string,
  temperature: t.number,
  recipients: t.array(t.string),
  maintainedDataSources: TrackerDataSourcesConfigurationBodySchema,
  watchedDataSources: TrackerDataSourcesConfigurationBodySchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTrackersResponseBody>>,
  auth: Authenticator,
  space: SpaceResource
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
    case "GET":
      return res.status(200).json({
        trackers: (
          await TrackerConfigurationResource.listBySpace(auth, space)
        ).map((tracker) => tracker.toJSON()),
      });

    case "POST":
      const existingTrackers = await TrackerConfigurationResource.listBySpace(
        auth,
        space
      );
      if (existingTrackers.length >= 3) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "You can't have more than 3 trackers in a space.",
          },
        });
      }

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

      const body = bodyValidation.right;
      const tracker = await TrackerConfigurationResource.makeNew(
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
        body.watchedDataSources,
        space
      );
      return res.status(201).json({
        trackers: [tracker.toJSON()],
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, "space")
);
