import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { App } from "@app/lib/models/apps";
import { apiError } from "@app/logger/withlogging";

export type PostStateResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostStateResponseBody>>,
  auth: Authenticator
): Promise<void> {
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
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.specification == "string") ||
        !(typeof req.body.config == "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { specification: string, config: string }.",
          },
        });
      }

      const updateParams: {
        savedSpecification: string;
        savedConfig: string;
        savedRun?: string;
      } = {
        savedSpecification: req.body.specification,
        savedConfig: req.body.config,
      };

      if (req.body.run) {
        if (typeof req.body.run != "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The request body is invalid, `run` must be a string if provided.",
            },
          });
        }

        updateParams.savedRun = req.body.run;
      }

      await app.update(updateParams);

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
