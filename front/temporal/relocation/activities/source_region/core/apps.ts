import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import type { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import logger from "@app/logger/logger";
import type { CoreAppAPIRelocationBlob } from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import type { CoreAPIDataset, ModelId } from "@app/types";
import { CoreAPI } from "@app/types";

const BATCH_SIZE = 10;

export async function retrieveAppsCoreIdsBatch({
  lastId,
  workspaceId,
}: {
  lastId?: ModelId;
  workspaceId: string;
}): Promise<{
  dustAPIProjectIds: string[];
  hasMore: boolean;
  lastId: ModelId | undefined;
}> {
  const localLogger = logger.child({
    lastId,
    workspaceId,
  });

  localLogger.info("[Core] Retrieving core apps ids");

  const workspace = await getWorkspaceInfos(workspaceId);
  assert(workspace, "Workspace not found.");

  const whereClause: WhereOptions<SpaceModel> = {
    workspaceId: workspace.id,
  };

  if (lastId) {
    whereClause.id = {
      [Op.gt]: lastId,
    };
  }

  const apps = await AppModel.findAll({
    where: whereClause,
    order: [["id", "ASC"]],
    limit: BATCH_SIZE,
  });

  localLogger.info({ appsCount: apps.length }, "[Core] Retrieved apps");

  return {
    dustAPIProjectIds: apps.map((a) => a.dustAPIProjectId),
    hasMore: apps.length === BATCH_SIZE,
    lastId: apps.length > 0 ? apps[apps.length - 1].id : undefined,
  };
}

export async function getApp({
  dustAPIProjectId,
  workspaceId,
  sourceRegion,
}: {
  dustAPIProjectId: string;
  workspaceId: string;
  sourceRegion: RegionType;
}): Promise<{
  dataPath: string;
}> {
  const localLogger = logger.child({
    dustAPIProjectId,
    sourceRegion,
  });

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreSpec = await coreAPI.getSpecificationHashes({
    projectId: dustAPIProjectId,
  });
  if (coreSpec.isErr()) {
    throw new Error("Failed to get core specification hashes");
  }

  const specsToFetch = coreSpec.value.hashes;

  const coreSpecifications: Record<string, string> = {};

  if (specsToFetch) {
    for (const hash of specsToFetch) {
      const coreSpecification = await coreAPI.getSpecification({
        projectId: dustAPIProjectId,
        specificationHash: hash,
      });

      if (coreSpecification.isErr()) {
        throw new Error("Failed to get core specification");
      }
      coreSpecifications[hash] = coreSpecification.value.specification.data;
    }
  }

  const dataSetsToFetch = await coreAPI.getDatasets({
    projectId: dustAPIProjectId,
  });

  if (dataSetsToFetch.isErr()) {
    throw new Error("Failed to get datasets");
  }

  const datasets: CoreAPIDataset[] = [];
  for (const datasetId of Object.keys(dataSetsToFetch.value.datasets)) {
    const dataSetVersions = dataSetsToFetch.value.datasets[datasetId];
    for (const dataSetVersion of dataSetVersions) {
      const apiDataset = await coreAPI.getDataset({
        projectId: dustAPIProjectId,
        datasetName: datasetId,
        datasetHash: dataSetVersion.hash,
      });

      if (apiDataset.isErr()) {
        throw new Error("Failed to get dataset");
      }

      datasets.push(apiDataset.value.dataset);
    }
  }

  const blobs: CoreAppAPIRelocationBlob = {
    blobs: {
      apps: [
        {
          coreSpecifications,
          datasets,
        },
      ],
    },
  };

  const dataPath = await writeToRelocationStorage(blobs, {
    workspaceId,
    type: "core",
    operation: "apps_blobs",
  });

  localLogger.info(
    {
      dataPath,
    },
    "[Core] Retrieved app"
  );

  return { dataPath };
}
