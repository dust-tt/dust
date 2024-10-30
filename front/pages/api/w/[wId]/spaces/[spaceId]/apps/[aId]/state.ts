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
  const { aId, spaceId } = req.query;
  if (typeof spaceId !== "string" || typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== spaceId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  if (!app.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Modifying an app requires write access to the app's space.",
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
