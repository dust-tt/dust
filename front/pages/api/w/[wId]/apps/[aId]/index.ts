import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { App } from "@app/lib/models/apps";
import { apiError } from "@app/logger/withlogging";

export type GetOrPostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetOrPostAppResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const app = await App.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          sId: req.query.aId,
        }
      : {
          workspaceId: owner.id,
          visibility: ["public", "unlisted"],
          sId: req.query.aId,
        },
  });
  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
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
      break;
    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can modify an app.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted", "deleted"].includes(
          req.body.visibility
        )
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

      const description = req.body.description ? req.body.description : null;

      await app.update({
        name: req.body.name,
        description,
        visibility: req.body.visibility,
      });

      res.status(200).json({
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
      break;

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can delete an app.",
          },
        });
      }

      await app.update({
        visibility: "deleted",
      });

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  allowNonWorksapceUser: true,
});
