/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getDatasets } from "@app/lib/api/datasets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { CoreAPI } from "@app/types/core/core_api";
import type { DatasetType } from "@app/types/dataset";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type GetDatasetsResponseBody = {
  datasets: DatasetType[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetType;
};

export const PostDatasetRequestBodySchema = z.object({
  dataset: z.object({
    name: z.string(),
    description: z.string().nullable(),
    data: z.array(z.record(z.string(), z.any())),
  }),
  schema: z.array(
    z.object({
      key: z.string(),
      type: z.enum(["string", "number", "boolean", "json"]),
      description: z.string().nullable(),
    })
  ),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDatasetsResponseBody | PostDatasetResponseBody>
  >,
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

  const owner = auth.getNonNullableWorkspace();

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
        message:
          "Interacting with datasets requires write access to the app's space.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const datasets = await getDatasets(auth, app.toJSON());

      res.status(200).json({
        datasets,
      });
      return;

    case "POST":
      const bodyValidation = PostDatasetRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      // Check that dataset does not already exist.
      const existing = await DatasetModel.findAll({
        where: {
          workspaceId: owner.id,
          appId: app.id,
        },
        attributes: ["name"],
      });

      let exists = false;
      existing.forEach((e) => {
        if (e.name == bodyValidation.data.dataset.name) {
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

      // Check name validity
      if (
        !bodyValidation.data.dataset.name.match(/^[a-zA-Z0-9_]+$/) ||
        bodyValidation.data.dataset.name.length === 0
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The dataset name must only contain alphanumeric characters and " +
              "underscores and cannot be empty.",
          },
        });
      }

      // Check data validity.
      try {
        checkDatasetData({
          data: bodyValidation.data.dataset.data,
          schema: bodyValidation.data.schema,
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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
      const data = bodyValidation.data.dataset.data.map((d: any) => {
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
        datasetId: bodyValidation.data.dataset.name,
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

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const description = bodyValidation.data.dataset.description
        ? bodyValidation.data.dataset.description
        : null;

      await DatasetModel.create({
        name: bodyValidation.data.dataset.name,
        description,
        appId: app.id,
        workspaceId: owner.id,
        schema: bodyValidation.data.schema,
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

export default withSessionAuthenticationForWorkspace(
  // Interacting with datasets requires write access to the app's space.
  // Read permission is not enough as it's available to all space users (or everybody for public spaces)
  withResourceFetchingFromRoute(handler, { space: { requireCanWrite: true } })
);
