import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import type { CoreAppAPIRelocationBlob } from "@app/temporal/relocation/activities/types";
import { readFromRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { CoreAPI } from "@app/types";
import { concurrentExecutor } from "@app/types";

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
        const res = await coreAPI.createDataset({
          projectId: dustAPIProjectId,
          datasetId: dataset.dataset_id,
          data: dataset.data,
        });

        if (res.isErr()) {
          throw new Error("Failed to create dataset");
        }
      },
      { concurrency: 10 }
    );

    await concurrentExecutor(
      Object.values(app.coreSpecifications),
      async (specification) => {
        const res = await coreAPI.saveSpecification({
          projectId: dustAPIProjectId,
          specification: specification,
        });

        if (res.isErr()) {
          throw new Error("Failed to save specification");
        }
      },
      { concurrency: 10 }
    );
  }
}
