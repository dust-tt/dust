import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { AppModel } from "@app/lib/resources/storage/models/apps";
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

  // Create new project for the app.
  const projectRes = await coreAPI.createProject();

  if (projectRes.isErr()) {
    throw new Error(`Failed to create project: ${projectRes.error}`);
  }

  const newDustAPIProjectId = projectRes.value.project.project_id.toString();

  for (const app of data.blobs.apps) {
    await concurrentExecutor(
      app.datasets,
      async (dataset) => {
        const res = await coreAPI.createDataset({
          projectId: newDustAPIProjectId,
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
          projectId: newDustAPIProjectId,
          specification: specification,
        });

        if (res.isErr()) {
          throw new Error("Failed to save specification");
        }
      },
      { concurrency: 10 }
    );
  }

  // Update app with new project id.
  await AppModel.update(
    {
      dustAPIProjectId: newDustAPIProjectId,
    },
    {
      where: {
        dustAPIProjectId: dustAPIProjectId,
      },
    }
  );
}
