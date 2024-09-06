import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
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

  const app = await AppResource.fetchById(auth, req.query.aId as string);
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

      await app.updateState(auth, updateParams);

      return res.status(200).json({
        app: app.toJSON(),
      });

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
