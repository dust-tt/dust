/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
// @migration-target: front-api/routes/w/spaces/apps.ts
import { softDeleteApp } from "@app/lib/api/apps";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { AppType } from "@app/types/app";
import { APP_NAME_REGEXP } from "@app/types/app";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type GetOrPostAppResponseBody = {
  app: AppType;
};

const PatchAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetOrPostAppResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.space.sId !== space.sId || !app.canRead(auth)) {
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
              "Modifying an app requires write access to the app's space.",
          },
        });
      }

      const bodyValidation = PatchAppBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }

      const { name, description } = bodyValidation.data;

      if (!APP_NAME_REGEXP.test(name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The app name is invalid, expects a string with a length of 1-64 characters, containing only alphanumeric characters, underscores, and dashes.",
          },
        });
      }

      await app.updateSettings(auth, {
        name,
        description,
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
              "Deleting an app requires write access to the app's space.",
          },
        });
      }

      const deleteRes = await softDeleteApp(auth, app);
      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 409,
          api_error: {
            type: "invalid_request_error",
            message: deleteRes.error.message,
          },
        });
      }

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
