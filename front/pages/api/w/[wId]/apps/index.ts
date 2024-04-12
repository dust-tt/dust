import type { AppType, WithAPIErrorReponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { App } from "@app/lib/models/apps";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostAppResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!auth.isBuilder()) {
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
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted"].includes(req.body.visibility)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { name: string, description: string, visibility }.",
          },
        });
      }

      const coreAPI = new CoreAPI(logger);
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

      const app = await App.create({
        sId: generateModelSId(),
        name: req.body.name,
        description,
        visibility: req.body.visibility,
        dustAPIProjectId: p.value.project.project_id.toString(),
        workspaceId: owner.id,
      });

      res.status(201).json({
        app: {
          id: app.id,
          sId: app.sId,
          name: app.name,
          description: app.description,
          visibility: app.visibility,
          savedSpecification: app.savedSpecification,
          savedConfig: app.savedConfig,
          savedRun: app.savedRun,
          dustAPIProjectId: app.dustAPIProjectId,
        },
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

export default withLogging(handler);
