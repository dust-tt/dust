import type { AppType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { Dataset } from "@app/lib/resources/storage/models/apps";
import logger from "@app/logger/logger";

import config from "./config";

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

export async function getDataset(
  auth: Authenticator,
  app: AppType,
  name: string
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

  if (!dataset) {
    return null;
  }

  return {
    name: dataset.name,
    description: dataset.description,
    data: null,
    schema: dataset.schema,
  };
}

export async function getDatasetSchema(
  auth: Authenticator,
  app: AppType,
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
  app: AppType,
  name: string,
  hash: string
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

  if (!dataset) {
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
    if (!(dataset.name in apiDatasets.value.datasets)) {
      return null;
    }
    if (apiDatasets.value.datasets[dataset.name].length == 0) {
      return null;
    }

    hash = apiDatasets.value.datasets[dataset.name][0].hash;
  }

  const apiDataset = await coreAPI.getDataset({
    projectId: app.dustAPIProjectId,
    datasetName: dataset.name,
    datasetHash: hash,
  });

  if (apiDataset.isErr()) {
    return null;
  }

  return {
    name: dataset.name,
    description: dataset.description,
    data: apiDataset.value.dataset.data,
    schema: dataset.schema,
  };
}
