import type { CoreAPIDataset, ModelId } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import type { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import {
  extractDatasetIdsAndHashes,
  getSpecificationFromCore,
  getSpecificationsHashesFromCore,
} from "@app/lib/utils/apps";
import logger from "@app/logger/logger";
import type { CoreAppAPIRelocationBlob } from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";

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
  lastId: ModelId;
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

  localLogger.info({ spacesCount: apps.length }, "[Core] Retrieved apps");

  return {
    dustAPIProjectIds: apps.map((a) => a.dustAPIProjectId),
    hasMore: apps.length === BATCH_SIZE,
    lastId: apps[apps.length - 1].id,
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

  const specsToFetch = await getSpecificationsHashesFromCore(dustAPIProjectId);

  const dataSetsToFetch: { datasetId: string; hash: string }[] = [];
  const coreSpecifications: Record<string, string> = {};

  if (specsToFetch) {
    for (const hash of specsToFetch) {
      const coreSpecification = await getSpecificationFromCore(
        dustAPIProjectId,
        hash
      );
      if (coreSpecification) {
        // Parse dataset_id and hash from specification if it contains DATA section
        dataSetsToFetch.push(
          ...extractDatasetIdsAndHashes(coreSpecification.data)
        );

        coreSpecifications[hash] = coreSpecification.data;
      }
    }
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const datasets: CoreAPIDataset[] = [];
  for (const dataset of dataSetsToFetch) {
    const apiDataset = await coreAPI.getDataset({
      projectId: dustAPIProjectId,
      datasetName: dataset.datasetId,
      datasetHash: dataset.hash,
    });

    if (apiDataset.isOk()) {
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
