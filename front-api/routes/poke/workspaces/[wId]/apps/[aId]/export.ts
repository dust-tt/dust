import { Hono } from "hono";
import omit from "lodash/omit";

import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import type { DatasetType } from "@app/types/dataset";

import { apiError } from "@front-api/middleware/utils";

export type ExportAppResponseBody = {
  app: Omit<AppType, "space" | "id"> & { datasets: DatasetType[] };
};

// Mounted at /api/poke/workspaces/:wId/apps/:aId/export.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId");
  if (!aId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you requested was not found.",
      },
    });
  }

  const dataSetsToFetch = (await getDatasets(auth, appResource.toJSON())).map(
    (ds) => ({ datasetId: ds.name, hash: "latest" })
  );
  const datasets: DatasetType[] = [];
  for (const dataset of dataSetsToFetch) {
    const fromCore = await getDatasetHash(
      auth,
      appResource,
      dataset.datasetId,
      dataset.hash,
      { includeDeleted: true }
    );
    if (fromCore) {
      datasets.push(fromCore);
    }
  }
  const appJson = omit(appResource.toJSON(), "id", "space");

  const body: ExportAppResponseBody = { app: { ...appJson, datasets } };
  return c.json(body);
});

export default app;
