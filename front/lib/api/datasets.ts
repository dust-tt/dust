import { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { Dataset } from "@app/lib/models";
import { AppType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";

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
    attributes: ["id", "name", "description"],
  });

  return datasets.map((dataset) => ({
    name: dataset.name,
    description: dataset.description,
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
  };
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

  // Translate latest if needed.
  if (hash == "latest") {
    const apiDatasets = await CoreAPI.getDatasets(app.dustAPIProjectId);

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

  const apiDataset = await CoreAPI.getDataset(
    app.dustAPIProjectId,
    dataset.name,
    hash
  );

  if (apiDataset.isErr()) {
    return null;
  }

  return {
    name: dataset.name,
    description: dataset.description,
    data: apiDataset.value.dataset.data,
  };
}
