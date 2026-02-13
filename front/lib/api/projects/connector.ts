// Okay to use public API types because it's internal stuff mostly.
// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { default as config } from "@app/lib/api/config";
import {
  PROJECT_CONTEXT_FOLDER_ID,
  PROJECT_CONTEXT_FOLDER_NAME,
} from "@app/lib/api/projects/constants";
import {
  fetchProjectDataSource,
  fetchProjectDataSourceView,
  getProjectConversationsDatasourceName,
} from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import { isConnectorProviderAssistantDefaultSelected } from "@app/lib/connector_providers";
import { executeWithLock } from "@app/lib/lock";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getProjectRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI, EMBEDDING_CONFIGS } from "@app/types/core/core_api";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * Creates a dust_project connector and associated data source for a project space.
 * This function is idempotent - it will ensure all components exist, creating any that are missing.
 * This is called automatically when a project is created.
 */
export async function createDataSourceAndConnectorForProject(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const localLogger = logger.child({
    workspaceId: workspace.sId,
    spaceId: space.sId,
  });

  const lockName = `createDataSourceAndConnectorForProject-${space.sId}`;

  return executeWithLock(lockName, async (): Promise<Result<void, Error>> => {
    try {
      // Get or create system API key
      const systemAPIKeyRes = await getOrCreateSystemApiKey(workspace);
      if (systemAPIKeyRes.isErr()) {
        return new Err(
          new Error(
            `Could not create the system API key: ${systemAPIKeyRes.error.message}`
          )
        );
      }

      const dataSourceEmbedder =
        auth.getNonNullableWorkspace().defaultEmbeddingProvider ??
        DEFAULT_EMBEDDING_PROVIDER_ID;
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const dataSourceName = getProjectConversationsDatasourceName(space);

      // Check if front DataSourceResource exists
      // This check is inside the lock, so we're guaranteed no concurrent modifications
      let frontDataSource: DataSourceResource | null = null;
      let createdFrontDataSource = false;
      const frontDataSourceRes = await fetchProjectDataSource(auth, space);
      if (frontDataSourceRes.isOk()) {
        frontDataSource = frontDataSourceRes.value;
      } else if (frontDataSourceRes.error.code !== "data_source_not_found") {
        assertNever(frontDataSourceRes.error.code);
      }

      // Determine Core API project and data source IDs
      let coreProjectId: string;
      let coreDataSourceId: string;
      let createdCoreComponents = false;

      if (frontDataSource) {
        // Front data source exists, use its Core API IDs
        coreProjectId = frontDataSource.dustAPIProjectId;
        coreDataSourceId = frontDataSource.dustAPIDataSourceId;

        // Verify Core API data source exists
        const coreDataSourceCheck = await coreAPI.getDataSource({
          projectId: coreProjectId,
          dataSourceId: coreDataSourceId,
        });

        if (coreDataSourceCheck.isErr()) {
          localLogger.warn(
            {
              error: coreDataSourceCheck.error,
              coreProjectId,
              coreDataSourceId,
              dataSourceId: frontDataSource.sId,
            },
            "Front data source exists but Core API data source not found, will delete orphaned front data source and recreate"
          );
          // Delete the orphaned front DataSourceResource to prevent duplicates
          // We're inside a lock, so this is safe
          await frontDataSource.delete(auth, { hardDelete: true });
          // Will create new Core API project and data source below
          frontDataSource = null;
        }
      }

      // Create Core API project if needed
      if (!frontDataSource) {
        createdCoreComponents = true;
        const dustProject = await coreAPI.createProject();
        if (dustProject.isErr()) {
          return new Err(
            new Error(
              `Failed to create internal project for the data source: ${dustProject.error.message}`
            )
          );
        }
        coreProjectId = dustProject.value.project.project_id.toString();

        // Create Core API data source
        const dustDataSource = await coreAPI.createDataSource({
          projectId: coreProjectId,
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
            projectId: coreProjectId,
          });
          return new Err(
            new Error(
              `Failed to create the data source: ${dustDataSource.error.message}`
            )
          );
        }
        coreDataSourceId = dustDataSource.value.data_source.data_source_id;
      } else {
        // Use existing Core API IDs
        coreProjectId = frontDataSource.dustAPIProjectId;
        coreDataSourceId = frontDataSource.dustAPIDataSourceId;
      }

      // Ensure project context folder exists (idempotent via upsert)
      const folder = await coreAPI.upsertDataSourceFolder({
        projectId: coreProjectId,
        dataSourceId: coreDataSourceId,
        folderId: PROJECT_CONTEXT_FOLDER_ID,
        parentId: null,
        parents: [PROJECT_CONTEXT_FOLDER_ID],
        mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONTEXT_FOLDER,
        sourceUrl:
          config.getAppUrl() + getProjectRoute(workspace.sId, space.sId),
        timestamp: null,
        providerVisibility: null,
        title: PROJECT_CONTEXT_FOLDER_NAME,
      });

      if (folder.isErr()) {
        // Only rollback if we just created the Core API components
        if (createdCoreComponents) {
          await coreAPI.deleteDataSource({
            projectId: coreProjectId,
            dataSourceId: coreDataSourceId,
          });
          await coreAPI.deleteProject({
            projectId: coreProjectId,
          });
        }
        return new Err(
          new Error(
            `Failed to create project context folder: ${folder.error.message}`
          )
        );
      }

      // Create front DataSourceResource and DataSourceViewResource if missing
      // No need to re-check here since we're inside a lock - no concurrent modifications possible
      if (!frontDataSource) {
        createdFrontDataSource = true;
        const dataSourceView =
          await DataSourceViewResource.createDataSourceAndDefaultView(
            {
              assistantDefaultSelected:
                isConnectorProviderAssistantDefaultSelected("dust_project"),
              connectorProvider: "dust_project",
              description: `Conversations from project ${space.sId}`,
              dustAPIProjectId: coreProjectId,
              dustAPIDataSourceId: coreDataSourceId,
              name: dataSourceName,
              workspaceId: workspace.id,
            },
            space,
            auth.user()
          );

        frontDataSource = dataSourceView.dataSource;
      } else {
        // Ensure DataSourceViewResource exists
        const dataSourceViewRes = await fetchProjectDataSourceView(auth, space);
        if (dataSourceViewRes.isErr()) {
          localLogger.warn(
            {
              error: dataSourceViewRes.error,
            },
            "Front data source exists but data source view not found, this should not happen"
          );
          // Continue anyway - the view might be created elsewhere or this is a transient state
        }
      }

      // Ensure connector exists
      if (!frontDataSource.connectorId) {
        const connectorsRes = await connectorsAPI.createConnector({
          provider: "dust_project",
          workspaceId: workspace.sId,
          workspaceAPIKey: systemAPIKeyRes.value.secret,
          dataSourceId: frontDataSource.sId,
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

          // Only rollback if we just created everything
          if (createdFrontDataSource && frontDataSource) {
            await frontDataSource.delete(auth, { hardDelete: true });
          }
          if (createdCoreComponents) {
            await coreAPI.deleteDataSource({
              projectId: coreProjectId,
              dataSourceId: coreDataSourceId,
            });
            await coreAPI.deleteProject({
              projectId: coreProjectId,
            });
          }

          return new Err(
            new Error(
              `Failed to create the connector: ${connectorsRes.error.message}`
            )
          );
        }

        // Link connector ID to data source
        await frontDataSource.setConnectorId(connectorsRes.value.id);

        // Trigger initial full sync workflow
        // The full sync workflow will automatically launch incremental sync workflow after completion
        const syncResult = await connectorsAPI.syncConnector(
          connectorsRes.value.id
        );
        if (syncResult.isErr()) {
          localLogger.warn(
            {
              connectorId: connectorsRes.value.id,
              error: syncResult.error,
            },
            "Failed to trigger initial sync for dust_project connector, connector was created but sync may need to be triggered manually"
          );
          // Don't fail connector creation if sync trigger fails - connector can be synced later
        } else {
          localLogger.info(
            {
              connectorId: connectorsRes.value.id,
              workflowId: syncResult.value.workflowId,
            },
            "Triggered initial full sync workflow for dust_project connector (incremental sync will start automatically after full sync completes)"
          );
        }

        localLogger.info(
          {
            connectorId: connectorsRes.value.id,
            dataSourceId: frontDataSource.sId,
          },
          "Successfully created dust_project connector for project"
        );
      } else {
        // Verify connector exists
        const connectorCheck = await connectorsAPI.getConnector(
          frontDataSource.connectorId
        );
        if (connectorCheck.isErr()) {
          localLogger.warn(
            {
              connectorId: frontDataSource.connectorId,
              error: connectorCheck.error,
            },
            "Front data source has connectorId but connector not found, will recreate connector"
          );

          // Clear the connectorId and recreate
          await frontDataSource.setConnectorId(null);

          const connectorsRes = await connectorsAPI.createConnector({
            provider: "dust_project",
            workspaceId: workspace.sId,
            workspaceAPIKey: systemAPIKeyRes.value.secret,
            dataSourceId: frontDataSource.sId,
            connectionId: space.sId,
            configuration: null,
          });

          if (connectorsRes.isErr()) {
            return new Err(
              new Error(
                `Failed to recreate the connector: ${connectorsRes.error.message}`
              )
            );
          }

          await frontDataSource.setConnectorId(connectorsRes.value.id);

          // Trigger sync for recreated connector
          const syncResult = await connectorsAPI.syncConnector(
            connectorsRes.value.id
          );
          if (syncResult.isErr()) {
            localLogger.warn(
              {
                connectorId: connectorsRes.value.id,
                error: syncResult.error,
              },
              "Failed to trigger sync for recreated connector"
            );
          }
        } else {
          localLogger.info(
            {
              connectorId: frontDataSource.connectorId,
              dataSourceId: frontDataSource.sId,
            },
            "All components already exist for dust_project connector"
          );
        }
      }

      return new Ok(undefined);
    } catch (error) {
      localLogger.error(
        { error },
        "Failed to create dust_project connector for project"
      );
      return new Err(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
