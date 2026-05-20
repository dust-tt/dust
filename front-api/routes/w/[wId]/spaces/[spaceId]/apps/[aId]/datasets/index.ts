import config from "@app/lib/api/config";
import { getDatasets } from "@app/lib/api/datasets";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import name from "./[name]";

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

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/datasets.
//
// Interacting with datasets requires write access to the app's space.
// Read permission is not enough as it's available to all space users (or
// everybody for public spaces).
const app = new Hono();

// Shared prelude for GET and POST: resolves the app from `:aId`, verifies it
// belongs to the current space, and enforces write access on it. Returns
// either the loaded resources or the `Response` to short-circuit with.
async function loadApp(
  ctx: Context
): Promise<{ appResource: AppResource; aId: string } | Response> {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const { aId } = ctx.req.param();
  if (!isString(aId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
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

  return { appResource, aId };
}

app.get("/", withSpace({ requireCanWrite: true }), async (ctx) => {
  const loaded = await loadApp(ctx);
  if (loaded instanceof Response) {
    return loaded;
  }
  const { appResource } = loaded;
  const auth = ctx.get("auth");

  const datasets = await getDatasets(auth, appResource.toJSON());
  return ctx.json({ datasets });
});

app.post(
  "/",
  withSpace({ requireCanWrite: true }),
  validate("json", PostDatasetRequestBodySchema),
  async (ctx) => {
    const loaded = await loadApp(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource } = loaded;
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const body = ctx.req.valid("json");

    // Check that dataset does not already exist.
    const existing = await DatasetModel.findAll({
      where: {
        workspaceId: owner.id,
        appId: appResource.id,
      },
      attributes: ["name"],
    });

    if (existing.some((e) => e.name === body.dataset.name)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The dataset name already exists in this app.",
        },
      });
    }

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
    const dataset = await coreAPI.createDataset({
      projectId: appResource.dustAPIProjectId,
      datasetId: body.dataset.name,
      data,
    });
    if (dataset.isErr()) {
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

    await DatasetModel.create({
      name: body.dataset.name,
      description,
      appId: appResource.id,
      workspaceId: owner.id,
      schema: body.schema,
    });

    return ctx.json(
      {
        dataset: {
          name: body.dataset.name,
          description,
          data: null,
        },
      },
      201
    );
  }
);

app.route("/:name", name);

export default app;
