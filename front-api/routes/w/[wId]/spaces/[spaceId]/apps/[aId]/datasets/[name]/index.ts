import { Hono } from "hono";

import config from "@app/lib/api/config";
import { getDatasetHash } from "@app/lib/api/datasets";
import { checkDatasetData } from "@app/lib/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import { PostDatasetRequestBodySchema } from "..";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/datasets/:name.
const app = new Hono();

app.get("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";
  const name = c.req.param("name") ?? "";
  const owner = auth.workspace();
  if (!owner) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
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

  if (!appResource.canRead(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message:
            "Querying a dataset requires read access to the app's space.",
        },
      },
      403
    );
  }

  const dataset = await DatasetModel.findOne({
    where: {
      workspaceId: owner.id,
      appId: appResource.id,
      name,
    },
  });

  if (!dataset) {
    return c.json(
      {
        error: {
          type: "dataset_not_found",
          message:
            "The dataset you're trying to view, modify or delete was not found.",
        },
      },
      404
    );
  }

  const showData = c.req.query("data") === "true";
  const datasetHash = showData
    ? await getDatasetHash(auth, appResource, dataset.name, "latest")
    : null;
  return c.json({
    dataset: {
      name: dataset.name,
      description: dataset.description,
      schema: showData ? dataset.schema : null,
      data: showData && datasetHash ? datasetHash.data : null,
    },
  });
});

app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", PostDatasetRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";
    const name = c.req.param("name") ?? "";
    const owner = auth.workspace();
    if (!owner) {
      return c.json(
        {
          error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        },
        404
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

    if (!appResource.canRead(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Querying a dataset requires read access to the app's space.",
          },
        },
        403
      );
    }

    const dataset = await DatasetModel.findOne({
      where: {
        workspaceId: owner.id,
        appId: appResource.id,
        name,
      },
    });
    if (!dataset) {
      return c.json(
        {
          error: {
            type: "dataset_not_found",
            message:
              "The dataset you're trying to view, modify or delete was not found.",
          },
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

    const body = c.req.valid("json");

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
    if (name !== body.dataset.name) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "The dataset name in the request body does not match the one in the path.",
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
    const d = await coreAPI.createDataset({
      projectId: appResource.dustAPIProjectId,
      datasetId: body.dataset.name,
      data,
    });
    if (d.isErr()) {
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

    await dataset.update({
      name: body.dataset.name,
      description,
      schema: body.schema,
    });

    return c.json({
      dataset: {
        name: body.dataset.name,
        description,
        data: null,
      },
    });
  }
);

app.delete("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";
  const name = c.req.param("name") ?? "";
  const owner = auth.workspace();
  if (!owner) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
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

  if (!appResource.canRead(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message:
            "Querying a dataset requires read access to the app's space.",
        },
      },
      403
    );
  }

  const dataset = await DatasetModel.findOne({
    where: {
      workspaceId: owner.id,
      appId: appResource.id,
      name,
    },
  });
  if (!dataset) {
    return c.json(
      {
        error: {
          type: "dataset_not_found",
          message:
            "The dataset you're trying to view, modify or delete was not found.",
        },
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
            "Deleting a dataset requires write access to the app's space.",
        },
      },
      403
    );
  }

  await DatasetModel.destroy({
    where: {
      workspaceId: owner.id,
      appId: appResource.id,
      name: dataset.name,
    },
  });

  return c.json({
    dataset: {
      name: dataset.name,
      description: dataset.description,
      data: null,
    },
  });
});

export default app;
