import config from "@app/lib/api/config";
import type { GetDatasetResponseBody } from "@app/lib/api/datasets";
import { getDatasetHash } from "@app/lib/api/datasets";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { APIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import type { Context, TypedResponse } from "hono";

import { PostDatasetRequestBodySchema } from "../schemas";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/datasets/:name.
const app = workspaceApp();

// Shared prelude for every method: resolves the workspace, app, and dataset
// from the path params and enforces read access on the app. Returns either
// the loaded resources (with the validated `aId` and `name` params) or the
// `Response` to short-circuit the handler with.
async function loadAppAndDataset(ctx: Context): Promise<
  | {
      appResource: AppResource;
      dataset: DatasetModel;
      aId: string;
      name: string;
    }
  | (Response & TypedResponse<APIErrorResponse>)
> {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const { aId, name } = ctx.req.param();
  if (!isString(aId) || !isString(name)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }
  const owner = auth.workspace();
  if (!owner) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource || appResource.space.sId !== space.sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }

  if (!appResource.canRead(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Querying a dataset requires read access to the app's space.",
      },
    });
  }

  const dataset = await DatasetModel.findOne({
    where: {
      workspaceId: owner.id,
      appId: appResource.id,
      name,
    },
  });
  if (!dataset) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "dataset_not_found",
        message:
          "The dataset you're trying to view, modify or delete was not found.",
      },
    });
  }

  return { appResource, dataset, aId, name };
}

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetDatasetResponseBody> => {
    const loaded = await loadAppAndDataset(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource, dataset } = loaded;
    const auth = ctx.get("auth");

    const showData = ctx.req.query("data") === "true";
    const datasetHash = showData
      ? await getDatasetHash(auth, appResource, dataset.name, "latest")
      : null;
    return ctx.json({
      dataset: {
        name: dataset.name,
        description: dataset.description,
        schema: showData ? dataset.schema : null,
        data: showData && datasetHash ? datasetHash.data : null,
      },
    });
  }
);

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostDatasetRequestBodySchema),
  async (ctx): HandlerResult<GetDatasetResponseBody> => {
    const loaded = await loadAppAndDataset(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource, dataset, name } = loaded;
    const auth = ctx.get("auth");

    if (!appResource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Interacting with datasets requires write access to the app's space.",
        },
      });
    }

    const body = ctx.req.valid("json");

    // Check name validity.
    if (
      !body.dataset.name.match(/^[a-zA-Z0-9_]+$/) ||
      body.dataset.name.length === 0
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The dataset name must only contain alphanumeric characters and " +
            "underscores and cannot be empty.",
        },
      });
    }
    if (name !== body.dataset.name) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The dataset name in the request body does not match the one in the path.",
        },
      });
    }

    // Check data validity.
    try {
      checkDatasetData({
        data: body.dataset.data,
        schema: body.schema,
      });
    } catch {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The data passed as request body is invalid.",
        },
      });
    }

    // Reorder all keys as Dust API expects them ordered.
    const data = body.dataset.data.map((d: any) => {
      return Object.keys(d)
        .sort()
        .reduce((obj: { [key: string]: any }, key) => {
          obj[key] = d[key];
          return obj;
        }, {});
    });

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const d = await coreAPI.createDataset({
      projectId: appResource.dustAPIProjectId,
      datasetId: body.dataset.name,
      data,
    });
    if (d.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "The dataset creation failed.",
        },
      });
    }

    const description = body.dataset.description
      ? body.dataset.description
      : null;

    await dataset.update({
      name: body.dataset.name,
      description,
      schema: body.schema,
    });

    return ctx.json({
      dataset: {
        name: body.dataset.name,
        description,
        data: null,
      },
    });
  }
);

app.delete(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetDatasetResponseBody> => {
    const loaded = await loadAppAndDataset(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource, dataset } = loaded;
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    if (!appResource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Deleting a dataset requires write access to the app's space.",
        },
      });
    }

    await DatasetModel.destroy({
      where: {
        workspaceId: owner.id,
        appId: appResource.id,
        name: dataset.name,
      },
    });

    return ctx.json({
      dataset: {
        name: dataset.name,
        description: dataset.description,
        data: null,
      },
    });
  }
);

export default app;
