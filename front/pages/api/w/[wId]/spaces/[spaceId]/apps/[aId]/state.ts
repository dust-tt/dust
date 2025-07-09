import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { AppType, WithAPIErrorResponse } from "@app/types";

export const PostStateRequestBodySchema = t.type({
  specification: t.string,
  config: t.string,
  run: t.union([t.string, t.undefined]),
});

export type PostStateResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostStateResponseBody>>,
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
  if (!app || app.space.sId !== space.sId) {
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
      const body = PostStateRequestBodySchema.decode(req.body);
      if (isLeft(body)) {
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
        savedSpecification: body.right.specification,
        savedConfig: body.right.config,
      };

      if (body.right.run) {
        updateParams.savedRun = body.right.run;
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
