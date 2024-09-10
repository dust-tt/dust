import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { apiError } from "@app/logger/withlogging";

export type GetOrPostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetOrPostAppResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const vaultId = req.query.vId as string;
  if (typeof vaultId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameter `vId`",
      },
    });
  }

  const app = await AppResource.fetchById(auth, req.query.aId as string);
  if (!app || app.vault.sId !== vaultId || !app.canRead(auth)) {
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
        app: app.toJSON(),
      });
      break;
    case "POST":
      if (!app.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Modifying an app requires write access to the app's vault.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["private", "deleted"].includes(req.body.visibility)
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

      await app.updateSettings(auth, {
        name: req.body.name,
        description,
        visibility: req.body.visibility,
      });

      return res.status(200).json({
        app: app.toJSON(),
      });

    case "DELETE":
      if (!app.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Deleting an app requires write access to the app's vault.",
          },
        });
      }

      await app.markAsDeleted(auth);

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

export default withSessionAuthenticationForWorkspace(handler);
