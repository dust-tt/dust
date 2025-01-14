import {
  AppsCheckRequestSchema,
  type AppsCheckResponseType,
  type GetAppsResponseType,
} from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { concurrentExecutor, CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import logger from "@app/logger/logger";
import config from "@app/lib/api/config";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AppsCheckResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  if (!space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const r = AppsCheckRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const apps = await concurrentExecutor(
        r.data.apps,
        async (appRequest) => {
          const app = await AppResource.fetchById(auth, appRequest.appId);
          if (!app) {
            return { ...appRequest, deployed: false };
          }
          const coreSpec = await coreAPI.getSpecification({
            projectId: app.dustAPIProjectId,
            specificationHash: appRequest.appHash,
          });
          if (coreSpec.isErr()) {
            return { ...appRequest, deployed: false };
          }

          return { ...appRequest, deployed: true };
        },
        { concurrency: 5 }
      );

      res.status(200).json({
        apps,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
