import type { AppType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { AppResource } from "@app/lib/resources/app_resource";
import { Dataset } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";

export async function getDatasets(
  auth: Authenticator,
  app: AppType
): Promise<DatasetType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const datasets = await Dataset.findAll({
    where: {
      workspaceId: owner.id,
      appId: app.id,
    },
    order: [["updatedAt", "DESC"]],
    attributes: ["id", "name", "description", "schema"],
  });

  return datasets.map((dataset) => ({
    name: dataset.name,
    description: dataset.description,
    data: null,
    schema: dataset.schema,
  }));
}

export async function getDatasetSchema(
  auth: Authenticator,
  app: AppResource,
  name: string
): Promise<DatasetSchema | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const dataset = await Dataset.findOne({
    where: {
      workspaceId: owner.id,
      appId: app.id,
      name,
    },
  });

  if (!dataset) {
    return null;
  }

  return dataset.schema;
}

export async function getDatasetHash(
  auth: Authenticator,
  app: AppResource,
  name: string,
  hash: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {}
): Promise<DatasetType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const dataset = await Dataset.findOne({
    where: {
      workspaceId: owner.id,
      appId: app.id,
      name,
    },
  });

  if (!dataset && !includeDeleted) {
    return null;
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  // Translate latest if needed.
  if (hash == "latest") {
    const apiDatasets = await coreAPI.getDatasets({
      projectId: app.dustAPIProjectId,
    });

    if (apiDatasets.isErr()) {
      return null;
    }
    if (!(name in apiDatasets.value.datasets)) {
      return null;
    }
    if (apiDatasets.value.datasets[name].length == 0) {
      return null;
    }

    hash = apiDatasets.value.datasets[name][0].hash;
  }

  const apiDataset = await coreAPI.getDataset({
    projectId: app.dustAPIProjectId,
    datasetName: name,
    datasetHash: hash,
  });

  if (apiDataset.isErr()) {
    return null;
  }

  return {
    name,
    description: dataset?.description ?? null,
    data: apiDataset.value.dataset.data,
    schema: dataset?.schema ?? null,
  };
}
