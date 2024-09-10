import type { DatasetType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDatasetHash } from "@app/lib/api/datasets";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import { Dataset } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

import { PostDatasetRequestBodySchema } from "..";

export type GetDatasetResponseBody = { dataset: DatasetType };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDatasetResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();

  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const vaultId = req.query.vId;
  if (typeof vaultId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameter `vId`",
      },
    });
  }

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query paramteter `aId`",
      },
    });
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app || app.vault.sId !== vaultId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  if (!app.canRead(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Querying a dataset requires read access to the app's vault.",
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
        message:
          "The dataset you're trying to view, modify or delete was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const showData = req.query.data === "true";
      const datasetHash = showData
        ? await getDatasetHash(auth, app, dataset.name, "latest")
        : null;
      return res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
          schema: showData ? dataset.schema : null,
          data: showData && datasetHash ? datasetHash.data : null,
        },
      });

    case "POST":
      if (!app.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Interacting with datasets requires write access to the app's vault.",
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

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
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
      if (!app.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Deleting a dataset requires write access to the app's vault.",
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

      return res.status(200).json({
        dataset: {
          name: dataset.name,
          description: dataset.description,
          data: null,
        },
      });

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
