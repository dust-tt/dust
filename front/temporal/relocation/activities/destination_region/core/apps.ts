import { CoreAPI } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import type { CoreAppAPIRelocationBlob } from "@app/temporal/relocation/activities/types";
import { readFromRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";

export async function processApp({
  dustAPIProjectId,
  dataPath,
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  dustAPIProjectId: string;
  dataPath: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
    dustAPIProjectId,
  });

  localLogger.info("[Core] Processing app");

  const data =
    await readFromRelocationStorage<CoreAppAPIRelocationBlob>(dataPath);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  for (const app of data.blobs.apps) {
    await concurrentExecutor(
      app.datasets,
      async (dataset) => {
        await coreAPI.createDataset({
          projectId: dustAPIProjectId,
          datasetId: dataset.dataset_id,
          data: dataset.data,
        });
      },
      { concurrency: 10 }
    );

    await concurrentExecutor(
      Object.values(app.coreSpecifications),
      async (specification) => {
        await coreAPI.saveSpecification({
          projectId: dustAPIProjectId,
          specification: specification,
        });
      },
      { concurrency: 10 }
    );
  }
}
