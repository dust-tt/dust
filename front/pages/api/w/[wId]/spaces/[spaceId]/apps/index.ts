import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import { APP_NAME_REGEXP, CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetAppsResponseBody = {
  apps: AppType[];
};
export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAppsResponseBody | PostAppResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameter `spaceId`",
      },
    });
  }
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canList(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        apps: (await AppResource.listBySpace(auth, space)).map((app) =>
          app.toJSON()
        ),
      });
    case "POST":
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create an app.",
          },
        });
      }
      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { name: string, description: string }.",
          },
        });
      }

      if (!APP_NAME_REGEXP.test(req.body.name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The app name is invalid, expects a string with a length of 1-64 characters, containing only alphanumeric characters, underscores, and dashes.",
          },
        });
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const p = await coreAPI.createProject();
      if (p.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create internal project for the app.`,
            data_source_error: p.error,
          },
        });
      }

      const description = req.body.description ? req.body.description : null;

      const app = await AppResource.makeNew(
        {
          sId: generateLegacyModelSId(),
          name: req.body.name,
          description,
          dustAPIProjectId: p.value.project.project_id.toString(),
          workspaceId: owner.id,
          visibility: "private",
        },
        space
      );

      res.status(201).json({
        app: app.toJSON(),
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
