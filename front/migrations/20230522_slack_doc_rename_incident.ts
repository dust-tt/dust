import config from "@app/lib/api/config";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types";
import { CoreAPI } from "@app/types";

async function main() {
  const dataSources = await DataSourceModel.findAll({
    where: {
      connectorProvider: "slack",
    },
  });

  await Promise.all(
    dataSources.map((ds) => {
      return (async () => {
        const connectorId = ds.connectorId;
        const provider = ds.connectorProvider;
        const workspaceId = ds.workspaceId;

        if (!workspaceId) {
          throw new Error("No workspaceId found");
        }
        if (!connectorId || !provider || provider !== "slack") {
          throw new Error("No connectorId found");
        }

        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const dds = await coreAPI.deleteDataSource({
          projectId: ds.dustAPIProjectId,
          dataSourceId: ds.dustAPIDataSourceId,
        });

        if (dds.isErr()) {
          throw new Error("Failed to delete the Data Source from Core");
        }

        console.log(`Deleting ${ds.name}`);

        await ds.destroy();

        const dataSourceName = `managed-${provider}`;
        const dataSourceDescription = `Managed Data Source for ${provider}`;
        const dataSourceProviderId = "openai";
        const dataSourceModelId = "text-embedding-ada-002";
        const dataSourceMaxChunkSize = 256;

        const dustProject = await coreAPI.createProject();
        if (dustProject.isErr()) {
          throw new Error("Failed to create new Core project.");
        }

        // Dust managed credentials: managed data source.
        const credentials = dustManagedCredentials();

        const dustDataSource = await coreAPI.createDataSource({
          projectId: dustProject.value.project.project_id.toString(),
          config: {
            embedder_config: {
              embedder: {
                max_chunk_size: dataSourceMaxChunkSize,
                model_id: dataSourceModelId,
                provider_id: dataSourceProviderId,
                splitter_id: "base_v0",
              },
            },
            qdrant_config: null,
          },
          credentials,
          name: dataSourceName,
        });

        if (dustDataSource.isErr()) {
          throw new Error("Failed to create Core DataSource");
        }

        // @ts-expect-error missing field that did not exist at the time of the migration
        let dataSource = await DataSourceModel.create({
          name: dataSourceName,
          description: dataSourceDescription,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          dustAPIDataSourceId:
            dustDataSource.value.data_source.data_source_id.toString(),
          workspaceId: workspaceId,
        });

        console.log(
          `Created new Data Source: wId=${workspaceId} dsId=${dataSource.id} dsName=${dataSource.name}`
        );

        dataSource = await dataSource.update({
          connectorId: connectorId,
          connectorProvider: provider,
        });

        console.log(
          `Connected to connectorId=${connectorId} connectorProvider=${provider}`
        );
      })();
    })
  );
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
