import type { DatasetType } from "@dust-tt/types";
import type { ReturnedAPIErrorType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { Dataset } from "@app/lib/models";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

import { PostDatasetRequestBodySchema } from "..";

type GetDatasetResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDatasetResponseBody | ReturnedAPIErrorType>
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

  const app = await getApp(auth, req.query.aId as string);
  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  const [dataset] = await Promise.all([
    Dataset.findOne({
      where: {
        workspaceId: owner.id,
        appId: app.id,
        name: req.query.name,
      },
    }),
  ]);

  if (!dataset) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "dataset_not_found",
        message: "The dataset you're trying to modify or delete was not found.",
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
              "Only the users that are `builders` for the current workspace can modify an app.",
          },
        });
      }

      const bodyValidation = PostDatasetRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      // Check data validity.
      try {
        checkDatasetData({
          data: bodyValidation.right.dataset.data,
          schema: bodyValidation.right.schema,
        });
      } catch (e) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The data passed as request body is invalid.",
          },
        });
      }

      // Reorder all keys as Dust API expects them ordered.
      const data = bodyValidation.right.dataset.data.map((d: any) => {
        return Object.keys(d)
          .sort()
          .reduce((obj: { [key: string]: any }, key) => {
            obj[key] = d[key];
            return obj;
          }, {});
      });

      const coreAPI = new CoreAPI(logger);
      // Register dataset with the Dust internal API.
      const d = await coreAPI.createDataset({
        projectId: app.dustAPIProjectId,
        datasetId: bodyValidation.right.dataset.name,
        data,
      });
      if (d.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The dataset creation failed.",
            app_error: d.error,
          },
        });
      }

      const description = bodyValidation.right.dataset.description
        ? bodyValidation.right.dataset.description
        : null;

      await dataset.update({
        name: bodyValidation.right.dataset.name,
        description,
        schema: bodyValidation.right.schema,
      });

      res.status(200).json({
        dataset: {
          name: bodyValidation.right.dataset.name,
          description,
          data: null,
        },
      });
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "You can't delete an app in a workspace for which you're not a builder.",
          },
        });
      }

      await Dataset.destroy({
        where: {
          workspaceId: owner.id,
          appId: app.id,
          name: dataset.name,
        },
      });

      res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
          data: null,
        },
      });
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

export default withLogging(handler);
