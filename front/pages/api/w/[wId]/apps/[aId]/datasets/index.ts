import type { DatasetType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import config from "@app/lib/api/config";
import { getDatasets } from "@app/lib/api/datasets";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { Dataset } from "@app/lib/models/apps";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDatasetsResponseBody = {
  datasets: DatasetType[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetType;
};

export const PostDatasetRequestBodySchema = t.type({
  dataset: t.type({
    name: t.string,
    description: t.union([t.string, t.null]),
    data: t.array(t.record(t.string, t.any)),
  }),
  schema: t.array(
    t.type({
      key: t.string,
      type: t.union([
        t.literal("string"),
        t.literal("number"),
        t.literal("boolean"),
        t.literal("json"),
      ]),
      description: t.union([t.string, t.null]),
    })
  ),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDatasetsResponseBody | PostDatasetResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can interact with datasets.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

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

  switch (req.method) {
    case "GET":
      const datasets = await getDatasets(auth, app);

      res.status(200).json({
        datasets,
      });
      return;

    case "POST":
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

      // Check that dataset does not already exist.
      const existing = await Dataset.findAll({
        where: {
          workspaceId: owner.id,
          appId: app.id,
        },
        attributes: ["name"],
      });

      let exists = false;
      existing.forEach((e) => {
        if (e.name == bodyValidation.right.dataset.name) {
          exists = true;
        }
      });
      if (exists) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The dataset name already exists in this app.",
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
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const dataset = await coreAPI.createDataset({
        projectId: app.dustAPIProjectId,
        datasetId: bodyValidation.right.dataset.name,
        data,
      });
      if (dataset.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The dataset creation failed.",
            app_error: dataset.error,
          },
        });
      }

      const description = bodyValidation.right.dataset.description
        ? bodyValidation.right.dataset.description
        : null;

      await Dataset.create({
        name: bodyValidation.right.dataset.name,
        description,
        appId: app.id,
        workspaceId: owner.id,
        schema: bodyValidation.right.schema,
      });

      res.status(201).json({
        dataset: {
          name: req.body.name,
          description,
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

export default withSessionAuthenticationForWorkspace(handler);
