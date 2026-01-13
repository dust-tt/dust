import { default as config } from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import { isConnectorProviderAssistantDefaultSelected } from "@app/lib/connector_providers";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { PlanType, Result, WorkspaceType } from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  Err,
  Ok,
} from "@app/types";

const PROJECT_CONVERSATIONS_DATASOURCE_NAME_PREFIX =
  "managed-project_conversations__";

/**
 * Generates a unique data source name for project conversations connector.
 */
function getProjectConversationsDatasourceName(spaceId: number): string {
  return `${PROJECT_CONVERSATIONS_DATASOURCE_NAME_PREFIX}${spaceId}`;
}

/**
 * Creates a dust_project connector and associated data source for a project space.
 * This is called automatically when a project is created.
 */
export async function createDustProjectConnectorForSpace(
  auth: Authenticator,
  space: SpaceResource,
  owner: WorkspaceType,
  _plan: PlanType
): Promise<Result<void, Error>> {
  const localLogger = logger.child({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  try {
    // Check if connector already exists
    const existingDataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      getProjectConversationsDatasourceName(space.id)
    );
    if (existingDataSource?.connectorProvider === "dust_project") {
      localLogger.info("Dust project connector already exists for this space");
      return new Ok(undefined);
    }

    // Get or create system API key
    const systemAPIKeyRes = await getOrCreateSystemApiKey(owner);
    if (systemAPIKeyRes.isErr()) {
      return new Err(
        new Error(
          `Could not create the system API key: ${systemAPIKeyRes.error.message}`
        )
      );
    }

    // Create Core API project and data source
    const dataSourceEmbedder =
      owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
    const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const dustProject = await coreAPI.createProject();
    if (dustProject.isErr()) {
      return new Err(
        new Error(
          `Failed to create internal project for the data source: ${dustProject.error.message}`
        )
      );
    }

    const dataSourceName = getProjectConversationsDatasourceName(space.id);
    const dustDataSource = await coreAPI.createDataSource({
      projectId: dustProject.value.project.project_id.toString(),
      config: {
        embedder_config: {
          embedder: {
            max_chunk_size: embedderConfig.max_chunk_size,
            model_id: embedderConfig.model_id,
            provider_id: embedderConfig.provider_id,
            splitter_id: embedderConfig.splitter_id,
          },
        },
        qdrant_config: {
          cluster: DEFAULT_QDRANT_CLUSTER,
          shadow_write_cluster: null,
        },
      },
      credentials: dustManagedCredentials(),
      name: dataSourceName,
    });

    if (dustDataSource.isErr()) {
      // Clean up Core API project if data source creation fails
      await coreAPI.deleteProject({
        projectId: dustProject.value.project.project_id.toString(),
      });
      return new Err(
        new Error(
          `Failed to create the data source: ${dustDataSource.error.message}`
        )
      );
    }

    // Create DataSourceResource and DataSourceViewResource
    const dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          assistantDefaultSelected:
            isConnectorProviderAssistantDefaultSelected("dust_project"),
          connectorProvider: "dust_project",
          description: `Conversations from project ${space.sId}`,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          dustAPIDataSourceId: dustDataSource.value.data_source.data_source_id,
          name: dataSourceName,
          workspaceId: owner.id,
        },
        space,
        auth.user()
      );

    const { dataSource } = dataSourceView;

    // Create the connector
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connectorsRes = await connectorsAPI.createConnector({
      provider: "dust_project",
      workspaceId: owner.sId,
      workspaceAPIKey: systemAPIKeyRes.value.secret,
      dataSourceId: dataSource.sId,
      connectionId: space.sId, // Use space.sId as connectionId (projectId)
      configuration: null,
    });

    if (connectorsRes.isErr()) {
      localLogger.error(
        {
          error: connectorsRes.error,
        },
        "Failed to create the connector"
      );

      // Rollback: delete data source
      await dataSource.delete(auth, { hardDelete: true });

      // Rollback: delete Core API data source
      await coreAPI.deleteDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: dustDataSource.value.data_source.data_source_id,
      });

      // Rollback: delete Core API project
      await coreAPI.deleteProject({
        projectId: dustProject.value.project.project_id.toString(),
      });

      return new Err(
        new Error(
          `Failed to create the connector: ${connectorsRes.error.message}`
        )
      );
    }

    // Link connector ID to data source
    await dataSource.setConnectorId(connectorsRes.value.id);

    localLogger.info(
      {
        connectorId: connectorsRes.value.id,
        dataSourceId: dataSource.sId,
      },
      "Successfully created dust_project connector for project"
    );

    return new Ok(undefined);
  } catch (error) {
    localLogger.error(
      { error },
      "Failed to create dust_project connector for project"
    );
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Deletes the dust_project connector for a project space.
 * This is called automatically when a project is deleted.
 * Note: The data source deletion is handled by the existing deletion flow.
 */
export async function deleteDustProjectConnectorForSpace(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<void, Error>> {
  const localLogger = logger.child({
    workspaceId: space.workspaceId,
    spaceId: space.sId,
  });

  try {
    // Find the data source with dust_project connector for this space
    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      getProjectConversationsDatasourceName(space.id)
    );

    if (!dataSource || dataSource.connectorProvider !== "dust_project") {
      // No connector exists, nothing to delete
      localLogger.info("No dust_project connector found for this space");
      return new Ok(undefined);
    }

    if (!dataSource.connectorId) {
      // Data source exists but no connector ID, nothing to delete
      localLogger.info("Data source exists but no connector ID found");
      return new Ok(undefined);
    }

    // Delete the connector
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connDeleteRes = await connectorsAPI.deleteConnector(
      dataSource.connectorId.toString(),
      true // force delete
    );

    if (connDeleteRes.isErr()) {
      // If connector not found, that's okay - it might have been deleted already
      if (connDeleteRes.error.type !== "connector_not_found") {
        return new Err(
          new Error(
            `Failed to delete connector: ${connDeleteRes.error.message}`
          )
        );
      }
      localLogger.info("Connector not found, may have been deleted already");
    }

    localLogger.info(
      {
        connectorId: dataSource.connectorId,
        dataSourceId: dataSource.sId,
      },
      "Successfully deleted dust_project connector for project"
    );

    return new Ok(undefined);
  } catch (error) {
    localLogger.error(
      { error },
      "Failed to delete dust_project connector for project"
    );
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
