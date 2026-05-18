import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import config from "@app/lib/api/config";
import { getDatasets } from "@app/lib/api/datasets";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { isString } from "@app/types/shared/utils/general";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

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
  c: Context
): Promise<{ appResource: AppResource; aId: string } | Response> {
  const auth = c.get("auth");
  const space = c.get("space");
  const { aId } = c.req.param();
  if (!isString(aId)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      },
      400
    );
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource || appResource.space.sId !== space.sId) {
    return c.json(
      {
        error: { type: "app_not_found", message: "The app was not found." },
      },
      404
    );
  }

  if (!appResource.canWrite(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message:
            "Interacting with datasets requires write access to the app's space.",
        },
      },
      403
    );
  }

  return { appResource, aId };
}

app.get("/", spaceResource({ requireCanWrite: true }), async (c) => {
  const loaded = await loadApp(c);
  if (loaded instanceof Response) {
    return loaded;
  }
  const { appResource } = loaded;
  const auth = c.get("auth");

  const datasets = await getDatasets(auth, appResource.toJSON());
  return c.json({ datasets });
});

app.post(
  "/",
  spaceResource({ requireCanWrite: true }),
  validate("json", PostDatasetRequestBodySchema),
  async (c) => {
    const loaded = await loadApp(c);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { appResource } = loaded;
    const auth = c.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const body = c.req.valid("json");

    // Check that dataset does not already exist.
    const existing = await DatasetModel.findAll({
      where: {
        workspaceId: owner.id,
        appId: appResource.id,
      },
      attributes: ["name"],
    });

    if (existing.some((e) => e.name === body.dataset.name)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "The dataset name already exists in this app.",
          },
        },
        400
      );
    }

    // Check name validity.
    if (
      !body.dataset.name.match(/^[a-zA-Z0-9_]+$/) ||
      body.dataset.name.length === 0
    ) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "The dataset name must only contain alphanumeric characters and " +
              "underscores and cannot be empty.",
          },
        },
        400
      );
    }

    // Check data validity.
    try {
      checkDatasetData({
        data: body.dataset.data,
        schema: body.schema,
      });
    } catch {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "The data passed as request body is invalid.",
          },
        },
        400
      );
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
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "The dataset creation failed.",
          },
        },
        500
      );
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

    return c.json(
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
